# PR — Document Field Extraction (agentic feature, SDD)

## Summary
Adds the **Document Field Extraction** feature end-to-end: attach a PDF/DOCX to an incident →
a **Temporal workflow** orchestrates fetch → **model call (AWS Bedrock, Claude Opus 4.7)** →
persist → the extracted **Parties / Key Dates / Key Terms** are shown **beside the source**
document on the incident page.

Built with **Spec-Driven Development** — spec → plan → ADRs → code, with approval gates.

## Artifacts (spec/plan/ADR)
- Spec: [`docs/specs/document-field-extraction.md`](specs/document-field-extraction.md) (converged via a writer↔reviewer loop: round 1 scores 2/2/3/3 → round 2 **4/4/4/5 PASS**)
- Plan: [`docs/plans/document-field-extraction-plan.md`](plans/document-field-extraction-plan.md)
- ADR-0001: [orchestrate with Temporal](adrs/0001-orchestrate-extraction-with-temporal.md)
- ADR-0002: [host model on Bedrock](adrs/0002-host-model-on-bedrock.md)

## What shipped
**Backend (Temporal worker, Python — `temporal/`)**
- `DocumentExtractionWorkflow`: `mark_running → fetch_document → extract_fields → persist_extraction`, with the retry/timeout/idempotency policies from the plan. Guard-rail rejections and model errors route to `persist_failure` (row never stays `pending`).
- `extract_fields` is the **only** model call (Bedrock Converse, `global.anthropic.claude-opus-4-7`, af-south-1).
- `gateway.py` (FastAPI) exposes `POST /extractions/{id}/start` (idempotent via workflow id).

**Persistence (Supabase)**
- `supabase/migrations/20260707100000_document_extractions.sql`: `document_extractions` table (status + `result` JSONB + typed `failure_reason`), RLS via `can_see_incident`, grants, `incident-docs` storage bucket.

**Trigger + Frontend**
- Edge function `start-extraction` (JWT-verified) → gateway.
- `ExtractionPanel` on the incident page: source document on the left, extracted fields on the right; spinner while running, "None found" for empty groups, customer-language messages for each failure.

**Ops**
- `temporal/Dockerfile` + `docker-compose.temporal.yml` (Temporal server + UI + worker + gateway).

## Tests → acceptance criteria
`temporal/tests/` — one test per criterion (`test_ac_*`). **15 passed.**
- Story 1: supported DOCX extracts text + pages.
- Story 2: nothing invented; empty groups stay empty ("None found"); non-JSON → non-retryable `model_error`; fenced-JSON salvaged.
- Story 3: multi-party with roles; party without stated role → `role=null` (not invented).
- Edge cases: unsupported type · too large (>20 pages) · password-protected · corrupt · scanned-image/no-text.
- Workflow routing: success persists `succeeded`; rejection persists `failed` **without** calling the paid model; model error persists `model_error`.

## Verification (green)
- Phase 0 Bedrock smoke test: `response: 'Bedrock reachable.'`
- `pytest`: **15 passed** (incl. 3 workflow-routing tests on Temporal's time-skipping test server).
- Frontend `tsc --noEmit`: clean.
- Supabase migration applied to the running local stack.

## Deviations from the plan (called out)
1. **Result stored as one `result` JSONB** on `document_extractions` rather than relational
   child tables — the frontend only displays the three groups beside the source; no
   cross-extraction querying is needed yet. (Flagged in the Phase 2 gate; approved.)
2. **"Beside the source" = filename + download control** next to the fields, not an inline
   PDF/DOCX viewer. Inline preview is deferred (noted as a follow-up), keeping this slice focused.

## Follow-ups
- Inline document preview beside the fields.
- Field-level correction feedback (spec open question) as a workflow signal.
- OCR path for scanned images (currently a clean `no_text` failure).

## Notes for the reviewer
- No secrets committed: `.env`/`temporal/.env` are gitignored; `.env.example` holds placeholders.
- The Bedrock key used in local testing was shared in chat during setup — **rotate it**.
