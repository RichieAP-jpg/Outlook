"""
Demo end-to-end du Daily PU Runner sur le deal Journey.

Comme il n'y a pas d'API key dans cet env, on injecte un stub qui remplace
l'appel Claude par une réponse pré-calculée représentative de ce qu'un
vrai agent produirait. Le reste du pipeline (lecture emails, mise à jour
to-do, persistance du PU) tourne pour de vrai.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock

# Réponse simulée de Claude (le résultat du reasoning sur les 8 emails)
STUB_CLAUDE_RESPONSE = {
    "pu_markdown": """# PU Journey — 2026-04-13

## 📋 Résumé exécutif
Journée très active à J-45 du closing. **Déblocage majeur de la DD fiscale** (liasses 2023 reçues, clôture prévue 20/04). **Position de repli earn-out validée par le fondateur** : OK pour EBITDA ajusté mais avec plafond relevé à 5M€ et définition stricte des ajustements. Le SPA v2 a été contre-proposé par Clifford Chance : 32/47 points acceptés, 10 à discuter, **5 red flags** qu'il faudra traiter en priorité. Nouvelle demande de DD opérationnelle (fournisseurs) de Meridian à livrer d'ici vendredi 18/04. Audit IP confirme qu'il faut **disclose le litige Kevin R.** plutôt que porter une rep "clean".

## 🔄 Évolutions depuis le dernier PU
- **DD fiscale débloquée** : Elise a récupéré les liasses 2023, KPMG finalise pour le 20/04
- **Earn-out** : Paul Leclerc valide le compromis (EBITDA ajusté, plafond 5M€ au lieu de 3M€, définition stricte des ajustements)
- **SPA v2** : retour de Clifford Chance — 32 points OK, 10 à discuter, 5 red flags (cap indemnisations à 100%, durée reps fondamentales 7 ans, scope reps IP, MAC clause, escrow)
- **DD financière** : les 12 dernières Q&A sont livrées (churn 4,2%, NRR 94% top 50)
- **KPI retention** : Thomas Rivière signe sa lettre. Julie Moreau (CTO) hésite sur le vesting du bonus de closing
- **Audit IP** : Marques & Co remet ses premières conclusions — portefeuille solide mais **litige Kevin R. à disclose**
- **Nouvelle demande Meridian** : DD opérationnelle sur top 10 fournisseurs + cloud + partenariats, deadline 18/04

## ✅ Points traités / livrables reçus
- Liasses fiscales 2023 déposées en data room (dossier 3.2)
- Réponses Q&A DD financière batch 3/3 livrées (cohortes, churn, NRR)
- Lettre de continuité signée par Thomas Rivière
- Premières conclusions audit IP par Marques & Co
- Contre-proposition SPA v2 reçue de Clifford Chance

## ⚠️ Points d'attention
- **🔴 5 red flags SPA** : à traiter en priorité au call du 15/04 — cap indemnisations, durée reps, reps IP, MAC, escrow
- **🔴 Litige Kevin R.** : Vincent Lambert confirme que la demande reconventionnelle sur co-propriété brevet "n'est pas totalement infondée". **Impact direct sur la négociation reps IP** — il faut basculer vers un disclosure schedule plutôt qu'une rep clean
- **🟠 Julie Moreau (CTO)** : hésite sur son package de rétention. Risque de perdre un KPI, il faut un call Arnaud/Paul rapidement
- **🟠 Earn-out** : position de repli validée mais doit encore être remontée au call avocats du 14/04 à 14h
- **🟡 Demande Meridian fournisseurs** : courte deadline (vendredi 18/04), nécessite mobilisation Elise + équipe ops

## 🎯 Next steps (24-72h)
1. **Confirmer à Paul avant 18h ce soir** que la position de repli earn-out est bien intégrée pour le call du 14/04
2. **Call earn-out** le 14/04 à 14h avec avocats — pousser le compromis (EBITDA ajusté / plafond 5M€ / définition stricte)
3. **Arnaud ou Paul appelle Julie Moreau** d'urgence pour clarifier le vesting du bonus de closing
4. **Préparer la demande Meridian fournisseurs** (top 10, cloud, partenariats) → mobiliser Elise
5. **Finaliser le deck management meeting** (slides Q1 2026 de Marc + Q&A préparatoire relue par Arnaud)
6. **Redéfinir les reps IP** avec un disclosure schedule incluant le litige Kevin R.

