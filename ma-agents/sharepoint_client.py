"""
SharePoint client using Microsoft Graph API.
Authenticates via MSAL and crawls document libraries to find M&A document examples.
"""

from __future__ import annotations

import io
import logging
from typing import Optional

import msal
import requests
import docx
import openpyxl
import pypdf

from config import (
    SHAREPOINT_TENANT_ID,
    SHAREPOINT_CLIENT_ID,
    SHAREPOINT_CLIENT_SECRET,
    SHAREPOINT_SITE_URL,
    MAX_EXAMPLES,
)
from models import DocType, DocumentExample

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

# Keywords per doc type used to identify documents in SharePoint
DOC_TYPE_KEYWORDS: dict[DocType, list[str]] = {
    DocType.NDA: ["nda", "non-disclosure", "confidentialité", "confidentiality agreement"],
    DocType.LOI: ["loi", "letter of intent", "lettre d'intention", "offre indicative"],
    DocType.SPA: ["spa", "share purchase agreement", "cession d'actions", "stock purchase"],
    DocType.TERM_SHEET: ["term sheet", "term-sheet", "conditions indicatives"],
    DocType.DUE_DILIGENCE: ["due diligence", "dd checklist", "dd report", "audit d'acquisition"],
    DocType.INFO_MEMO: ["information memorandum", "info memo", "mémorandum", "cim"],
    DocType.TEASER: ["teaser", "blind profile", "profil anonyme"],
    DocType.MANAGEMENT_PRESENTATION: ["management presentation", "présentation management"],
    DocType.DATA_ROOM_INDEX: ["data room", "index data room", "vdr index"],
    DocType.PROCESS_LETTER: ["process letter", "lettre de process", "bid letter"],
    DocType.FINANCIAL_MODEL: ["financial model", "modèle financier", "model financier"],
    DocType.VALUATION: ["valuation", "valorisation", "dcf", "multiples"],
    DocType.CLOSING_CHECKLIST: ["closing checklist", "closing memo", "conditions precedent"],
}


