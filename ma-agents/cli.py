#!/usr/bin/env python3
"""
CLI entry point for the MA Agent Factory.

Usage:
  # Create a single agent
  python cli.py create nda

  # Create multiple agents
  python cli.py create nda loi teaser info_memo

  # Create all supported agent types
  python cli.py create-all

  # List available document types
  python cli.py list-types

  # Use local files instead of SharePoint
  python cli.py create nda --local

  # Custom settings
  python cli.py create nda --max-loops 3 --min-score 7.5 --max-examples 5
"""

from __future__ import annotations

import argparse
import logging
import sys

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from config import MAX_BUILDER_REVIEWER_LOOPS, MIN_REVIEW_SCORE, MAX_EXAMPLES
from models import DocType
from orchestrator import Orchestrator

console = Console()


def parse_doc_type(value: str) -> DocType:
    """Parse a doc type string to DocType enum."""
    value = value.lower().strip()
    try:
        return DocType(value)
    except ValueError:
        # Try matching partial names
        for dt in DocType:
            if value in dt.value:
                return dt
        raise argparse.ArgumentTypeError(
            f"Unknown document type: '{value}'. Use 'list-types' to see available types."
        )


def cmd_create(args):
    """Create one or more M&A agents."""
    doc_types = [parse_doc_type(dt) for dt in args.doc_types]

    orch = Orchestrator(
        max_loops=args.max_loops,
        min_score=args.min_score,
        max_examples=args.max_examples,
        use_local=args.local,
    )

    if len(doc_types) == 1:
        result = orch.create_agent(doc_types[0])
        sys.exit(0 if result.status == "approved" else 1)
    else:
        results = orch.create_agents(doc_types)
        approved = sum(1 for r in results if r.status == "approved")
        console.print(f"\n[bold]{approved}/{len(results)} agents approuvés[/bold]")
        sys.exit(0 if approved == len(results) else 1)


def cmd_create_all(args):
    """Create agents for all document types."""
    all_types = [dt for dt in DocType if dt != DocType.CUSTOM]

    orch = Orchestrator(
        max_loops=args.max_loops,
        min_score=args.min_score,
        max_examples=args.max_examples,
        use_local=args.local,
    )

    results = orch.create_agents(all_types)
    approved = sum(1 for r in results if r.status == "approved")
    console.print(f"\n[bold]{approved}/{len(results)} agents approuvés[/bold]")


def cmd_list_types(_args):
    """List all available document types."""
    table = Table(title="Types de documents M&A supportés")
    table.add_column("Code", style="cyan")
    table.add_column("Description", style="white")
    type_descriptions = {
        DocType.NDA: "Non-Disclosure Agreement / Accord de confidentialité",
        DocType.LOI: "Letter of Intent / Lettre d'intention",
        DocType.SPA: "Share Purchase Agreement / Contrat de cession d'actions",
        DocType.TERM_SHEET: "Term Sheet / Conditions indicatives",
        DocType.DUE_DILIGENCE: "Due Diligence checklist & report",
        DocType.INFO_MEMO: "Information Memorandum / CIM",
        DocType.TEASER: "Teaser / Blind profile",
        DocType.MANAGEMENT_PRESENTATION: "Management Presentation",
        DocType.DATA_ROOM_INDEX: "Data Room / VDR Index",
        DocType.PROCESS_LETTER: "Process Letter / Lettre de process",
        DocType.FINANCIAL_MODEL: "Financial Model / Modèle financier",
        DocType.VALUATION: "Valuation / DCF / Multiples",
        DocType.CLOSING_CHECKLIST: "Closing Checklist / Conditions precedent",
        DocType.CUSTOM: "Custom document type",
    }
    for dt in DocType:
        table.add_row(dt.value, type_descriptions.get(dt, ""))
    console.print(table)


def cmd_update_pu(args):
    """Run the daily PU update for a deal."""
    from daily_runner import DailyRunner

    keywords = args.keywords if args.keywords else [args.deal]
    runner = DailyRunner(
        deal=args.deal,
        user_email=args.user_email,
        deal_keywords=keywords,
        hours=args.hours,
        use_local=args.local,
        local_emails_path=args.emails_file,
    )
    update = runner.run()
    sys.exit(0 if update.pu_markdown else 1)


def cmd_list_todos(args):
    """List the current todos for a deal."""
    from todo_manager import TodoManager

    tm = TodoManager(args.deal)
    console.print(tm.to_markdown(only_active=not args.all))


def cmd_show_pu(args):
    """Show the latest PU for a deal."""
    from pu_agent import PUStore

    store = PUStore(args.deal)
    date, content = store.latest()
    if not content:
        console.print(f"[red]Aucun PU trouvé pour {args.deal}[/red]")
        sys.exit(1)
    console.print(Panel(content, title=f"PU {args.deal} — {date}", border_style="cyan"))


