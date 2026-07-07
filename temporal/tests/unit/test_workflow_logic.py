"""UNIT — workflow control flow with ALL activities stubbed (Temporal test env).

Validates routing/branching only (no real DB/model): success → persist success;
guard-rail rejection → persist failure WITHOUT the paid model call; model_error →
persist failure. Retries are covered in the integration layer.
"""
from __future__ import annotations

import uuid

from temporalio import activity
from temporalio.exceptions import ApplicationError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from src.workflows.document_extraction import DocumentExtractionWorkflow

TASK_QUEUE = "incident-main-unit"


def _stubs(calls: dict, *, fetch, extract=None):
    @activity.defn(name="mark_running")
    async def mark_running(extraction_id: str) -> None:
        calls.setdefault("mark_running", []).append(extraction_id)

    @activity.defn(name="fetch_document")
    async def fetch_document(extraction_id: str) -> dict:
        return fetch

    @activity.defn(name="extract_fields")
    async def extract_fields(text: str) -> dict:
        calls["extract_called"] = True
        if isinstance(extract, Exception):
            raise extract
        return extract

    @activity.defn(name="persist_extraction")
    async def persist_extraction(extraction_id, result, page_count, model_id) -> None:
        calls["persist_extraction"] = {"result": result, "page_count": page_count, "model_id": model_id}

    @activity.defn(name="persist_failure")
    async def persist_failure(extraction_id, reason, page_count) -> None:
        calls["persist_failure"] = {"reason": reason, "page_count": page_count}

    return [mark_running, fetch_document, extract_fields, persist_extraction, persist_failure]


async def _run(activities) -> dict:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(env.client, task_queue=TASK_QUEUE,
                          workflows=[DocumentExtractionWorkflow], activities=activities):
            return await env.client.execute_workflow(
                DocumentExtractionWorkflow.run, "ext-1",
                id=f"doc-extract-{uuid.uuid4()}", task_queue=TASK_QUEUE)


async def test_success_persists_result_and_marks_running():
    calls: dict = {}
    result = {"parties": [{"name": "Acme", "role": "buyer"}], "key_dates": [], "key_terms": []}
    out = await _run(_stubs(calls, fetch={"ok": True, "text": "t", "page_count": 3},
                            extract={"result": result, "model_id": "m"}))
    assert out["status"] == "succeeded"
    assert calls["persist_extraction"]["result"] == result
    assert calls["mark_running"] == ["ext-1"]
    assert "persist_failure" not in calls


async def test_rejection_persists_failure_and_skips_model():
    calls: dict = {}
    out = await _run(_stubs(calls, fetch={"ok": False, "reason": "too_large", "page_count": 42}))
    assert out["status"] == "failed" and out["reason"] == "too_large"
    assert calls["persist_failure"] == {"reason": "too_large", "page_count": 42}
    assert "extract_called" not in calls


async def test_model_error_persists_failure():
    calls: dict = {}
    out = await _run(_stubs(calls, fetch={"ok": True, "text": "t", "page_count": 2},
                            extract=ApplicationError("bad json", type="model_error", non_retryable=True)))
    assert out["status"] == "failed" and out["reason"] == "model_error"
    assert calls["persist_failure"]["reason"] == "model_error"
