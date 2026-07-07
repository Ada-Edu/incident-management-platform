"""INTEGRATION — workflow + REAL activities + REAL Supabase; model stubbed with
a recorded fixture. Asserts on the persisted row VALUES and on retry behaviour.

Requires a running Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — skips
otherwise. Uses Temporal's time-skipping env so retry backoff is instant.
"""
from __future__ import annotations

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import httpx
import pytest
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from src.activities import document_extraction as de
from src.workflows.document_extraction import DocumentExtractionWorkflow
from tests.conftest import make_docx, CONTRACT_TEXT, RECORDED_EXTRACTION

pytestmark = pytest.mark.integration

DOCX_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TASK_QUEUE = "incident-main-integration"
_STORAGE_BUCKET = "incident-docs"

_ALL_ACTIVITIES = [de.mark_running, de.fetch_document, de.extract_fields,
                   de.persist_extraction, de.persist_failure]


async def _run_workflow(extraction_id: str):
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[DocumentExtractionWorkflow],
            activities=_ALL_ACTIVITIES,
            activity_executor=ThreadPoolExecutor(max_workers=8),
        ):
            return await env.client.execute_workflow(
                DocumentExtractionWorkflow.run, extraction_id,
                id=f"doc-extract-{extraction_id}", task_queue=TASK_QUEUE)


@asynccontextmanager
async def _worker_env():
    """Yield (env, client) with a worker running — for tests that need to drive
    the client directly (e.g. workflow-id reuse) rather than execute-and-wait."""
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[DocumentExtractionWorkflow],
            activities=_ALL_ACTIVITIES,
            activity_executor=ThreadPoolExecutor(max_workers=8),
        ):
            yield env, env.client


def _download_object(path: str) -> bytes:
    """Download a Storage object's raw bytes via the service role.

    conftest's `supabase` client only exposes upload/create/get/delete, so this
    local wrapper (per test-plan constraints) reads SUPABASE_URL /
    SUPABASE_SERVICE_ROLE_KEY straight from the environment. Only used to prove
    the original attachment is retained/unchanged after a failure path (#12).
    """
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    url = f"{base}/storage/v1/object/{_STORAGE_BUCKET}/{path.lstrip('/')}"
    r = httpx.get(url, headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=60)
    r.raise_for_status()
    return r.content


async def _seed_full(supabase, cleanup, file_name, data, content_type=DOCX_CT):
    """Seed a storage object + pending row; return (ext_id, storage_path)."""
    path = f"itest/{uuid.uuid4()}-{file_name}"
    supabase.upload(path, data, content_type)
    ext_id = supabase.create_extraction(supabase.incident_id(), path, file_name)
    cleanup.append(ext_id)
    return ext_id, path


async def _seed(supabase, cleanup, file_name, data, content_type=DOCX_CT):
    ext_id, _ = await _seed_full(supabase, cleanup, file_name, data, content_type)
    return ext_id


async def test_success_persists_extracted_values(supabase, cleanup_extractions, monkeypatch):
    """Happy path: real fetch + real persist; model stubbed → row holds the exact fields."""
    monkeypatch.setattr(de, "converse_text",
                        lambda system, user: __import__("json").dumps(RECORDED_EXTRACTION))
    ext_id = await _seed(supabase, cleanup_extractions, "msa.docx", make_docx(CONTRACT_TEXT))

    out = await _run_workflow(ext_id)
    assert out["status"] == "succeeded"

    row = supabase.get_extraction(ext_id)
    assert row["status"] == "succeeded"
    assert row["failure_reason"] is None
    assert row["model_id"] == de.settings.bedrock_model_id
    # Behavioural assertions on real persisted VALUES:
    names = {p["name"]: p["role"] for p in row["result"]["parties"]}
    assert names == {"Acme Corp": "Supplier", "Globex Inc": "Client", "Initech LLC": "Guarantor"}
    assert row["result"]["key_dates"] == [{"label": "Effective date", "date": "1 March 2026"}]
    assert {t["label"]: t["value"] for t in row["result"]["key_terms"]} == {
        "Termination notice period": "30 days", "Monthly fee": "$5,000", "Reference number": "MSA-2026-042",
    }


