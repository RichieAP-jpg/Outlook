"""
PU Agent — Daily Point d'Update updater.

Given:
  - the last PU (previous daily update)
  - today's emails (filtered by deal)
  - the current todo list
Produces:
  - a new PU document (markdown)
  - a list of todo operations (add/update/close) to apply

The agent reasons step-by-step: what changed since the last PU, what actions
each email implies, what's new/resolved/blocked, and what belongs in the todo.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import anthropic

from config import MODEL, ANTHROPIC_API_KEY, OUTPUT_DIR
from email_reader import Email
from todo_manager import TodoManager, TodoItem, TodoStatus, TodoPriority

logger = logging.getLogger(__name__)


PU_SYSTEM_PROMPT = """\
Tu es un analyste M&A senior qui rédige le **Point d'Update (PU) quotidien**
d'un deal. Ton rôle est d'analyser les emails du jour et le PU de la veille
pour produire un nouveau PU et mettre à jour la to-do list.

Tu raisonnes comme un associé qui gère un portefeuille de deals :
- Qu'est-ce qui a bougé depuis hier ?
- Quels sont les next steps critiques ?
- Qu'est-ce qui bloque ?
- Quels sont les risques émergents ?
- Qui doit faire quoi, pour quand ?

Tu identifies rigoureusement dans les mails :
- Les **décisions** prises (par qui, sur quoi)
- Les **demandes** (de qui, pour qui, deadline)
- Les **livrables reçus** (data room, réponses Q&A, due diligence)
- Les **points bloquants** (sujets en attente, désaccords)
- Les **nouveaux intervenants** (avocats, experts, contreparties)
- Les **changements de planning** (dates déplacées, nouvelles étapes)

