# MA Agent Factory

Système de création automatique d'agents M&A par un pipeline **Builder → Reviewer**.

## Concept

```
SharePoint/Local Files → Document Analyzer → Builder Agent → Reviewer Agent
                                                    ↑              ↓
                                                    └── Feedback ──┘
                                                          (loop)
                                                            ↓
                                                    Agent approuvé → agents/
```

1. **Crawl** SharePoint (ou dossier local) pour trouver ~10 exemples d'un type de document
2. **Analyze** les patterns communs (structure, clauses, champs variables, style)
3. **Build** un agent spécialisé (system prompt, schema d'input, workflow)
4. **Review** l'agent contre les patterns originaux (score /10)
5. **Iterate** Builder↔Reviewer jusqu'à score ≥ 8/10
6. **Save** l'agent approuvé en JSON, prêt à l'emploi

## Quickstart

```bash
cd ma-agents
pip install -r requirements.txt

# Définir la clé API
export ANTHROPIC_API_KEY="sk-ant-..."

# Mode local (sans SharePoint) — placer des exemples dans templates/<type>/
python cli.py create nda --local

# Avec SharePoint
export SHAREPOINT_TENANT_ID="..."
export SHAREPOINT_CLIENT_ID="..."
export SHAREPOINT_CLIENT_SECRET="..."
export SHAREPOINT_SITE_URL="contoso.sharepoint.com:/sites/MA-Deals"
python cli.py create nda loi teaser

# Créer tous les types d'agents
python cli.py create-all

# Lister les types supportés
python cli.py list-types

# Exécuter un agent créé pour générer un document
python cli.py run nda_agent_20240101.json -o output/mon_nda.md
```

## Types de documents supportés

| Code | Description |
|------|-------------|
| `nda` | Non-Disclosure Agreement |
| `loi` | Letter of Intent |
| `spa` | Share Purchase Agreement |
| `term_sheet` | Term Sheet |
| `due_diligence` | DD Checklist & Report |
| `info_memo` | Information Memorandum / CIM |
| `teaser` | Teaser / Blind Profile |
| `management_presentation` | Management Presentation |
| `data_room_index` | Data Room / VDR Index |
| `process_letter` | Process Letter |
| `financial_model` | Financial Model |
| `valuation` | Valuation / DCF / Multiples |
| `closing_checklist` | Closing Checklist |

## Architecture

```
ma-agents/
├── cli.py                  # Point d'entrée CLI
├── orchestrator.py         # Meta-agent : pipeline complet
├── builder_agent.py        # Crée des agents M&A
├── reviewer_agent.py       # Évalue et critique les agents
├── document_analyzer.py    # Extrait des patterns des exemples
├── sharepoint_client.py    # Client SharePoint + fallback local
├── models.py               # Data models (Pydantic-style)
├── config.py               # Configuration (env vars)
├── agents/                 # Agents générés (JSON)
├── templates/              # Exemples locaux par type
│   ├── nda/
│   ├── loi/
│   └── ...
└── output/                 # Documents générés
```

## Configuration

| Variable d'environnement | Description | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic | requis |
| `MA_MODEL` | Modèle par défaut | claude-sonnet-4-6 |
| `MA_BUILDER_MODEL` | Modèle du Builder | = MA_MODEL |
| `MA_REVIEWER_MODEL` | Modèle du Reviewer | = MA_MODEL |
| `SHAREPOINT_TENANT_ID` | Azure AD tenant | - |
| `SHAREPOINT_CLIENT_ID` | App registration ID | - |
| `SHAREPOINT_CLIENT_SECRET` | App secret | - |
| `SHAREPOINT_SITE_URL` | URL du site SharePoint | - |
| `MA_MAX_LOOPS` | Max itérations Builder↔Reviewer | 5 |
| `MA_MIN_SCORE` | Score minimum pour approbation | 8.0 |
| `MA_MAX_EXAMPLES` | Nombre max d'exemples à analyser | 10 |