class SharePointClient:
    """Connects to SharePoint via MS Graph, searches for M&A docs."""

    def __init__(
        self,
        tenant_id: str = SHAREPOINT_TENANT_ID,
        client_id: str = SHAREPOINT_CLIENT_ID,
        client_secret: str = SHAREPOINT_CLIENT_SECRET,
        site_url: str = SHAREPOINT_SITE_URL,
    ):
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.site_url = site_url
        self._token: Optional[str] = None

    # ------------------------------------------------------------------ auth
    def authenticate(self) -> str:
        """Get an access token via client credentials flow."""
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
            raise RuntimeError(f"SharePoint auth failed: {result.get('error_description', result)}")
        self._token = result["access_token"]
        return self._token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.authenticate()}"}

    # --------------------------------------------------------- site discovery
    def get_site_id(self) -> str:
        """Resolve the SharePoint site id from the site URL."""
        resp = requests.get(
            f"{GRAPH_BASE}/sites/{self.site_url}",
            headers=self._headers(),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["id"]

    def list_drives(self, site_id: str) -> list[dict]:
        """List all document libraries (drives) in the site."""
        resp = requests.get(
            f"{GRAPH_BASE}/sites/{site_id}/drives",
            headers=self._headers(),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("value", [])

    # -------------------------------------------------------- search & crawl
    def search_files(self, site_id: str, query: str, max_results: int = MAX_EXAMPLES) -> list[dict]:
        """Search for files in a SharePoint site using Graph search."""
        resp = requests.get(
            f"{GRAPH_BASE}/sites/{site_id}/drive/root/search(q='{query}')",
            headers=self._headers(),
            params={"$top": max_results},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json().get("value", [])

    def search_across_drives(
        self, site_id: str, doc_type: DocType, max_results: int = MAX_EXAMPLES
    ) -> list[dict]:
        """Search across all drives using multiple keywords for a doc type."""
        keywords = DOC_TYPE_KEYWORDS.get(doc_type, [doc_type.value])
        all_results: list[dict] = []
        seen_ids: set[str] = set()

        for kw in keywords:
            if len(all_results) >= max_results:
                break
            try:
                results = self.search_files(site_id, kw, max_results - len(all_results))
                for item in results:
                    item_id = item.get("id", "")
                    if item_id not in seen_ids:
                        seen_ids.add(item_id)
                        all_results.append(item)
            except Exception as e:
                logger.warning(f"Search failed for keyword '{kw}': {e}")

        return all_results[:max_results]

    # -------------------------------------------------------- download & parse
    def download_file(self, site_id: str, item_id: str) -> bytes:
        """Download a file's content by item id."""
        resp = requests.get(
            f"{GRAPH_BASE}/sites/{site_id}/drive/items/{item_id}/content",
            headers=self._headers(),
            timeout=120,
        )
        resp.raise_for_status()
        return resp.content

    def extract_text(self, file_name: str, content: bytes) -> str:
        """Extract text from common document formats."""
        lower = file_name.lower()

        if lower.endswith((".docx",)):
            return self._extract_docx(content)
        elif lower.endswith((".xlsx", ".xls")):
            return self._extract_xlsx(content)
        elif lower.endswith((".pdf",)):
            return self._extract_pdf(content)
        elif lower.endswith((".txt", ".md", ".csv")):
            return content.decode("utf-8", errors="replace")
        else:
            logger.warning(f"Unsupported format for {file_name}, attempting raw decode")
            return content.decode("utf-8", errors="replace")[:5000]

    @staticmethod
    def _extract_docx(content: bytes) -> str:
        doc = docx.Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        # Also extract tables
        for table in doc.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells]
                paragraphs.append(" | ".join(cells))
        return "\n".join(paragraphs)

    @staticmethod
    def _extract_xlsx(content: bytes) -> str:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        lines: list[str] = []
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            lines.append(f"=== Sheet: {sheet_name} ===")
            for row in ws.iter_rows(values_only=True):
                vals = [str(c) if c is not None else "" for c in row]
                if any(vals):
                    lines.append(" | ".join(vals))
        return "\n".join(lines)

    @staticmethod
    def _extract_pdf(content: bytes) -> str:
        reader = pypdf.PdfReader(io.BytesIO(content))
        pages: list[str] = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages)

    # ------------------------------------------------------ high-level: find examples
    def find_examples(self, doc_type: DocType, max_examples: int = MAX_EXAMPLES) -> list[DocumentExample]:
        """
        End-to-end: authenticate → find site → search → download → extract text.
        Returns a list of DocumentExample ready for analysis.
        """
        site_id = self.get_site_id()
        items = self.search_across_drives(site_id, doc_type, max_examples)
        logger.info(f"Found {len(items)} candidate files for {doc_type.value}")

        examples: list[DocumentExample] = []
        for item in items:
            try:
                file_name = item.get("name", "unknown")
                file_path = item.get("webUrl", item.get("parentReference", {}).get("path", ""))
                raw = self.download_file(site_id, item["id"])
                text = self.extract_text(file_name, raw)

                if len(text.strip()) < 50:
                    logger.warning(f"Skipping {file_name}: extracted text too short")
                    continue

                examples.append(DocumentExample(
                    file_name=file_name,
                    file_path=file_path,
                    doc_type=doc_type,
                    content_text=text,
                    metadata={
                        "size": item.get("size", 0),
                        "created": item.get("createdDateTime", ""),
                        "modified": item.get("lastModifiedDateTime", ""),
                        "author": item.get("createdBy", {}).get("user", {}).get("displayName", ""),
                    },
                ))
            except Exception as e:
                logger.warning(f"Failed to process {item.get('name', '?')}: {e}")

        logger.info(f"Successfully extracted {len(examples)} examples for {doc_type.value}")
        return examples


# -------------------------------------------- Local file fallback (no SharePoint)

class LocalFileClient:
    """
    Fallback client that reads examples from a local directory.
    Useful for testing without SharePoint access.
    Place example documents in ma-agents/templates/<doc_type>/
    """

    def __init__(self, base_dir: str = ""):
        from config import TEMPLATES_DIR
        self.base_dir = base_dir or TEMPLATES_DIR

    def find_examples(self, doc_type: DocType, max_examples: int = MAX_EXAMPLES) -> list[DocumentExample]:
        import os
        import pathlib

        doc_dir = os.path.join(self.base_dir, doc_type.value)
        if not os.path.isdir(doc_dir):
            logger.warning(f"No local examples directory: {doc_dir}")
            return []

        examples: list[DocumentExample] = []
        sp = SharePointClient.__new__(SharePointClient)  # borrow extract methods

        for f in sorted(pathlib.Path(doc_dir).iterdir())[:max_examples]:
            if f.is_file():
                try:
                    raw = f.read_bytes()
                    text = sp.extract_text(f.name, raw)
                    if len(text.strip()) >= 50:
                        examples.append(DocumentExample(
                            file_name=f.name,
                            file_path=str(f),
                            doc_type=doc_type,
                            content_text=text,
                        ))
                except Exception as e:
                    logger.warning(f"Failed to read local file {f.name}: {e}")

        return examples
