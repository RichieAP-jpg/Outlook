"""
Builder Agent — creates M&A agent specifications from document patterns.
Takes the output of DocumentAnalyzer and generates a complete AgentSpec.
"""

from __future__ import annotations

import json
import logging

import anthropic

from config import BUILDER_MODEL, ANTHROPIC_API_KEY
from models import AgentSpec, DocumentPattern, ReviewResult

logger = logging.getLogger(__name__)

BUILDER_SYSTEM_PROMPT = """\
Tu es un expert en création d'agents IA spécialisés dans le M&A (fusions-acquisitions).

Ton rôle est de créer des spécifications complètes d'agents capables de générer
des documents M&A de haute qualité. Chaque agent que tu crées doit être autonome
et produire des documents professionnels qui suivent les standards du marché.

Tu connais parfaitement :
- Les processus M&A (sell-side, buy-side, deal management)
- Les documents juridiques et financiers associés
- Les conventions de rédaction française et anglaise
- Les attentes des cabinets d'avocats, banques d'affaires et fonds d'investissement

Quand tu crées un agent, pense à :
1. Un system prompt détaillé qui capture l'expertise nécessaire
2. Des instructions utilisateur claires sur les inputs attendus
3. Le format de sortie précis
4. Les étapes du workflow de génération
5. Un schema d'input qui liste tous les champs nécessaires
"""

BUILD_PROMPT = """\
Crée un agent spécialisé pour générer des documents de type **{doc_type}**.

Voici l'analyse de {num_examples} exemples réels de ce type de document :

**Structure commune :**
{structure}

**Sections clés :**
{key_sections}

**Clauses récurrentes :**
{recurring_clauses}

**Champs variables (à remplir par l'utilisateur) :**
{variable_fields}

**Ton et style :**
{tone_and_style}

**Notes de formatage :**
{formatting_notes}

---

Génère une spécification d'agent complète en JSON avec cette structure :
{{
  "name": "nom_de_l_agent",
  "system_prompt": "Le system prompt complet et détaillé de l'agent...",
  "user_instructions": "Les instructions à afficher à l'utilisateur...",
  "tools": ["outil1", "outil2"],
  "input_schema": {{
    "required_fields": [
      {{"name": "field_name", "type": "string", "description": "..."}}
    ],
    "optional_fields": [
      {{"name": "field_name", "type": "string", "description": "...", "default": "..."}}
    ]
  }},
  "output_format": "Description du format de sortie attendu",
  "example_output": "Un court extrait montrant le style de sortie",
  "workflow_steps": ["étape 1", "étape 2", ...]
}}

Le system prompt doit être TRÈS détaillé (minimum 500 mots) et inclure :
- Le rôle exact de l'agent
- Les conventions de rédaction spécifiques
- La structure du document à générer
- Les clauses types à inclure
- Les formulations récurrentes
- Les pièges à éviter
"""

REVISE_PROMPT = """\
L'agent que tu as créé a été évalué par un Reviewer. Voici son feedback :

**Score : {score}/10**

**Forces :**
{strengths}

**Faiblesses :**
{weaknesses}

**Suggestions d'amélioration :**
{suggestions}

**Feedback détaillé :**
{detailed_feedback}

---

**Spécification actuelle de l'agent :**
{current_spec}

---

Corrige et améliore la spécification de l'agent en tenant compte de TOUTES les
suggestions du Reviewer. Renvoie la spécification complète mise à jour au même
format JSON.
"""


class BuilderAgent:
    """Creates and iterates on M&A agent specifications."""

    def __init__(self, api_key: str = ANTHROPIC_API_KEY, model: str = BUILDER_MODEL):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def build(self, pattern: DocumentPattern) -> AgentSpec:
        """Create an initial agent spec from document patterns."""
        user_msg = BUILD_PROMPT.format(
            doc_type=pattern.doc_type.value.replace("_", " ").upper(),
            num_examples=pattern.num_examples,
            structure=pattern.structure,
            key_sections="\n".join(f"- {s}" for s in pattern.key_sections),
            recurring_clauses="\n".join(f"- {c}" for c in pattern.recurring_clauses),
            variable_fields="\n".join(f"- {f}" for f in pattern.variable_fields),
            tone_and_style=pattern.tone_and_style,
            formatting_notes=pattern.formatting_notes,
        )

        logger.info(f"Building agent for {pattern.doc_type.value}...")

        response = self.client.messages.create(
            model=self.model,
            max_tokens=16384,
            system=BUILDER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        return self._parse_spec(response.content[0].text, pattern.doc_type)

    def revise(self, current_spec: AgentSpec, review: ReviewResult, pattern: DocumentPattern) -> AgentSpec:
        """Revise an agent spec based on reviewer feedback."""
        spec_json = json.dumps({
            "name": current_spec.name,
            "system_prompt": current_spec.system_prompt,
            "user_instructions": current_spec.user_instructions,
            "tools": current_spec.tools,
            "input_schema": current_spec.input_schema,
            "output_format": current_spec.output_format,
            "example_output": current_spec.example_output,
            "workflow_steps": current_spec.workflow_steps,
        }, ensure_ascii=False, indent=2)

        user_msg = REVISE_PROMPT.format(
            score=review.score,
            strengths="\n".join(f"- {s}" for s in review.strengths),
            weaknesses="\n".join(f"- {w}" for w in review.weaknesses),
            suggestions="\n".join(f"- {s}" for s in review.suggestions),
            detailed_feedback=review.detailed_feedback,
            current_spec=spec_json,
        )

        logger.info(f"Revising agent {current_spec.name} (v{current_spec.version})...")

        response = self.client.messages.create(
            model=self.model,
            max_tokens=16384,
            system=BUILDER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        spec = self._parse_spec(response.content[0].text, pattern.doc_type)
        spec.version = current_spec.version + 1
        return spec

    def _parse_spec(self, raw_text: str, doc_type: DocType) -> AgentSpec:
        """Parse an AgentSpec from the model's JSON response."""
        json_str = raw_text
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0]
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0]

        try:
            data = json.loads(json_str.strip())
        except json.JSONDecodeError:
            logger.error(f"Failed to parse builder response as JSON")
            raise ValueError(f"Builder produced invalid JSON:\n{raw_text[:500]}")

        return AgentSpec(
            name=data.get("name", f"agent_{doc_type.value}"),
            doc_type=doc_type,
            system_prompt=data.get("system_prompt", ""),
            user_instructions=data.get("user_instructions", ""),
            tools=data.get("tools", []),
            input_schema=data.get("input_schema", {}),
            output_format=data.get("output_format", ""),
            example_output=data.get("example_output", ""),
            workflow_steps=data.get("workflow_steps", []),
        )
