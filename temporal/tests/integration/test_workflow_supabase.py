"""INTEGRATION — workflow + REAL activities + REAL Supabase; model stubbed with
a recorded fixture. Asserts on the persisted row VALUES and on retry behaviour.

Requires a running Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — skips
otherwise. Uses Temporal's time-skipping env so retry backoff is instant.
"""
from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from src.activities import document_extraction as de
from src.workflows.document_extraction import DocumentExtractionWorkflow
from tests.conftest import make_docx, CONTRACT_TEXT, RECORDED_EXTRACTION

pytestmark = pytest.mark.integration

DOCX_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TASK_QUEUE = "incident-main-integration"


async def _run_workflow(extraction_id: str):
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[DocumentExtractionWorkflow],
            activities=[de.mark_running, de.fetch_document, de.extract_fields,
                        de.persist_extraction, de.persist_failure],
            activity_executor=ThreadPoolExecutor(max_workers=8),
        ):
            return await env.client.execute_workflow(
                DocumentExtractionWorkflow.run, extraction_id,
                id=f"doc-extract-{extraction_id}", task_queue=TASK_QUEUE)


async def _seed(supabase, cleanup, file_name, data, content_type=DOCX_CT):
    path = f"itest/{uuid.uuid4()}-{file_name}"
    supabase.upload(path, data, content_type)
    ext_id = supabase.create_extraction(supabase.incident_id(), path, file_name)
    cleanup.append(ext_id)
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
