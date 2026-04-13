"""
Daily Runner — orchestrates the full daily PU update pipeline.

Usage (from CLI or scheduled job):
    runner = DailyRunner(deal="journey", user_email="me@corp.com",
                        deal_keywords=["journey", "project falcon"])
    runner.run()

Can be scheduled via cron / Task Scheduler / GitHub Actions to run every
morning, e.g. at 07:00 local time.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from config import OUTPUT_DIR, SHAREPOINT_TENANT_ID
from email_reader import OutlookEmailReader, LocalEmailReader, Email
from pu_agent import PUAgent, PUStore, PUUpdate
from todo_manager import TodoManager

logger = logging.getLogger(__name__)
console = Console()


class DailyRunner:
    """
    Runs the daily PU update pipeline for a given deal.

    Pipeline:
      1. Load last PU for the deal
      2. Fetch today's emails (filtered by deal keywords)
      3. Load current todo list
      4. Call PUAgent → new PU + todo operations
      5. Apply operations to the todo list
      6. Persist new PU
      7. Display summary
    """

    def __init__(
        self,
        deal: str,
        user_email: str = "",
        deal_keywords: list[str] | None = None,
        hours: int = 24,
        use_local: bool = False,
        local_emails_path: Optional[str] = None,
    ):
        self.deal = deal
        self.user_email = user_email
        self.deal_keywords = deal_keywords or [deal]
        self.hours = hours
        self.use_local = use_local or not SHAREPOINT_TENANT_ID
        self.local_emails_path = local_emails_path or os.path.join(
            OUTPUT_DIR, f"emails_{deal}_{datetime.now().strftime('%Y%m%d')}.json"
        )

        self.pu_store = PUStore(deal)
        self.todo_manager = TodoManager(deal)
        self.pu_agent = PUAgent()

    # ---------------------------------------------------------------- run

    def run(self) -> PUUpdate:
        console.print(Panel(
            f"[bold cyan]Daily PU Update — {self.deal.upper()}[/bold cyan]\n"
            f"Date : {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
            f"Mots-clés : {', '.join(self.deal_keywords)}",
            title="📅 MA Daily Runner",
        ))

        # 1. Load last PU
        last_date, last_pu = self.pu_store.latest()
        if last_pu:
            console.print(f"[blue]Dernier PU : {last_date}[/blue]")
        else:
            console.print(f"[yellow]Pas de PU précédent (premier run)[/yellow]")

        # 2. Fetch emails
        emails = self._fetch_emails()
        console.print(f"[green]✓ {len(emails)} mails récupérés[/green]")
        if emails:
            self._display_emails(emails)

        # 3. Current todos
        active = self.todo_manager.active()
        console.print(f"[blue]To-do active : {len(active)} items[/blue]")

        # 4. Run PU agent
        console.print("[yellow]Génération du PU en cours...[/yellow]")
        update = self.pu_agent.update(
            deal=self.deal,
            emails=emails,
            last_pu=last_pu or "",
            todo_manager=self.todo_manager,
        )

        # 5. Apply operations
        if update.todo_operations:
            console.print(f"[cyan]Application de {len(update.todo_operations)} opérations to-do...[/cyan]")
            self.pu_agent.apply_operations(update, self.todo_manager)
            for op in update.applied_operations:
                console.print(f"  {op}")
        else:
            console.print("[dim]Aucune opération to-do proposée[/dim]")

        # 6. Save new PU (append todo list at the bottom)
        full_pu = update.pu_markdown + "\n\n---\n\n" + self.todo_manager.to_markdown(only_active=True)
        pu_path = self.pu_store.save(update.date, full_pu)
        console.print(f"[green]✓ PU sauvegardé : {pu_path}[/green]")

        # 7. Display summary
        self._display_summary(update)

        return update

    # -------------------------------------------------------------- fetch

    def _fetch_emails(self) -> list[Email]:
        if self.use_local:
            console.print("[dim]Mode local — lecture depuis fichier JSON[/dim]")
            reader = LocalEmailReader(self.local_emails_path)
            emails = reader.fetch_recent()
            # Filter by keywords locally
            if self.deal_keywords:
                kw_lower = [k.lower() for k in self.deal_keywords]
                emails = [
                    e for e in emails
                    if any(k in (e.subject + " " + e.body_text).lower() for k in kw_lower)
                ]
            return emails

        reader = OutlookEmailReader(user_email=self.user_email)
        return reader.fetch_recent(
            hours=self.hours,
            filter_keywords=self.deal_keywords,
        )

    # ------------------------------------------------------------ display

    def _display_emails(self, emails: list[Email]):
        table = Table(title=f"Mails filtrés ({len(emails)})")
        table.add_column("Heure", style="dim", width=8)
        table.add_column("De", style="cyan", width=25)
        table.add_column("Sujet", style="white")
        for e in emails[:15]:
            table.add_row(
                e.received_at.strftime("%H:%M"),
                e.sender[:25],
                e.subject[:70],
            )
        console.print(table)

    def _display_summary(self, update: PUUpdate):
        adds = sum(1 for op in update.todo_operations if op.get("action") == "add")
        updates = sum(1 for op in update.todo_operations if op.get("action") == "update")
        closes = sum(1 for op in update.todo_operations if op.get("action") == "close")

        table = Table(title=f"Résumé PU — {update.date}")
        table.add_column("Métrique", style="cyan")
        table.add_column("Valeur", style="white")
        table.add_row("Mails analysés", str(update.num_emails_analyzed))
        table.add_row("To-do créées", str(adds))
        table.add_row("To-do mises à jour", str(updates))
        table.add_row("To-do clôturées", str(closes))
        table.add_row("To-do actives après run", str(len(self.todo_manager.active())))
        console.print(table)

        if update.reasoning:
            console.print(Panel(update.reasoning, title="🧠 Raisonnement de l'agent", border_style="dim"))
