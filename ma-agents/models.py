"""
Data models for the MA Agent Factory.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class DocType(str, Enum):
    NDA = "nda"
    LOI = "loi"
    SPA = "spa"
    TERM_SHEET = "term_sheet"
    DUE_DILIGENCE = "due_diligence"
    INFO_MEMO = "info_memo"
    TEASER = "teaser"
    MANAGEMENT_PRESENTATION = "management_presentation"
    DATA_ROOM_INDEX = "data_room_index"
    PROCESS_LETTER = "process_letter"
    FINANCIAL_MODEL = "financial_model"
    VALUATION = "valuation"
    CLOSING_CHECKLIST = "closing_checklist"
    CUSTOM = "custom"


@dataclass
class DocumentExample:
    """A document found on SharePoint used as reference."""
    file_name: str
    file_path: str
    doc_type: DocType
    content_text: str  # extracted text
    metadata: dict = field(default_factory=dict)


@dataclass
class DocumentPattern:
    """Patterns extracted from a set of document examples."""
    doc_type: DocType
    num_examples: int
    structure: str          # high-level structure / table of contents
    key_sections: list[str] = field(default_factory=list)
    recurring_clauses: list[str] = field(default_factory=list)
    variable_fields: list[str] = field(default_factory=list)  # fields that change per deal
    tone_and_style: str = ""
    formatting_notes: str = ""
    raw_analysis: str = ""


@dataclass
class AgentSpec:
    """Specification of a generated M&A agent."""
    name: str
    doc_type: DocType
    version: int = 1
    system_prompt: str = ""
    user_instructions: str = ""
    tools: list[str] = field(default_factory=list)
    input_schema: dict = field(default_factory=dict)   # what info the agent needs
    output_format: str = ""
    example_output: str = ""
    workflow_steps: list[str] = field(default_factory=list)


@dataclass
class ReviewResult:
    """Result of a Reviewer Agent evaluation."""
    score: float                    # 0-10
    passed: bool
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    detailed_feedback: str = ""


@dataclass
class AgentBuildResult:
    """Final result of the Builder→Reviewer loop."""
    agent_spec: AgentSpec
    reviews: list[ReviewResult] = field(default_factory=list)
    iterations: int = 0
    final_score: float = 0.0
    status: str = "pending"  # pending | building | reviewing | approved | failed
