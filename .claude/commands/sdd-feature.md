---
description: Spec-Driven Development for an agentic feature, end-to-end with approval gates
argument-hint: <feature description> (optional; defaults to the feature line below)
---

# /sdd-feature — Spec-Driven Development, gated end-to-end

Build the feature below end-to-end using **Spec-Driven Development**. Stack for this
repo: **JavaScript/TS frontend → Temporal workflow (orchestration, Python worker under
`temporal/src/`) → model call on OUR Bedrock/Azure endpoint → Supabase (persistence)**.

Work in phases and **STOP for the user's approval at each gate**. Do not cross a gate
until the user says so.

## Feature under development

> $ARGUMENTS

_(If the line above is empty, the feature is **"Document Field Extraction"**: upload a
document → the system extracts parties, key dates, and key terms → the extracted fields
are shown beside the source document.)_

To reuse this command for a different feature, invoke `/sdd-feature <your feature>`.

## Advanced track — spec writer ↔ reviewer hardening loop  (ENABLED)

Before writing the spec, run a **writer↔reviewer loop**: one sub-agent (`general-purpose`)
drafts the spec; a second sub-agent scores it on **testable / unambiguous / complete /
edge-cases-covered** (1–5 each). The writer revises. Repeat until **every score ≥ 4** or
**3 rounds** pass. Pass both sub-agents the repo's `docs/specs/TEMPLATE.md` so scores map
to a real spec. **Show the user the score trail**, then treat the converged spec as the
Phase 1 output. (Remove this section to disable the loop.)

---

## PHASE 0 — Model plumbing *(you do the plumbing, the user directs)*
1. **Ask the user: Bedrock or Azure?** and the **endpoint / region / deployment name**.
   Use `AskUserQuestion` so execution blocks on the answer.
2. Generate the **model client, auth, and config** pointing at that endpoint, in the
   Temporal worker (`temporal/src/`). Read all creds from **env vars**; add placeholders to
   `.env.example` (committed) and the settings object. **Never commit real secrets.**
3. Write a **tiny smoke test** that sends one prompt and prints the response. Run it and
   show the user it works before continuing.
4. **STOP** — confirm the smoke test is green with the user before Phase 1.

## PHASE 1 — Spec *(customer language)*
- Use the repo spec template at `docs/specs/TEMPLATE.md`.
- Draft a **SHORT** spec: a 1–2 sentence problem statement + a few **acceptance criteria
  written the way a customer describes success**. Cover the obvious edge cases (e.g.
  **unreadable document, missing fields, multi-party**).
- Save to `docs/specs/<feature-slug>.md`. **STOP** — let the user review/edit.

## PHASE 2 — Plan + ADR
- Generate a plan **from the approved spec**: name the **Temporal workflow**, its
  **activities**, and **exactly where the model call sits** (which activity + retry/timeout
  policy + idempotency key).
- **Critique your own plan** — flag where a plain single model call would suffice vs. where
  the workflow earns its place (durability, retries, human-in-loop, long docs).
- Write an **ADR** using `docs/adrs/TEMPLATE.md` (next `NNNN-slug.md`) capturing (a) the
  **workflow shape** and (b) the **model-hosting decision**. **STOP** — show plan + ADR.

## PHASE 3 — Execute
- Implement: Temporal **workflow + activities**, the **model-calling activity**, **Supabase
  schema + writes**, and the **frontend view** showing fields beside the source.
- Keep the spec's acceptance criteria as the **definition of done**; add **one test per
  criterion**, named so the mapping is obvious.
- **Commit** spec, plan (with the user's edits visible in history), and ADR alongside code.

## PHASE 4 — Verify + PR
- Run the **full test suite** and the **Temporal workflow locally**; show green output.
- Open a **PR** linking the spec/plan/ADR and calling out any **deviations from the plan
  and why**. **STOP** — a teammate reviews before merge.

## Rules (every phase)
- Keep the spec in **customer language**, not implementation detail.
- **Never commit secrets.** `.env.example` holds placeholders only.
- If any phase reveals the **spec was wrong**, surface it and **pause** — don't silently
  change scope.
- Honor repo conventions: snake_case SQL, RLS on new tables, one-line logs, ADRs for
  architectural decisions.
