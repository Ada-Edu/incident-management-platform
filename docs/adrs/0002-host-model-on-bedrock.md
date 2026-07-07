# ADR-0002: Host the extraction model on AWS Bedrock

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** sifiso.gumede@adaptit.com (with Claude, SDD Phase 0/2)
- **Supersedes / Superseded by:** —

## Context
Document Field Extraction needs a capable instruction-following model to turn document text into
structured `{parties, key_dates, key_terms}` JSON. Requirements: keep data within our own cloud
account/region, use org-managed credentials (no per-developer vendor keys), and integrate from
the Python Temporal worker. The team already has an **AWS Bedrock** account in **af-south-1** with
a Bedrock API key. During Phase 0 we verified reachability against that endpoint.

## Decision
We call the model on **AWS Bedrock** using the `bedrock-runtime` **Converse** API from the
Temporal worker's `extract_fields` activity. Region **af-south-1**; model
**`global.anthropic.claude-opus-4-7`** (the global cross-region inference profile — the bare
model id is **not** supported for on-demand invocation in af-south-1). Auth is a **Bedrock API
key** (bearer token) read by boto3 from the `AWS_BEARER_TOKEN_BEDROCK` env var; it is never
hard-coded or committed.

## Consequences
**Easier:** data and inference stay inside our AWS account/region; one org-managed credential;
boto3 handles auth; config is env-driven (`BEDROCK_REGION`, `BEDROCK_MODEL_ID`, `BEDROCK_MAX_TOKENS`).

**Harder / constraints:** must use an **inference profile** id in af-south-1 (documented so nobody
re-hits the `ValidationException`); Bedrock **throttling** on the profile is expected → mitigated
by the retry policy on `extract_fields` (ADR-0001); model availability/quotas are region-bound.

## Alternatives considered
- **Azure OpenAI.** Viable, but we have no Azure deployment provisioned for this and it would add a
  second cloud + credential surface; no reason to diverge from the existing Bedrock account.
- **Direct Anthropic API.** Simple, but sends document text to a third-party outside our cloud
  boundary and needs a separately-managed vendor key — rejected on data-residency/credential grounds.

## Evidence
- Smoke test green (Phase 0): `region=af-south-1 model=global.anthropic.claude-opus-4-7` →
  response `'Bedrock reachable.'` (`temporal/smoke_test_bedrock.py`).
- Client: `temporal/src/model_client.py` (`converse_text`); config: `temporal/src/config.py`.
- Placeholders committed in `.env.example`; real key only in gitignored `temporal/.env`.
