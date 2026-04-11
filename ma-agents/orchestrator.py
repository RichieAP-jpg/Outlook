"""
Orchestrator — the meta-agent that drives the full pipeline:

  SharePoint → Analyze → Build → Review → (loop) → Save

This is the brain of the MA Agent Factory. It coordinates:
1. Document discovery on SharePoint (or local files)
2. Pattern analysis via DocumentAnalyzer
3. Agent creation via BuilderAgent
4. Agent review via ReviewerAgent
5. Builder↔Reviewer iteration loop until quality threshold
6. Saving approved agents to disk
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime

from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from config import (
    MAX_BUILDER_REVIEWER_LOOPS,
    MIN_REVIEW_SCORE,
    MAX_EXAMPLES,
    AGENTS_DIR,
    SHAREPOINT_TENANT_ID,
)
from models import (
    DocType,
    DocumentExample,
    DocumentPattern,
    AgentSpec,
    ReviewResult,
    AgentBuildResult,
)
from document_analyzer import DocumentAnalyzer
from builder_agent import BuilderAgent
from reviewer_agent import ReviewerAgent
from sharepoint_client import SharePointClient, LocalFileClient

logger = logging.getLogger(__name__)
console = Console()


class Orchestrator:
    """
    Meta-agent that creates M&A agents through a Builder→Reviewer loop.

    Usage:
        orch = Orchestrator()
        result = orch.create_agent(DocType.NDA)
        # or batch:
        results = orch.create_agents([DocType.NDA, DocType.LOI, DocType.TEASER])
    """

    def __init__(
        self,
        max_loops: int = MAX_BUILDER_REVIEWER_LOOPS,
        min_score: float = MIN_REVIEW_SCORE,
        max_examples: int = MAX_EXAMPLES,
        use_local: bool = False,
    ):
        self.max_loops = max_loops
        self.min_score = min_score
        self.max_examples = max_examples

        # Choose SharePoint or local file client
        if use_local or not SHAREPOINT_TENANT_ID:
            console.print("[yellow]Mode local activé (pas de SharePoint)[/yellow]")
            self.doc_client = LocalFileClient()
        else:
            self.doc_client = SharePointClient()

        self.analyzer = DocumentAnalyzer()
        self.builder = BuilderAgent()
        self.reviewer = ReviewerAgent()

    # ============================================================ Main pipeline

    def create_agent(self, doc_type: DocType, examples: list[DocumentExample] | None = None) -> AgentBuildResult:
        """
        Full pipeline: discover → analyze → build → review → iterate → save.
        Optionally accepts pre-loaded examples.
        """
        result = AgentBuildResult(
            agent_spec=AgentSpec(name="", doc_type=doc_type),
            status="building",
        )

        console.print(Panel(
            f"[bold cyan]Création d'agent : {doc_type.value.upper()}[/bold cyan]\n"
            f"Max itérations: {self.max_loops} | Score min: {self.min_score}/10",
            title="🏭 MA Agent Factory",
        ))

        # --- Step 1: Find examples ---
        if examples is None:
            with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
                task = progress.add_task(f"Recherche d'exemples de {doc_type.value}...", total=None)
                examples = self.doc_client.find_examples(doc_type, self.max_examples)
                progress.update(task, completed=True)

        if not examples:
            console.print(f"[red]Aucun exemple trouvé pour {doc_type.value}.[/red]")
            console.print("[yellow]Astuce: Placez des exemples dans ma-agents/templates/{doc_type.value}/[/yellow]")
            result.status = "failed"
            return result

        console.print(f"[green]✓ {len(examples)} exemples trouvés[/green]")

        # --- Step 2: Analyze patterns ---
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
            task = progress.add_task("Analyse des patterns...", total=None)
            pattern = self.analyzer.analyze(examples)
            progress.update(task, completed=True)

        self._display_pattern(pattern)

        # --- Step 3: Builder↔Reviewer loop ---
        spec = None
        for iteration in range(1, self.max_loops + 1):
            console.print(f"\n[bold]--- Itération {iteration}/{self.max_loops} ---[/bold]")

            # Build (or revise)
            with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
                if spec is None:
                    task = progress.add_task("Builder: création de l'agent...", total=None)
                    spec = self.builder.build(pattern)
                else:
                    task = progress.add_task("Builder: révision de l'agent...", total=None)
                    spec = self.builder.revise(spec, review, pattern)
                progress.update(task, completed=True)

            console.print(f"[blue]Agent: {spec.name} v{spec.version}[/blue]")

            # Review
            with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
                task = progress.add_task("Reviewer: évaluation...", total=None)
                review = self.reviewer.review(spec, pattern)
                progress.update(task, completed=True)

            result.reviews.append(review)
            result.iterations = iteration
            result.final_score = review.score

            self._display_review(review, iteration)

            if review.passed and review.score >= self.min_score:
                console.print(f"[bold green]✓ Agent approuvé ! Score: {review.score}/10[/bold green]")
                result.status = "approved"
                break
            else:
                console.print(f"[yellow]Score {review.score}/10 < {self.min_score} → itération suivante[/yellow]")

        else:
            console.print(f"[red]Max itérations atteint. Meilleur score: {result.final_score}/10[/red]")
            result.status = "max_iterations"

        result.agent_spec = spec

        # --- Step 4: Save agent ---
        saved_path = self._save_agent(spec, pattern, result)
        console.print(f"[green]Agent sauvegardé: {saved_path}[/green]")

        return result

    def create_agents(self, doc_types: list[DocType]) -> list[AgentBuildResult]:
        """Create multiple agents sequentially."""
        results: list[AgentBuildResult] = []
        for i, dt in enumerate(doc_types, 1):
            console.print(f"\n[bold magenta]═══ Agent {i}/{len(doc_types)}: {dt.value.upper()} ═══[/bold magenta]\n")
            results.append(self.create_agent(dt))
        self._display_summary(results)
        return results

    # ============================================================ Display helpers

    def _display_pattern(self, pattern: DocumentPattern):
        table = Table(title=f"Patterns — {pattern.doc_type.value.upper()}")
        table.add_column("Attribut", style="cyan")
        table.add_column("Valeur", style="white")
        table.add_row("Exemples analysés", str(pattern.num_examples))
        table.add_row("Sections clés", ", ".join(pattern.key_sections[:8]))
        table.add_row("Champs variables", ", ".join(pattern.variable_fields[:8]))
        table.add_row("Ton & Style", pattern.tone_and_style[:120])
        console.print(table)

    def _display_review(self, review: ReviewResult, iteration: int):
        status = "[green]PASS[/green]" if review.passed else "[red]FAIL[/red]"
        table = Table(title=f"Review #{iteration} — Score: {review.score}/10 {status}")
        table.add_column("", style="cyan", width=12)
        table.add_column("Détails", style="white")
        table.add_row("Forces", "\n".join(f"+ {s}" for s in review.strengths[:5]))
        table.add_row("Faiblesses", "\n".join(f"- {w}" for w in review.weaknesses[:5]))
        table.add_row("Suggestions", "\n".join(f"→ {s}" for s in review.suggestions[:5]))
        console.print(table)

    def _display_summary(self, results: list[AgentBuildResult]):
        console.print("\n")
        table = Table(title="Résumé — MA Agent Factory")
        table.add_column("Agent", style="cyan")
        table.add_column("Type", style="blue")
        table.add_column("Score", style="yellow")
        table.add_column("Itérations", style="white")
        table.add_column("Status", style="green")
        for r in results:
            status_color = {"approved": "green", "failed": "red", "max_iterations": "yellow"}.get(r.status, "white")
            table.add_row(
                r.agent_spec.name,
                r.agent_spec.doc_type.value,
                f"{r.final_score}/10",
                str(r.iterations),
                f"[{status_color}]{r.status}[/{status_color}]",
            )
        console.print(table)

    # ============================================================ Persistence

    def _save_agent(self, spec: AgentSpec, pattern: DocumentPattern, result: AgentBuildResult) -> str:
        """Save agent spec + metadata to disk as JSON."""
        os.makedirs(AGENTS_DIR, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{spec.doc_type.value}_{spec.name}_{timestamp}.json"
        filepath = os.path.join(AGENTS_DIR, filename)

        data = {
            "agent": {
                "name": spec.name,
                "doc_type": spec.doc_type.value,
                "version": spec.version,
                "system_prompt": spec.system_prompt,
                "user_instructions": spec.user_instructions,
                "tools": spec.tools,
                "input_schema": spec.input_schema,
                "output_format": spec.output_format,
                "example_output": spec.example_output,
                "workflow_steps": spec.workflow_steps,
            },
            "metadata": {
                "created_at": timestamp,
                "iterations": result.iterations,
                "final_score": result.final_score,
                "status": result.status,
                "num_examples_analyzed": pattern.num_examples,
                "pattern_summary": {
                    "structure": pattern.structure[:500],
                    "key_sections": pattern.key_sections,
                    "variable_fields": pattern.variable_fields,
                },
            },
            "review_history": [
                {
                    "score": r.score,
                    "passed": r.passed,
                    "strengths": r.strengths,
                    "weaknesses": r.weaknesses,
                    "suggestions": r.suggestions,
                }
                for r in result.reviews
            ],
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        return filepath
