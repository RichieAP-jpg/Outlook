"""
Reviewer Agent — evaluates M&A agent specifications for quality.
Scores agents, finds weaknesses, and provides improvement suggestions.
The Reviewer acts as an independent critic to ensure high-quality agents.
"""

from __future__ import annotations

import json
import logging

import anthropic

from config import REVIEWER_MODEL, ANTHROPIC_API_KEY
from models import AgentSpec, DocumentPattern, ReviewResult

logger = logging.getLogger(__name__)

REVIEWER_SYSTEM_PROMPT = """\
Tu es un reviewer senior spécialisé en M&A et en conception d'agents IA.
Tu as 20 ans d'expérience en fusions-acquisitions chez les Big 4, en banque
d'affaires et en cabinet d'avocats.

Ton rôle est d'évaluer des spécifications d'agents M&A avec un oeil critique
et constructif. Tu notes chaque agent sur 10 selon ces critères :

**Critères d'évaluation (chacun sur 10) :**

1. **Complétude** (poids 25%) : L'agent couvre-t-il tous les aspects du document ?
   - Toutes les sections clés sont-elles mentionnées ?
   - Les clauses standard sont-elles incluses ?
   - Les edge cases sont-ils gérés ?

2. **Précision juridique/financière** (poids 25%) : Les formulations sont-elles correctes ?
   - Terminologie exacte (pas d'approximations)
   - Conformité aux standards du marché
   - Pas d'erreurs factuelles

3. **Praticité** (poids 20%) : L'agent est-il facile à utiliser ?
   - Le schema d'input est-il clair et complet ?
   - Les instructions utilisateur sont-elles limpides ?
   - Le workflow est-il logique ?

4. **Qualité du system prompt** (poids 20%) : Le prompt est-il bien conçu ?
   - Suffisamment détaillé et spécifique
   - Pas d'ambiguïtés
   - Instructions claires pour le modèle

5. **Fidélité aux exemples** (poids 10%) : L'agent reproduit-il le style des exemples ?
   - Même niveau de formalisme
   - Conventions de rédaction respectées
   - Formatage cohérent

Tu dois être EXIGEANT. Un score de 8+/10 = prêt pour la production.
Un score < 8 signifie que l'agent doit être amélioré.

Sois toujours constructif : chaque faiblesse doit s'accompagner d'une suggestion concrète.
"""

REVIEW_PROMPT = """\
Évalue cette spécification d'agent M&A de type **{doc_type}**.

**Patterns extraits des {num_examples} exemples originaux :**

Structure : {structure}
Sections clés : {key_sections}
Clauses récurrentes : {recurring_clauses}
Champs variables : {variable_fields}
Ton et style : {tone_and_style}

---

**Spécification de l'agent à évaluer :**

```json
{agent_spec}
```

---

Évalue l'agent selon les 5 critères et renvoie ton évaluation en JSON :
{{
  "scores": {{
    "completude": X,
    "precision": X,
    "praticite": X,
    "qualite_prompt": X,
    "fidelite": X
  }},
  "score_global": X.X,
  "passed": true/false,
  "strengths": ["force 1", "force 2", ...],
  "weaknesses": ["faiblesse 1", "faiblesse 2", ...],
  "suggestions": ["suggestion concrète 1", "suggestion concrète 2", ...],
  "detailed_feedback": "Ton analyse détaillée ici..."
}}

Note : passed = true si score_global >= 8.0
"""


class ReviewerAgent:
    """Evaluates M&A agent specifications and provides improvement feedback."""

    def __init__(self, api_key: str = ANTHROPIC_API_KEY, model: str = REVIEWER_MODEL):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def review(self, spec: AgentSpec, pattern: DocumentPattern) -> ReviewResult:
        """Review an agent spec against the original document patterns."""
        spec_json = json.dumps({
            "name": spec.name,
            "version": spec.version,
            "system_prompt": spec.system_prompt,
            "user_instructions": spec.user_instructions,
            "tools": spec.tools,
            "input_schema": spec.input_schema,
            "output_format": spec.output_format,
            "example_output": spec.example_output,
            "workflow_steps": spec.workflow_steps,
        }, ensure_ascii=False, indent=2)

        user_msg = REVIEW_PROMPT.format(
            doc_type=pattern.doc_type.value.replace("_", " ").upper(),
            num_examples=pattern.num_examples,
            structure=pattern.structure,
            key_sections=", ".join(pattern.key_sections),
            recurring_clauses=", ".join(pattern.recurring_clauses[:10]),  # cap for context
            variable_fields=", ".join(pattern.variable_fields),
            tone_and_style=pattern.tone_and_style,
            agent_spec=spec_json,
        )

        logger.info(f"Reviewing agent {spec.name} v{spec.version}...")

        response = self.client.messages.create(
            model=self.model,
            max_tokens=8192,
            system=REVIEWER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        return self._parse_review(response.content[0].text)

    def _parse_review(self, raw_text: str) -> ReviewResult:
        """Parse a ReviewResult from the model's JSON response."""
        json_str = raw_text
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0]
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0]

        try:
            data = json.loads(json_str.strip())
        except json.JSONDecodeError:
            logger.warning("Failed to parse reviewer JSON, extracting what we can")
            return ReviewResult(
                score=0.0,
                passed=False,
                detailed_feedback=raw_text,
                suggestions=["Le reviewer n'a pas pu produire un JSON valide, relancer l'évaluation"],
            )

        score = float(data.get("score_global", 0))
        return ReviewResult(
            score=score,
            passed=data.get("passed", score >= 8.0),
            strengths=data.get("strengths", []),
            weaknesses=data.get("weaknesses", []),
            suggestions=data.get("suggestions", []),
            detailed_feedback=data.get("detailed_feedback", ""),
        )
