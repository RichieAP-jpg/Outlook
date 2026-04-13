"""
Email reader — fetches Outlook emails via Microsoft Graph API.
Used by the PU agent to read the day's deal-related mails.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import msal
import requests

from config import (
    SHAREPOINT_TENANT_ID,
    SHAREPOINT_CLIENT_ID,
    SHAREPOINT_CLIENT_SECRET,
)

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


@dataclass
class Email:
    """A simplified email for PU reasoning."""
    id: str
    subject: str
    sender: str
    sender_email: str
    received_at: datetime
    body_text: str
    to_recipients: list[str] = field(default_factory=list)
    cc_recipients: list[str] = field(default_factory=list)
    has_attachments: bool = False
    importance: str = "normal"
    conversation_id: str = ""

    def short_summary(self) -> str:
        """One-line summary for display."""
        return f"[{self.received_at.strftime('%H:%M')}] {self.sender}: {self.subject}"


class OutlookEmailReader:
    """Reads Outlook emails via MS Graph for a given user."""

    def __init__(
        self,
        user_email: str,
        tenant_id: str = SHAREPOINT_TENANT_ID,
        client_id: str = SHAREPOINT_CLIENT_ID,
        client_secret: str = SHAREPOINT_CLIENT_SECRET,
    ):
        self.user_email = user_email
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: Optional[str] = None

    def authenticate(self) -> str:
        """Client credentials flow (app-only permissions: Mail.Read)."""
        if self._token:
            return self._token
        authority = f"https://login.microsoftonline.com/{self.tenant_id}"
        app = msal.ConfidentialClientApplication(
            self.client_id,
            authority=authority,
            client_credential=self.client_secret,
        )
        result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        if "access_token" not in result:
            raise RuntimeError(f"Outlook auth failed: {result.get('error_description', result)}")
        self._token = result["access_token"]
        return self._token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.authenticate()}"}

    def fetch_recent(
        self,
        since: datetime | None = None,
        hours: int = 24,
        max_results: int = 100,
        filter_keywords: list[str] | None = None,
    ) -> list[Email]:
        """
        Fetch recent emails from the user's inbox.

        Args:
            since: Only emails received after this datetime (UTC)
            hours: If `since` is None, fetch emails from the last N hours
            max_results: Max emails to return
            filter_keywords: If set, only keep emails whose subject/body contains
                any of these keywords (deal name, project code, etc.)
        """
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=hours)

        since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")
        url = f"{GRAPH_BASE}/users/{self.user_email}/messages"
        params = {
            "$filter": f"receivedDateTime ge {since_str}",
            "$top": str(max_results),
            "$orderby": "receivedDateTime desc",
            "$select": "id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments,importance,conversationId",
        }

        resp = requests.get(url, headers=self._headers(), params=params, timeout=60)
        resp.raise_for_status()
        items = resp.json().get("value", [])

        emails: list[Email] = []
        for item in items:
            body_content = item.get("body", {}).get("content", "")
            body_type = item.get("body", {}).get("contentType", "text")
            if body_type == "html":
                body_content = self._strip_html(body_content)

            email = Email(
                id=item.get("id", ""),
                subject=item.get("subject", ""),
                sender=item.get("from", {}).get("emailAddress", {}).get("name", ""),
                sender_email=item.get("from", {}).get("emailAddress", {}).get("address", ""),
                received_at=datetime.fromisoformat(item["receivedDateTime"].replace("Z", "+00:00")),
                body_text=body_content[:10_000],  # cap size
                to_recipients=[r["emailAddress"]["address"] for r in item.get("toRecipients", [])],
                cc_recipients=[r["emailAddress"]["address"] for r in item.get("ccRecipients", [])],
                has_attachments=item.get("hasAttachments", False),
                importance=item.get("importance", "normal"),
                conversation_id=item.get("conversationId", ""),
            )

            if filter_keywords:
                haystack = (email.subject + " " + email.body_text).lower()
                if not any(kw.lower() in haystack for kw in filter_keywords):
                    continue

            emails.append(email)

        logger.info(f"Fetched {len(emails)} emails (filter: {filter_keywords})")
        return emails

    @staticmethod
    def _strip_html(html: str) -> str:
        """Very lightweight HTML to text (no BeautifulSoup dep)."""
        import re
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"&nbsp;", " ", text)
        text = re.sub(r"&amp;", "&", text)
        text = re.sub(r"&lt;", "<", text)
        text = re.sub(r"&gt;", ">", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()


# ---------------------------------------------------------- Local fallback

class LocalEmailReader:
    """
    Fallback reader that loads emails from a local JSON file.
    Useful for testing the PU agent without Outlook access.

    Expected format (ma-agents/output/emails_YYYYMMDD.json):
    [
      {
        "subject": "...",
        "sender": "Alice Dupont",
        "sender_email": "alice@corp.com",
        "received_at": "2026-04-13T09:15:00",
        "body_text": "..."
      },
      ...
    ]
    """

    def __init__(self, file_path: str):
        self.file_path = file_path

    def fetch_recent(self, **kwargs) -> list[Email]:
        import json
        import os

        if not os.path.exists(self.file_path):
            logger.warning(f"Local email file not found: {self.file_path}")
            return []

        with open(self.file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        emails: list[Email] = []
        for item in data:
            try:
                received = item.get("received_at", "")
                if isinstance(received, str):
                    received_dt = datetime.fromisoformat(received.replace("Z", "+00:00"))
                    if received_dt.tzinfo is None:
                        received_dt = received_dt.replace(tzinfo=timezone.utc)
                else:
                    received_dt = datetime.now(timezone.utc)

                emails.append(Email(
                    id=item.get("id", ""),
                    subject=item.get("subject", ""),
                    sender=item.get("sender", ""),
                    sender_email=item.get("sender_email", ""),
                    received_at=received_dt,
                    body_text=item.get("body_text", ""),
                    to_recipients=item.get("to_recipients", []),
                    cc_recipients=item.get("cc_recipients", []),
                    has_attachments=item.get("has_attachments", False),
                    importance=item.get("importance", "normal"),
                ))
            except Exception as e:
                logger.warning(f"Failed to parse email: {e}")

        return emails