async def test_unsupported_type_persists_failure(supabase, cleanup_extractions, monkeypatch):
    """Real fetch rejects a .txt; model must never be called; row → failed/unsupported_type."""
    called = {"n": 0}
    monkeypatch.setattr(de, "converse_text",
                        lambda s, u: called.__setitem__("n", called["n"] + 1) or "{}")
    ext_id = await _seed(supabase, cleanup_extractions, "notes.txt", b"just some text", "text/plain")

    out = await _run_workflow(ext_id)
    assert out["status"] == "failed" and out["reason"] == "unsupported_type"

    row = supabase.get_extraction(ext_id)
    assert row["status"] == "failed" and row["failure_reason"] == "unsupported_type"
    assert row["result"] == {"parties": [], "key_dates": [], "key_terms": []}
    assert called["n"] == 0  # paid model call never made on a rejected doc


async def test_model_error_persists_failure(supabase, cleanup_extractions, monkeypatch):
    """Model returns garbage → row → failed/model_error, no guessed fields."""
    monkeypatch.setattr(de, "converse_text", lambda s, u: "not json at all")
    ext_id = await _seed(supabase, cleanup_extractions, "msa.docx", make_docx(CONTRACT_TEXT))

    out = await _run_workflow(ext_id)
    assert out["status"] == "failed" and out["reason"] == "model_error"
    row = supabase.get_extraction(ext_id)
    assert row["status"] == "failed" and row["failure_reason"] == "model_error"


async def test_transient_model_error_is_retried_then_succeeds(supabase, cleanup_extractions, monkeypatch):
    """First model call raises a transient error; Temporal retries; row ends succeeded."""
    import json
    attempts = {"n": 0}

    def flaky(system, user):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise RuntimeError("bedrock throttling (transient)")
        return json.dumps(RECORDED_EXTRACTION)

    monkeypatch.setattr(de, "converse_text", flaky)
    ext_id = await _seed(supabase, cleanup_extractions, "msa.docx", make_docx(CONTRACT_TEXT))

    out = await _run_workflow(ext_id)
    assert out["status"] == "succeeded"
    assert attempts["n"] == 2  # proved a retry happened
    row = supabase.get_extraction(ext_id)
    assert row["status"] == "succeeded"
    assert len(row["result"]["parties"]) == 3


async def test_empty_but_valid_extraction_succeeds_with_empty_groups(
        supabase, cleanup_extractions, monkeypatch):
    """#15 / Story 2 AC: a real supported docx where the model finds nothing in any
    group must land 'succeeded' (NOT failed) with result = three empty arrays.
    'None found' is a success state, not a failure."""
    import json
    empty = {"parties": [], "key_dates": [], "key_terms": []}
    monkeypatch.setattr(de, "converse_text", lambda system, user: json.dumps(empty))
    # A real, openable docx with real text — the emptiness is the MODEL's answer,
    # not a guard-rail rejection (which would be `failed`).
    ext_id = await _seed(supabase, cleanup_extractions, "sparse.docx",
                         make_docx("Some prose with no parties, dates, or terms."))

    out = await _run_workflow(ext_id)
    assert out["status"] == "succeeded"
    assert out["result"] == empty

    row = supabase.get_extraction(ext_id)
    assert row["status"] == "succeeded"
    assert row["failure_reason"] is None
    assert row["result"] == empty  # three empty arrays, all groups present
    assert set(row["result"].keys()) == {"parties", "key_dates", "key_terms"}
    assert row["model_id"] == de.settings.bedrock_model_id