def cmd_run_agent(args):
    """Run a previously created agent to generate a document."""
    import json
    import os
    import anthropic
    from config import AGENTS_DIR, MODEL, ANTHROPIC_API_KEY

    # Find the agent file
    agent_file = args.agent_file
    if not os.path.isabs(agent_file):
        agent_file = os.path.join(AGENTS_DIR, agent_file)

    if not os.path.exists(agent_file):
        # Try glob match
        import glob
        matches = glob.glob(os.path.join(AGENTS_DIR, f"*{args.agent_file}*"))
        if matches:
            agent_file = matches[0]
        else:
            console.print(f"[red]Agent introuvable: {args.agent_file}[/red]")
            sys.exit(1)

    with open(agent_file, "r", encoding="utf-8") as f:
        agent_data = json.load(f)

    agent = agent_data["agent"]
    console.print(f"[cyan]Agent: {agent['name']}[/cyan]")
    console.print(f"[dim]{agent['user_instructions'][:200]}[/dim]\n")

    # Collect inputs from user
    inputs: dict[str, str] = {}
    schema = agent.get("input_schema", {})

    for field in schema.get("required_fields", []):
        name = field["name"]
        desc = field.get("description", name)
        value = input(f"  {desc} [{name}]: ").strip()
        if not value:
            console.print(f"[red]Champ requis: {name}[/red]")
            sys.exit(1)
        inputs[name] = value

    for field in schema.get("optional_fields", []):
        name = field["name"]
        desc = field.get("description", name)
        default = field.get("default", "")
        value = input(f"  {desc} [{name}] ({default}): ").strip()
        inputs[name] = value or default

    # Run the agent
    user_msg = f"Génère le document avec ces informations :\n\n{json.dumps(inputs, ensure_ascii=False, indent=2)}"

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    console.print("\n[yellow]Génération en cours...[/yellow]\n")

    response = client.messages.create(
        model=MODEL,
        max_tokens=16384,
        system=agent["system_prompt"],
        messages=[{"role": "user", "content": user_msg}],
    )

    output = response.content[0].text
    console.print(Panel(output, title=f"Document généré — {agent['name']}", border_style="green"))

    # Save output
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        console.print(f"[green]Sauvegardé: {args.output}[/green]")


def main():
    parser = argparse.ArgumentParser(
        description="MA Agent Factory — Crée des agents M&A automatiquement",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
    subparsers = parser.add_subparsers(dest="command", help="Commande à exécuter")

    # --- create ---
    p_create = subparsers.add_parser("create", help="Créer un ou plusieurs agents M&A")
    p_create.add_argument("doc_types", nargs="+", help="Type(s) de document (ex: nda loi teaser)")
    p_create.add_argument("--local", action="store_true", help="Utiliser des fichiers locaux au lieu de SharePoint")
    p_create.add_argument("--max-loops", type=int, default=MAX_BUILDER_REVIEWER_LOOPS)
    p_create.add_argument("--min-score", type=float, default=MIN_REVIEW_SCORE)
    p_create.add_argument("--max-examples", type=int, default=MAX_EXAMPLES)
    p_create.set_defaults(func=cmd_create)

    # --- create-all ---
    p_all = subparsers.add_parser("create-all", help="Créer des agents pour tous les types")
    p_all.add_argument("--local", action="store_true")
    p_all.add_argument("--max-loops", type=int, default=MAX_BUILDER_REVIEWER_LOOPS)
    p_all.add_argument("--min-score", type=float, default=MIN_REVIEW_SCORE)
    p_all.add_argument("--max-examples", type=int, default=MAX_EXAMPLES)
    p_all.set_defaults(func=cmd_create_all)

    # --- list-types ---
    p_list = subparsers.add_parser("list-types", help="Lister les types de documents supportés")
    p_list.set_defaults(func=cmd_list_types)

    # --- run ---
    p_run = subparsers.add_parser("run", help="Exécuter un agent pour générer un document")
    p_run.add_argument("agent_file", help="Fichier agent JSON (nom ou chemin)")
    p_run.add_argument("-o", "--output", help="Fichier de sortie")
    p_run.set_defaults(func=cmd_run_agent)

    # --- update-pu ---
    p_pu = subparsers.add_parser("update-pu", help="Mise à jour quotidienne du PU (lit mails, met à jour to-do)")
    p_pu.add_argument("deal", help="Nom / code du deal (ex: journey)")
    p_pu.add_argument("--user-email", default="", help="Email de l'utilisateur Outlook")
    p_pu.add_argument("--keywords", nargs="+", help="Mots-clés pour filtrer les mails (défaut: nom du deal)")
    p_pu.add_argument("--hours", type=int, default=24, help="Fenêtre de lecture des mails (h)")
    p_pu.add_argument("--local", action="store_true", help="Utiliser un fichier JSON local au lieu d'Outlook")
    p_pu.add_argument("--emails-file", help="Chemin du fichier JSON de mails (mode local)")
    p_pu.set_defaults(func=cmd_update_pu)

    # --- todos ---
    p_todos = subparsers.add_parser("todos", help="Afficher la to-do list d'un deal")
    p_todos.add_argument("deal", help="Nom du deal")
    p_todos.add_argument("--all", action="store_true", help="Inclure les items terminés")
    p_todos.set_defaults(func=cmd_list_todos)

    # --- show-pu ---
    p_show = subparsers.add_parser("show-pu", help="Afficher le dernier PU d'un deal")
    p_show.add_argument("deal", help="Nom du deal")
    p_show.set_defaults(func=cmd_show_pu)

    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG, format="%(name)s %(levelname)s: %(message)s")
    else:
        logging.basicConfig(level=logging.INFO, format="%(message)s")

    if not args.command:
        parser.print_help()
        sys.exit(0)

    args.func(args)


if __name__ == "__main__":
    main()
