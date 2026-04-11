"""
Document Analyzer — uses Claude to extract patterns from M&A document examples.
Feeds the Builder Agent with structured patterns.
"""

from __future__ import annotations

import json
import logging

import anthropic

from config import MODEL, ANTHROPIC_API_KEY
from models import DocType, DocumentExample, DocumentPattern

logger = logging.getLogger(__name__)

ANALYSIS_SYSTEM_PROMPT = """\
Tu es un expert en M&A (fusions-acquisitions) et en analyse documentaire.
Ton rôle est d'analyser un ensemble d'exemples d'un même type de document M&A
et d'en extraire les patterns récurrents, la structure commune, le style et les
champs variables.

Tu dois produire une analyse structurée qui servira à créer un agent capable
de générer automatiquement ce type de document.
"""

ANALYSIS_USER_PROMPT = """\
Voici {num_examples} exemples de documents de type **{doc_type}** trouvés dans notre SharePoint.

Analyse ces documents et extrais :

1. **Structure commune** : le plan / table des matières qui se retrouve dans la majorité
2. **Sections clés** : les sections présentes dans tous ou presque tous les exemples
3. **Clauses récurrentes** : formulations juridiques ou business qui reviennent
4. **Champs variables** : les éléments qui changent d'un deal à l'autre (noms, dates, montants, etc.)
5. **Ton et style** : formel/informel, langue, conventions de rédaction
6. **Notes de formatage** : mise en page, numérotation, en-têtes, tableaux

Réponds en JSON avec cette structure exacte :
{{
  "structure": "...",
  "key_sections": ["section1", "section2", ...],
  "recurring_clauses": ["clause1", "clause2", ...],
  "variable_fields": ["field1", "field2", ...],
  "tone_and_style": "...",
  "formatting_notes": "..."
}}

--- EXEMPLES ---

{examples_text}
"""


class DocumentAnalyzer:
    """Analyzes a set of document examples to extract reusable patterns."""

    def __init__(self, api_key: str = ANTHROPIC_API_KEY, model: str = MODEL):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def analyze(self, examples: list[DocumentExample]) -> DocumentPattern:
        """Analyze multiple examples and return extracted patterns."""
        if not examples:
            raise ValueError("Need at least one example to analyze")

        doc_type = examples[0].doc_type

        # Build examples text — truncate each to keep context manageable
        max_chars_per_doc = 150_000 // len(examples)
        examples_text_parts: list[str] = []
        for i, ex in enumerate(examples, 1):
            truncated = ex.content_text[:max_chars_per_doc]
            if len(ex.content_text) > max_chars_per_doc:
                truncated += "\n[... tronqué ...]"
            examples_text_parts.append(
                f"### Exemple {i}: {ex.file_name}\n"
                f"Metadata: {json.dumps(ex.metadata, ensure_ascii=False, default=str)}\n\n"
                f"{truncated}"
            )

        examples_text = "\n\n---\n\n".join(examples_text_parts)

        user_msg = ANALYSIS_USER_PROMPT.format(
            num_examples=len(examples),
            doc_type=doc_type.value.replace("_", " ").upper(),
            examples_text=examples_text,
        )

        logger.info(f"Analyzing {len(examples)} examples of {doc_type.value}...")

        response = self.client.messages.create(
            model=self.model,
            max_tokens=8192,
            system=ANALYSIS_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        raw_text = response.content[0].text
        logger.debug(f"Raw analysis response:\n{raw_text}")

        # Parse JSON from response (handle markdown code blocks)
        json_str = raw_text
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0]
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0]

        try:
            data = json.loads(json_str.strip())
        except json.JSONDecodeError:
            logger.warning("Failed to parse analysis JSON, using raw text")
            return DocumentPattern(
                doc_type=doc_type,
                num_examples=len(examples),
                structure=raw_text,
                raw_analysis=raw_text,
            )

        return DocumentPattern(
            doc_type=doc_type,
            num_examples=len(examples),
            structure=data.get("structure", ""),
            key_sections=data.get("key_sections", []),
            recurring_clauses=data.get("recurring_clauses", []),
            variable_fields=data.get("variable_fields", []),
            tone_and_style=data.get("tone_and_style", ""),
            formatting_notes=data.get("formatting_notes", ""),
            raw_analysis=raw_text,
        )
