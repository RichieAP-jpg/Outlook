"""
Configuration for the MA Agent Factory.
Set env vars or edit defaults here.
"""

import os

# --- Anthropic ---
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = os.environ.get("MA_MODEL", "claude-sonnet-4-6")
BUILDER_MODEL = os.environ.get("MA_BUILDER_MODEL", MODEL)
REVIEWER_MODEL = os.environ.get("MA_REVIEWER_MODEL", MODEL)

# --- SharePoint / Microsoft Graph ---
SHAREPOINT_TENANT_ID = os.environ.get("SHAREPOINT_TENANT_ID", "")
SHAREPOINT_CLIENT_ID = os.environ.get("SHAREPOINT_CLIENT_ID", "")
SHAREPOINT_CLIENT_SECRET = os.environ.get("SHAREPOINT_CLIENT_SECRET", "")
SHAREPOINT_SITE_URL = os.environ.get("SHAREPOINT_SITE_URL", "")  # e.g. "contoso.sharepoint.com:/sites/MA-Deals"

# --- Agent Factory ---
MAX_BUILDER_REVIEWER_LOOPS = int(os.environ.get("MA_MAX_LOOPS", "5"))
MIN_REVIEW_SCORE = float(os.environ.get("MA_MIN_SCORE", "8.0"))  # out of 10
MAX_EXAMPLES = int(os.environ.get("MA_MAX_EXAMPLES", "10"))

# --- Paths ---
AGENTS_DIR = os.path.join(os.path.dirname(__file__), "agents")
TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
