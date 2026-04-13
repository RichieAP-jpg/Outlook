"""
Todo Manager — tracks M&A deal action items.
Persists to JSON, supports add/update/close operations.
Used by the PU agent to maintain the daily todo list.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Optional


class TodoStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    CANCELLED = "cancelled"


class TodoPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


@dataclass
class TodoItem:
    id: str                             # stable ID (e.g. "journey-001")
    title: str
    description: str = ""
    owner: str = ""                     # who is responsible
    status: TodoStatus = TodoStatus.OPEN
    priority: TodoPriority = TodoPriority.MEDIUM
    due_date: Optional[str] = None      # ISO date
    created_at: str = ""
    updated_at: str = ""
    deal: str = ""                      # deal name / code
    source_email_id: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    history: list[dict] = field(default_factory=list)  # audit trail


class TodoManager:
    """
    Persistent todo list with audit history.
    Storage: ma-agents/output/<deal>_todos.json
    """

    def __init__(self, deal: str, storage_dir: Optional[str] = None):
        from config import OUTPUT_DIR
        self.deal = deal
        self.storage_dir = storage_dir or OUTPUT_DIR
        os.makedirs(self.storage_dir, exist_ok=True)
        self.file_path = os.path.join(self.storage_dir, f"{deal}_todos.json")
        self.items: dict[str, TodoItem] = {}
        self.load()

    # ------------------------------------------------------------ persistence

    def load(self):
        if not os.path.exists(self.file_path):
            self.items = {}
            return
        with open(self.file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.items = {}
        for item_data in data.get("items", []):
            item = TodoItem(
                id=item_data["id"],
                title=item_data["title"],
                description=item_data.get("description", ""),
                owner=item_data.get("owner", ""),
                status=TodoStatus(item_data.get("status", "open")),
                priority=TodoPriority(item_data.get("priority", "medium")),
                due_date=item_data.get("due_date"),
                created_at=item_data.get("created_at", ""),
                updated_at=item_data.get("updated_at", ""),
                deal=item_data.get("deal", self.deal),
                source_email_id=item_data.get("source_email_id"),
                tags=item_data.get("tags", []),
                history=item_data.get("history", []),
            )
            self.items[item.id] = item

    def save(self):
        data = {
            "deal": self.deal,
            "updated_at": datetime.now().isoformat(),
            "items": [
                {**asdict(item), "status": item.status.value, "priority": item.priority.value}
                for item in self.items.values()
            ],
        }
        with open(self.file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # --------------------------------------------------------------- mutations

    def _next_id(self) -> str:
        n = len(self.items) + 1
        while f"{self.deal}-{n:03d}" in self.items:
            n += 1
        return f"{self.deal}-{n:03d}"

    def add(
        self,
        title: str,
        description: str = "",
        owner: str = "",
        priority: TodoPriority = TodoPriority.MEDIUM,
        due_date: Optional[str] = None,
        source_email_id: Optional[str] = None,
        tags: list[str] | None = None,
    ) -> TodoItem:
        now = datetime.now().isoformat()
        item = TodoItem(
            id=self._next_id(),
            title=title,
            description=description,
            owner=owner,
            priority=priority,
            due_date=due_date,
            created_at=now,
            updated_at=now,
            deal=self.deal,
            source_email_id=source_email_id,
            tags=tags or [],
            history=[{"at": now, "action": "created", "note": ""}],
        )
        self.items[item.id] = item
        return item

    def update(
        self,
        item_id: str,
        status: Optional[TodoStatus] = None,
        priority: Optional[TodoPriority] = None,
        note: str = "",
        owner: Optional[str] = None,
        due_date: Optional[str] = None,
    ) -> Optional[TodoItem]:
        item = self.items.get(item_id)
        if not item:
            return None
        now = datetime.now().isoformat()
        changes: list[str] = []
        if status and status != item.status:
            changes.append(f"status: {item.status.value} → {status.value}")
            item.status = status
        if priority and priority != item.priority:
            changes.append(f"priority: {item.priority.value} → {priority.value}")
            item.priority = priority
        if owner and owner != item.owner:
            changes.append(f"owner: {item.owner} → {owner}")
            item.owner = owner
        if due_date and due_date != item.due_date:
            changes.append(f"due: {item.due_date} → {due_date}")
            item.due_date = due_date

        item.updated_at = now
        item.history.append({
            "at": now,
            "action": "updated",
            "changes": "; ".join(changes),
            "note": note,
        })
        return item

    def close(self, item_id: str, note: str = "") -> Optional[TodoItem]:
        return self.update(item_id, status=TodoStatus.DONE, note=note)

    # ------------------------------------------------------------------ views

    def active(self) -> list[TodoItem]:
        return [i for i in self.items.values() if i.status not in (TodoStatus.DONE, TodoStatus.CANCELLED)]

    def by_status(self, status: TodoStatus) -> list[TodoItem]:
        return [i for i in self.items.values() if i.status == status]

    def to_markdown(self, only_active: bool = True) -> str:
        """Render the todo list as a markdown block for inclusion in the PU."""
        items = self.active() if only_active else list(self.items.values())

        # Group by status
        groups: dict[TodoStatus, list[TodoItem]] = {
            TodoStatus.URGENT: [],
            TodoStatus.OPEN: [],
            TodoStatus.IN_PROGRESS: [],
            TodoStatus.BLOCKED: [],
            TodoStatus.DONE: [],
        }
        for item in items:
            groups.setdefault(item.status, []).append(item)

        priority_emoji = {
            TodoPriority.URGENT: "🔴",
            TodoPriority.HIGH: "🟠",
            TodoPriority.MEDIUM: "🟡",
            TodoPriority.LOW: "🟢",
        }

        lines = [f"## To-Do — {self.deal}", ""]
        for status in [TodoStatus.IN_PROGRESS, TodoStatus.BLOCKED, TodoStatus.OPEN, TodoStatus.DONE]:
            if not groups.get(status):
                continue
            label = {
                TodoStatus.IN_PROGRESS: "En cours",
                TodoStatus.BLOCKED: "Bloqué",
                TodoStatus.OPEN: "À faire",
                TodoStatus.DONE: "Fait",
            }[status]
            lines.append(f"### {label}")
            for item in groups[status]:
                emoji = priority_emoji.get(item.priority, "")
                owner = f" @{item.owner}" if item.owner else ""
                due = f" (due: {item.due_date})" if item.due_date else ""
                lines.append(f"- {emoji} **[{item.id}]** {item.title}{owner}{due}")
                if item.description:
                    lines.append(f"  - {item.description}")
            lines.append("")

        return "\n".join(lines)
