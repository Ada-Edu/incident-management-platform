# Implementation Plan — Document Field Extraction

**Source spec:** [`docs/specs/document-field-extraction.md`](../specs/document-field-extraction.md) (Approved)
**Related ADRs:** [0001 — Orchestrate with Temporal](../adrs/0001-orchestrate-extraction-with-temporal.md) · [0002 — Host model on Bedrock](../adrs/0002-host-model-on-bedrock.md)
**Created:** 2026-07-07

## 1. End-to-end shape

```
Frontend (React/TS)                Supabase                     Temporal worker (Python)         Bedrock
──────────────────                 ────────                     ────────────────────────         ───────
attach doc to incident
  ├─ upload file ────────────────▶ Storage: incident-docs/…
  ├─ insert row  ────────────────▶ document_extractions (status=pending)
  └─ invoke edge fn `start-extraction`
                                    │  starts workflow ────────▶ DocumentExtractionWorkflow(extraction_id)
                                    │                               ├─ act: fetch_document   ◀─ Storage
                                    │                               ├─ act: extract_fields ───────────────▶ Converse
                                    │                               └─ act: persist_extraction ─▶ document_extractions (result, status)
frontend subscribes/polls ◀──────── document_extractions row (status + result JSONB)
  └─ shows Parties / Key Dates / Key Terms beside the source
```

## 2. Temporal workflow

**Workflow:** `DocumentExtractionWorkflow`
- **Input:** `extraction_id` (UUID of the `document_extractions` row).
- **Workflow id:** `doc-extract-{extraction_id}` with `WorkflowIDReusePolicy.REJECT_DUPLICATE`
  → **idempotent trigger**: attaching/starting twice for the same extraction never runs it twice.
- **Task queue:** `incident-main`.
- **Shape:** linear 3-activity pipeline; the workflow catches typed non-retryable failures
  and routes them to `persist_extraction` as a failure (never leaves the row `pending`).

### Activities

| # | Activity | Responsibility | Timeout | Retry policy | Idempotency |
|---|----------|----------------|---------|--------------|-------------|
| 1 | `fetch_document` | Download file from Storage; detect type + page count; guard rails; extract raw text (PDF/DOCX). Returns text **or** a typed failure reason. | `start_to_close = 60s` | 3 attempts, backoff ×2, **retry only transient** (storage 5xx/network). **Non-retryable** `ApplicationError` for deterministic outcomes: `UNSUPPORTED_TYPE`, `TOO_LARGE`, `PASSWORD_PROTECTED`, `CORRUPT`, `NO_TEXT`. | Pure read; safe to repeat. |
| 2 | `extract_fields` **← THE MODEL CALL** | Send document text to **Bedrock Converse** (`global.anthropic.claude-opus-4-7`, af-south-1); parse the returned JSON into `{parties[], key_dates[], key_terms[]}`. | `start_to_close = 120s` | 4 attempts, backoff ×2 (2s→60s), retry `ThrottlingException`/5xx/timeouts; **non-retryable** on `ValidationException` + malformed-JSON after 1 reparse. | Pure function of input text; Temporal dedups by activity id. |
| 3 | `persist_extraction` | Upsert result + `status` (`succeeded`/`failed` + `failure_reason`) into `document_extractions`. | `start_to_close = 30s` | 5 attempts, backoff ×2 (must eventually land). | **Idempotent upsert** keyed on `extraction_id` (unique) → retries never duplicate. |

**Where the model call sits:** exclusively in **activity #2 `extract_fields`**. Nothing else calls the model.

## 3. Supabase schema (new)

- `document_extractions` — header row: `id`, `incident_id`, `attachment_id`, `status`
  (`pending|running|succeeded|failed`), `failure_reason` (nullable text/enum), `model_id`,
  `result` **jsonb** (`{parties, key_dates, key_terms}`), `page_count`, timestamps.
- **RLS:** visible/writable following the parent incident via the existing
  `can_see_incident(incident_id)` helper. Worker writes with the **service role** (bypasses RLS).
- Storage bucket `incident-docs` with RLS matching `can_see_incident`.

Result stored as one JSONB blob (not child tables) because the frontend only displays the
three groups beside the source — no cross-extraction querying is required in this slice.

## 4. Frontend (React/TS)

- On the incident detail page, an **Extraction panel beside the attachment**:
  - `pending`/`running` → spinner ("Extracting… up to 30s").
  - `succeeded` → three headings **Parties / Key Dates / Key Terms**; empty group → **"None found"**.
  - `failed` → the specific `failure_reason` message; attachment still shown/downloadable.
- Uses TanStack Query polling (or Supabase Realtime) on the `document_extractions` row.

## 5. Trigger path

`start-extraction` **Supabase edge function** (Deno) receives `{extraction_id}` and starts the
workflow. Because a robust Temporal client in Deno is awkward, the edge function calls a tiny
**HTTP start endpoint on the worker service** (`POST /extractions/{id}/start`) which uses the
Python Temporal client. One small surface, testable, keeps secrets server-side.

## 6. Self-critique — does the workflow earn its place?

**A plain single model call would suffice** for the happy path on a small text doc — one
edge function could read the file and call Bedrock inline. Honestly flagged.

**Where the workflow genuinely earns it (why we keep it):**
1. **Durability** — a 30–120s model + IO job must not be tied to an HTTP request/browser
   lifecycle. If the request drops, extraction still completes and persists.
2. **Policy-based retries** — Bedrock **throttling on the cross-region inference profile** is
   real; Temporal gives backoff/retry per-activity with no bespoke code.
3. **Partial-failure isolation** — a `persist` blip must not re-run the **paid** model call;
   separate activities have separate retry semantics.
4. **Typed failure routing** — deterministic failures (unsupported/too-large/protected/…)
   are non-retryable and land as a clean `failed` status — directly satisfies the spec's
   "tell me clearly, keep the attachment, show no guessed fields."
5. **Future human-in-loop / long docs** — the spec's open questions (field correction,
   re-extract on replace, OCR for scanned docs) become a workflow **signal**/extra activity
   without touching the request path.

**Where it's overkill (accepted cost):** orchestration overhead (worker + Temporal server)
exceeds a direct call for tiny docs. We accept it because the platform already runs a Temporal
worker for agentic features and durability/retries on paid model calls are worth the overhead.

**Tightening from the critique:** kept the pipeline **linear** (no parallelism — one model
call, no fan-out needed); pushed all guard-rail decisions into `fetch_document` so the model
call only ever runs on valid, in-limit text (never waste a paid call on a doc we'd reject).

## 7. Definition of done (maps to spec acceptance criteria)
One test per criterion (named `test_ac_<story>_<n>`), covering: auto-run on attach, ≤30s
latency path, three fixed labels, beside-source display, attachment untouched, nothing-invented,
"None found", failure messaging + attachment retained, multi-party + roles, and each edge case
(corrupt / password / no-text / unsupported / too-large / empty-group).