## 📅 Prochaines étapes majeures
- 14/04 14h : Call avocats earn-out
- 15/04 10h : Call Clifford Chance / seller sur les 10 points SPA ouverts
- 16/04 : Management meeting (Paul, Thomas, Julie, Marc côté seller / Mark Jensen + Sarah Chen côté Meridian)
- 18/04 : Deadline DD opérationnelle fournisseurs
- 20/04 : Finalisation rapport DD fiscale KPMG
- 22/04 : Retour SPA v3
- 05/05 : Signature SPA
- 28/05 : Closing
""",
    "todo_operations": [
        {
            "action": "update",
            "id": "journey-007",
            "status": "in_progress",
            "note": "Liasses 2023 reçues (Elise, 13/04 matin). KPMG finalise pour le 20/04.",
            "source_email_id": "msg-001"
        },
        {
            "action": "close",
            "id": "journey-001",
            "note": "Batch 3/3 livré par Marc : cohortes, churn 4,2%, NRR 94%. DD financière complète côté réponses."
        },
        {
            "action": "update",
            "id": "journey-003",
            "status": "in_progress",
            "priority": "urgent",
            "note": "Paul a validé la position de repli : OK EBITDA ajusté mais plafond 5M€ (au lieu de 3M€) et définition stricte des ajustements. À confirmer à Paul avant 18h ce soir."
        },
        {
            "action": "update",
            "id": "journey-004",
            "status": "in_progress",
            "note": "Thomas Rivière a signé. Julie Moreau hésite sur vesting bonus de closing."
        },
        {
            "action": "add",
            "title": "Call urgent Julie Moreau (CTO) sur package de rétention",
            "description": "Clarifier le vesting du bonus de closing. Risque de perdre un KPI. Thomas Rivière signale qu'elle est hésitante.",
            "owner": "Arnaud",
            "priority": "urgent",
            "due_date": "2026-04-14",
            "source_email_id": "msg-003",
            "tags": ["kpi", "retention", "cto"]
        },
        {
            "action": "add",
            "title": "Préparer call 15/04 sur les 10 points ouverts SPA + 5 red flags",
            "description": "Red flags à traiter en priorité : cap indemnisations 100%, durée reps fondamentales 7 ans, scope reps IP, MAC clause, mécanisme escrow.",
            "owner": "Arnaud",
            "priority": "urgent",
            "due_date": "2026-04-14",
            "source_email_id": "msg-004",
            "tags": ["spa", "red_flags"]
        },
        {
            "action": "add",
            "title": "Confirmer présence Paul + Julie au management meeting 16/04",
            "description": "Meridian sera représenté par Mark Jensen (MP) et Sarah Chen (Principal). Confirmer à Marie Dubois (Clifford Chance).",
            "owner": "Sophie",
            "priority": "high",
            "due_date": "2026-04-14",
            "source_email_id": "msg-004",
            "tags": ["management_meeting"]
        },
        {
            "action": "update",
            "id": "journey-005",
            "priority": "urgent",
            "note": "Audit Marques & Co confirme que le litige Kevin R. (co-propriété brevet) n'est pas totalement infondé. Recommandation : disclosure schedule plutôt que rep clean. Impact direct sur la discussion reps IP."
        },
        {
            "action": "add",
            "title": "Préparer DD opérationnelle fournisseurs (demande Meridian)",
            "description": "Top 10 fournisseurs (contrats, spend, renouvellements), contrats cloud (AWS/GCP), partenariats (Salesforce, HubSpot), contentieux fournisseurs.",
            "owner": "Elise",
            "priority": "high",
            "due_date": "2026-04-18",
            "source_email_id": "msg-008",
            "tags": ["dd_ops", "fournisseurs"]
        },
        {
            "action": "update",
            "id": "journey-002",
            "note": "Deck à 80%. Manque slides Q1 2026 de Marc (à intégrer). Q&A préparatoire prêt, à relire par Arnaud avant mercredi soir."
        }
    ],
    "reasoning": (
        "8 mails analysés. Points majeurs : (1) DD fiscale débloquée par réception des liasses 2023 "
        "— j'ai remis journey-007 en 'in_progress'. (2) Paul a validé une position de repli sur "
        "l'earn-out (msg-002) — urgence maximale car call demain à 14h. (3) Le retour SPA v2 de "
        "Clifford Chance (msg-004) révèle 5 red flags qu'il faudra traiter au call du 15/04 — "
        "création d'une nouvelle to-do urgente. (4) L'audit IP (msg-006) confirme que le litige "
        "Kevin R. doit être disclose — passage de journey-005 en priorité urgente. (5) Thomas a "
        "signé sa lettre mais Julie hésite — création d'une to-do urgente pour l'appeler. (6) "
        "Nouvelle demande DD ops de Meridian avec deadline serrée (18/04) — création d'une to-do "
        "assignée à Elise. (7) Q&A DD financière livrées — clôture de journey-001."
    )
}


def patch_anthropic():
    """Remplace le client Anthropic par un mock qui retourne notre réponse stub."""
    import anthropic  # noqa: F401 - will be mocked before actual use

    class FakeContent:
        def __init__(self, text: str):
            self.text = text

    class FakeMessage:
        def __init__(self, text: str):
            self.content = [FakeContent(text)]

    class FakeMessages:
        def create(self, **kwargs):
            return FakeMessage(json.dumps(STUB_CLAUDE_RESPONSE, ensure_ascii=False))

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.messages = FakeMessages()

    anthropic.Anthropic = FakeClient  # type: ignore


def main():
    # Patcher anthropic avant l'import des modules qui l'utilisent
    try:
        import anthropic  # ensure module is importable
    except ImportError:
        # Create a minimal fake module if anthropic not installed
        import sys
        import types
        fake_mod = types.ModuleType("anthropic")
        sys.modules["anthropic"] = fake_mod

    patch_anthropic()

    # Now import the real pipeline
    from daily_runner import DailyRunner

    runner = DailyRunner(
        deal="journey",
        deal_keywords=["journey"],
        use_local=True,
        local_emails_path="output/emails_journey_20260413.json",
    )
    runner.run()


if __name__ == "__main__":
    main()
