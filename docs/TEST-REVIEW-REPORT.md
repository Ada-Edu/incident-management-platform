# TEST-REVIEW REPORT — Document Field Extraction

_Independent audit (separate agent, fresh context) of the Phase 1 pyramid (34 unit / 4 integration / 1 e2e)._

**Headline:** The suite looks like a clean pyramid and asserts on field VALUES in several places — better than average. But the one place the **real model** runs (e2e) is graded against a document whose answers are embedded in the input, so it can't detect a bad extraction; two acceptance criteria (**"beside the source"**, **latency <30s**) have zero coverage; the **"None found"** display state is never tested; and **gateway idempotency** is untested. Several unit tests assert nothing about behavior.

| # | Finding | Severity | Layer | Action |
|---|---------|----------|-------|--------|
| 1 | Real model output never meaningfully asserted — model stubbed in unit AND integration; the only live-model e2e asserts strings that appear verbatim in the input (echo/hallucination would pass). | High | e2e/cross | strengthen |
| 2 | "Displayed beside the source" (Story 1 AC4) untested — no frontend layer in scope. | High | cross | add (UI test) |
| 3 | Latency criterion (<30s; ≥95%) untested; e2e uses 90s deadline, never measures elapsed. | High | e2e | add |
| 4 | "None found" empty-group display (Story 2 AC2) not tested as behavior — only that the list stays `[]`. | High | cross | add |
| 5 | Gateway idempotent re-trigger (`WorkflowAlreadyStartedError` branch) completely untested — `gateway.py` has no test. | High | integration | add |
| 6 | Only one retry test, gated behind Supabase; skips in unit/CI runs. `test_workflow_logic` defers retries to integration → common case has no retry coverage. | Med | unit/integration | strengthen |
| 7 | Model total-failure (all retries exhausted) untested — does the row end `failed` or stay `running`? | Med | integration | add |
| 8 | Prompt tests near-tautological (`assert "literal" in _SYSTEM_PROMPT`); `test_prompt_requires_role_or_null` is an `or` over two present substrings — can't fail. | Med | unit | replace/trim |
| 9 | `test_mark_running_sets_only_status` restates the one-line impl; `test_system_prompt_passed_to_model` echoes its own arg. | Low | unit | delete/trim |
| 10 | Corrupt-DOCX and no-text-DOCX paths untested (PDF only). | Med | unit | add |
| 11 | Password-protected test asserts the reason label but not the decrypt-path taken; pypdf-version-dependent. | Low | unit | strengthen |
| 12 | "Attachment retained/unchanged on failure" only implied — original storage object never checked present/byte-unchanged after failure. | Med | integration | add |
| 13 | Partial/garbage-but-parseable JSON untested (items missing `name`, malformed items pass through to DB unvalidated). | Med | unit | add |
| 14 | `model_id` unit test passes any string through — wouldn't catch a wrong/stale id. | Low | unit | strengthen |
| 15 | Empty-but-valid extraction not proven end-to-end to land `succeeded` (not `failed`) with empty result. | Low | integration | add |

## Closing note — where the judgment calls cluster
Unit layer is largely AI-clean (`test_response_mapping`, `test_text_extraction` assert concrete values, ordering, null-role, each guard-rail reason) — a human is barely needed except to prune the vanity prompt tests (#8, #9). The real judgment calls cluster at the **top of the pyramid** and the **pass-for-wrong-reasons** class: the e2e is the only live-model test yet grades against baked-in answers (#1) and skips latency (#3); and the cross-cutting criteria the backend suite structurally can't reach — "beside the source" (#2), "None found" (#4), attachment-unchanged (#12), gateway idempotency (#5) — look "covered" only because adjacent rows are asserted. **Trust the unit guard-rail/mapping tests; put a human on the e2e tolerance, latency/idempotency/UI coverage, and the retry tests that skip without a live Supabase.**

---

## Phase 3 — Actions taken (per finding)

Acted on by three layer-owner agents (unit/integration/e2e), reconciled centrally. Final suite: **49 unit / 8 integration / 2 e2e (+1 skipped frontend placeholder)** — all green.

| # | Disposition |
|---|-------------|
| 1 | **Fixed.** E2E rewritten to grade real model output against a ground-truth doc with a **decoy** ("Wingfield" = a location in prose, not a party); asserts party count, names grounded in source, decoy NOT extracted, correct role→party mapping. An echoing/hallucinating model now fails. |
| 2 | **Deferred (known gap).** "Beside the source" is a frontend render; backend e2e can't reach it. Added a **skipped placeholder** documenting the intended Playwright assertion. **Team call:** add a web e2e (Playwright) layer? |
| 3 | **Fixed.** E2E now MEASURES wall-clock from gateway-start to terminal status and asserts **< 30s**. |
| 4 | **Deferred (known gap).** "None found" display is frontend — same placeholder as #2. The empty-group `[]` state IS now proven end-to-end (integration #15). |
| 5 | **Fixed.** Integration asserts workflow-id reuse raises `WorkflowAlreadyStartedError` — the exact condition the gateway catches for idempotency. |
| 6 | **Strengthened.** Retry covered at integration (transient-then-success + total-failure); unit covers routing. |
| 7 | **Fixed + PRODUCT BUG fixed.** Exhausted-retry `ActivityError` was re-raised → row stuck `running`. Workflow now routes ANY model-activity failure to `persist_failure` → terminal `failed`/`model_error`. Test flipped. |
| 8 | **Trimmed/strengthened.** Prompt tests now pin the full Key-Term definition + exact output schema; the `or`-tautology removed. |
| 9 | **Left alone — reason.** `test_mark_running_sets_only_status` guards against a regression that also nulls other fields (cheap contract check). `test_system_prompt_passed_to_model` verifies the doc text is the user turn. |
| 10 | **Fixed.** Added corrupt-DOCX and whitespace-only-DOCX (no_text) unit tests. |
| 11 | **Left alone — reason.** Asserting the exact decrypt path couples to pypdf internals; label assertion kept. |
| 12 | **Fixed.** Integration downloads the stored object after a failure and asserts it is byte-for-byte unchanged. |
| 13 | **Fixed + PRODUCT BUG fixed.** Bug A: top-level JSON array → `AttributeError` (retryable). `extract_fields` now validates `parsed` is a dict → non-retryable `model_error`. Added array + malformed-parseable tests. |
| 14 | **Strengthened.** Integration asserts persisted `model_id == settings.bedrock_model_id`. |
| 15 | **Fixed.** Integration proves empty-but-valid extraction lands `succeeded` with three empty groups. |

**Two product bugs fixed in `src`** (A: `extract_fields` dict-validation; B: workflow terminal-failure routing) — both spec-guarantee violations surfaced by the independent audit + layer agents, not the original writer. **Minor, left for team:** model-id docstrings in `model_client.py` still say Opus 4.8 while the working default is `claude-opus-4-7` (doc drift only).

### Takeaway — which test types AI wrote well vs. needed a human eye
- **Unit: AI-clean.** Value/guard-rail/mapping assertions were solid out of the gate; only vanity string-checks needed pruning.
- **Integration & E2E + the pass-for-wrong-reasons class: needed the independent eye.** The original e2e passed for the wrong reason (baked-in answers); latency/idempotency/terminal-failure were missing; and **two real product bugs only surfaced once a fresh context + per-layer agents attacked behavior** instead of the writer re-reading their own tests.