async def test_attachment_retained_and_unchanged_after_failure(
        supabase, cleanup_extractions, monkeypatch):
    """#12 / Story 1 AC ('original attachment unchanged/downloadable') + Story 2
    ('attachment kept on failure'). After a model_error failure, the original
    storage object must still exist with byte-identical contents."""
    monkeypatch.setattr(de, "converse_text", lambda s, u: "not json at all")
    original = make_docx(CONTRACT_TEXT)
    ext_id, path = await _seed_full(supabase, cleanup_extractions, "msa.docx", original)

    out = await _run_workflow(ext_id)
    assert out["status"] == "failed" and out["reason"] == "model_error"

    row = supabase.get_extraction(ext_id)
    assert row["status"] == "failed" and row["failure_reason"] == "model_error"

    # The attachment is retained and byte-for-byte unchanged (never altered).
    downloaded = _download_object(path)
    assert downloaded == original


async def test_gateway_workflow_id_reuse_is_rejected(supabase, cleanup_extractions, monkeypatch):
    """#5 Gateway idempotency: starting the same extraction (same workflow id)
    twice must not duplicate. gateway.py relies on WorkflowAlreadyStartedError;
    we prove that reuse semantics against the Temporal client with a fixed id
    while the first run is still open."""
    import asyncio
    import json

    # Keep the first run OPEN long enough to attempt a duplicate start. The
    # extract activity blocks; time-skipping does NOT skip real activity sleeps,
    # so a short real sleep suffices without slowing the suite meaningfully.
    def slow(system, user):
        import time
        time.sleep(2)
        return json.dumps(RECORDED_EXTRACTION)

    monkeypatch.setattr(de, "converse_text", slow)
    ext_id = await _seed(supabase, cleanup_extractions, "msa.docx", make_docx(CONTRACT_TEXT))
    workflow_id = f"doc-extract-{ext_id}"

    async with _worker_env() as (_env, client):
        first = await client.start_workflow(
            DocumentExtractionWorkflow.run, ext_id,
            id=workflow_id, task_queue=TASK_QUEUE)

        # Second start with the SAME id, while the first is still running, is the
        # exact condition gateway.start_extraction catches to stay idempotent.
        with pytest.raises(WorkflowAlreadyStartedError):
            await client.start_workflow(
                DocumentExtractionWorkflow.run, ext_id,
                id=workflow_id, task_queue=TASK_QUEUE)

        # The single (first) run still completes and persists exactly once.
        result = await first.result()
        assert result["status"] == "succeeded"

    row = supabase.get_extraction(ext_id)
    assert row["status"] == "succeeded"
    assert len(row["result"]["parties"]) == 3


async def test_model_total_failure_terminal_state(supabase, cleanup_extractions, monkeypatch):
    """#7 Model TOTAL failure: converse_text ALWAYS raises a transient error, so
    extract_fields exhausts its retry policy (maximum_attempts=4).

    Fixed behaviour: the workflow catches the exhausted-retry ActivityError and
    routes it to persist_failure, so the row reaches a TERMINAL state (never a
    stuck 'running') per the spec's every-failure-is-terminal guarantee."""
    attempts = {"n": 0}

    def always_transient(system, user):
        attempts["n"] += 1
        raise RuntimeError("bedrock throttling (transient, never recovers)")

    monkeypatch.setattr(de, "converse_text", always_transient)
    ext_id = await _seed(supabase, cleanup_extractions, "msa.docx", make_docx(CONTRACT_TEXT))

    out = await _run_workflow(ext_id)
    assert out["status"] == "failed" and out["reason"] == "model_error"
    assert attempts["n"] == 4  # retry policy: maximum_attempts=4, all exhausted

    row = supabase.get_extraction(ext_id)
    # Terminal state reached — no stuck 'running'.
    assert row["status"] == "failed"
    assert row["failure_reason"] == "model_error"
    assert row["result"] == {"parties": [], "key_dates": [], "key_terms": []}