Pour chaque mail important, tu dois décider :
- Faut-il **créer** une nouvelle to-do ?
- Faut-il **mettre à jour** une to-do existante (status, owner, priorité) ?
- Faut-il **clôturer** une to-do (si l'action est accomplie) ?

Tu es concis, factuel, et tu ne inventes JAMAIS d'info qui n'est pas dans les sources.
Si quelque chose est ambigu, tu le signales explicitement.
"""

PU_USER_PROMPT = """\
Deal : **{deal}**
Date du jour : **{today}**

---

## PU de la veille

```markdown
{last_pu}
```

---

## To-Do actuelle

```markdown
{current_todos}
```

---

## Emails reçus depuis le dernier PU ({num_emails} mails)

{emails_block}

---

## Ta mission

1. **Analyse** ce qui a bougé depuis le PU de la veille
2. **Rédige** le nouveau PU du jour (markdown) qui inclut :
   - 📋 Résumé exécutif (3-5 lignes)
   - 🔄 Évolutions depuis le dernier PU
   - ✅ Points traités / livrables reçus
   - ⚠️ Points d'attention / risques
   - 🎯 Next steps (court terme : 24-72h)
   - 📅 Prochaines étapes majeures
3. **Propose** les opérations to-do à appliquer

Réponds en JSON avec cette structure exacte :

```json
{{
  "pu_markdown": "# PU {deal} — {today}\\n\\n## 📋 Résumé exécutif\\n...",
  "todo_operations": [
    {{
      "action": "add",
      "title": "...",
      "description": "...",
      "owner": "...",
      "priority": "urgent|high|medium|low",
      "due_date": "YYYY-MM-DD ou null",
      "source_email_id": "id du mail source ou null",
      "tags": ["tag1"]
    }},
    {{
      "action": "update",
      "id": "deal-001",
      "status": "open|in_progress|blocked|done|cancelled",
      "priority": "...",
      "note": "pourquoi cette mise à jour"
    }},
    {{
      "action": "close",
      "id": "deal-002",
      "note": "livré / traité le ..."
    }}
  ],
  "reasoning": "Ton raisonnement : qu'est-ce qui a changé, pourquoi ces opérations"
}}
```
"""


@dataclass
class PUUpdate:
    """Result of a daily PU update."""
    deal: str
    date: str
    pu_markdown: str
    todo_operations: list[dict] = field(default_factory=list)
    reasoning: str = ""
    num_emails_analyzed: int = 0
    applied_operations: list[str] = field(default_factory=list)


class PUAgent:
    """Daily Point d'Update agent."""

    def __init__(self, api_key: str = ANTHROPIC_API_KEY, model: str = MODEL):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def update(
        self,
        deal: str,
        emails: list[Email],
        last_pu: str = "",
        todo_manager: Optional[TodoManager] = None,
    ) -> PUUpdate:
        """
        Generate the new PU and list of todo operations.
        Does NOT apply the operations — call apply_operations() to commit.
        """
        today = datetime.now().strftime("%Y-%m-%d")

        if todo_manager is None:
            todo_manager = TodoManager(deal)

        current_todos = todo_manager.to_markdown(only_active=True) or "_(aucune to-do active)_"

        emails_block = self._format_emails(emails) or "_(aucun mail depuis le dernier PU)_"

        user_msg = PU_USER_PROMPT.format(
            deal=deal,
            today=today,
            last_pu=last_pu or "_(aucun PU précédent — c'est le premier)_",
            current_todos=current_todos,
            num_emails=len(emails),
            emails_block=emails_block,
        )

        logger.info(f"Generating PU for {deal} ({today}) with {len(emails)} emails")

        response = self.client.messages.create(
            model=self.model,
            max_tokens=16384,
            system=PU_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        raw_text = response.content[0].text
        data = self._parse_json(raw_text)

        return PUUpdate(
            deal=deal,
            date=today,
            pu_markdown=data.get("pu_markdown", raw_text),
            todo_operations=data.get("todo_operations", []),
            reasoning=data.get("reasoning", ""),
            num_emails_analyzed=len(emails),
        )

    def apply_operations(self, update: PUUpdate, todo_manager: TodoManager) -> PUUpdate:
        """Apply the todo operations from an update onto the todo manager."""
        applied: list[str] = []

        for op in update.todo_operations:
            action = op.get("action", "").lower()
            try:
                if action == "add":
                    item = todo_manager.add(
                        title=op.get("title", ""),
                        description=op.get("description", ""),
                        owner=op.get("owner", ""),
                        priority=self._parse_priority(op.get("priority", "medium")),
                        due_date=op.get("due_date"),
                        source_email_id=op.get("source_email_id"),
                        tags=op.get("tags", []),
                    )
                    applied.append(f"+ [{item.id}] {item.title}")

                elif action == "update":
                    item_id = op.get("id", "")
                    status = self._parse_status(op.get("status")) if op.get("status") else None
                    priority = self._parse_priority(op.get("priority")) if op.get("priority") else None
                    item = todo_manager.update(
                        item_id=item_id,
                        status=status,
                        priority=priority,
                        owner=op.get("owner"),
                        due_date=op.get("due_date"),
                        note=op.get("note", ""),
                    )
                    if item:
                        applied.append(f"~ [{item.id}] {op.get('note', '')}")

                elif action == "close":
                    item_id = op.get("id", "")
                    item = todo_manager.close(item_id, note=op.get("note", ""))
                    if item:
                        applied.append(f"✓ [{item.id}] closed: {op.get('note', '')}")

            except Exception as e:
                logger.warning(f"Failed to apply operation {op}: {e}")

        todo_manager.save()
        update.applied_operations = applied
        return update

    # ----------------------------------------------------------- formatting

    @staticmethod
    def _format_emails(emails: list[Email]) -> str:
        """Format emails for the prompt — compact but complete."""
        if not emails:
            return ""
        # Keep body short to fit many mails in context
        max_body_chars = 2000
        parts: list[str] = []
        for i, email in enumerate(emails, 1):
            body = email.body_text[:max_body_chars]
            if len(email.body_text) > max_body_chars:
                body += "\n[... tronqué ...]"
            parts.append(
                f"### Mail #{i} — id: {email.id}\n"
                f"**De :** {email.sender} <{email.sender_email}>\n"
                f"**Reçu :** {email.received_at.isoformat()}\n"
                f"**Sujet :** {email.subject}\n"
                f"**Importance :** {email.importance}\n\n"
                f"{body}"
            )
        return "\n\n---\n\n".join(parts)

    @staticmethod
    def _parse_json(raw_text: str) -> dict:
        json_str = raw_text
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0]
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0]
        try:
            return json.loads(json_str.strip())
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse PU JSON: {e}")
            return {}

    @staticmethod
    def _parse_status(value: str | None) -> Optional[TodoStatus]:
        if not value:
            return None
        try:
            return TodoStatus(value.lower())
        except ValueError:
            return None

    @staticmethod
    def _parse_priority(value: str | None) -> TodoPriority:
        if not value:
            return TodoPriority.MEDIUM
        try:
            return TodoPriority(value.lower())
        except ValueError:
            return TodoPriority.MEDIUM


# ---------------------------------------------------------- PU persistence

class PUStore:
    """Reads/writes PU documents to disk. One file per deal per day."""

    def __init__(self, deal: str, storage_dir: Optional[str] = None):
        self.deal = deal
        self.storage_dir = storage_dir or os.path.join(OUTPUT_DIR, "pu", deal)
        os.makedirs(self.storage_dir, exist_ok=True)

    def latest(self) -> tuple[str, Optional[str]]:
        """Return (date, content) of the most recent PU, or ('', None) if none."""
        files = sorted(f for f in os.listdir(self.storage_dir) if f.endswith(".md"))
        if not files:
            return "", None
        latest = files[-1]
        date = latest.replace(".md", "")
        with open(os.path.join(self.storage_dir, latest), "r", encoding="utf-8") as f:
            return date, f.read()

    def save(self, date: str, content: str) -> str:
        path = os.path.join(self.storage_dir, f"{date}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path
