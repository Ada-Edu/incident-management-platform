# ADR-0001: Orchestrate Document Field Extraction with a Temporal workflow

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** sifiso.gumede@adaptit.com (with Claude, SDD Phase 2)
- **Supersedes / Superseded by:** —

## Context
The Document Field Extraction feature (see `docs/specs/document-field-extraction.md`) reads an
attached document and calls a hosted model (Bedrock) to extract Parties, Key Dates, and Key
Terms, then persists them to Supabase for display beside the source. The work is:
- **Slow** — a model call over document text can take 30–120s.
- **Failure-prone at the edges** — Bedrock throttles requests on the cross-region inference
  profile; Storage IO can blip; documents can be corrupt, protected, image-only, or too large.
- **Money-sensitive** — the model call is paid; we must not re-run it because a later step
  (persistence) failed.
The spec also requires that deterministic failures are reported clearly with the attachment
retained and **no guessed fields**, and it foreshadows human-in-the-loop correction and OCR.

## Decision
We orchestrate extraction as a **Temporal workflow** (`DocumentExtractionWorkflow`, task queue
`incident-main`) composed of three activities — `fetch_document` → `extract_fields` (the model
call) → `persist_extraction` — with per-activity timeout/retry policies and an idempotent
workflow id `doc-extract-{extraction_id}`. The model call lives **only** in `extract_fields`.

## Consequences
**Easier:** durable execution independent of the browser/HTTP lifecycle; automatic, policy-based
retries with backoff for throttling/transient IO; clean separation so a persistence retry never
re-invokes the paid model call; deterministic failures routed as non-retryable → a clean
`failed` status; future correction/OCR added as a signal/activity without touching the caller.

**Harder / new obligations:** we run and operate a Temporal worker + server (already assumed for
agentic features on this platform); a small HTTP start endpoint on the worker is needed because a
Deno (edge-function) Temporal client is awkward; orchestration overhead is disproportionate for
tiny documents — accepted.

## Alternatives considered
- **Single inline model call in a Supabase edge function.** Simplest, and sufficient for the
  happy path on a small doc. Rejected as the primary design: no durability across request drops,
  bespoke retry/backoff code for throttling, and a persistence failure would re-run the paid call.
- **Background job/queue (e.g. pg-boss / cron).** Gives async but not first-class per-step retry
  semantics, typed non-retryable failures, or the human-in-loop signal path we expect next.

## Evidence
- Spec: `docs/specs/document-field-extraction.md`
- Plan: `docs/plans/document-field-extraction-plan.md`
- Worker scaffold: `temporal/src/` (`config.py`, `model_client.py`), task queue `incident-main`.
- Workflow/activities implemented in Phase 3 under `temporal/src/workflows/document_extraction/`
  and `temporal/src/activities/`.
