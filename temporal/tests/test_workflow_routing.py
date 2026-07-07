"""Workflow-routing tests (Temporal time-skipping env) with stub activities.

Verifies the DocumentExtractionWorkflow routes success and every failure to the
right persistence step — mapping to the spec's "trust what I see" criteria:
a failure never leaves the row pending and never shows guessed fields.
"""
from __future__ import annotations

import uuid

import pytest
from temporalio import activity
from temporalio.exceptions import ApplicationError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from src.workflows.document_extraction import DocumentExtractionWorkflow

TASK_QUEUE = "incident-main-test"


def _stub_set(calls: dict, *, fetch, extract=None):
    """Build a set of stub activities (names match the real ones) that record calls."""

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
                DocumentExtractionWorkflow.run,
                "ext-1",
                id=f"doc-extract-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )


async def test_ac_workflow_success_persists_succeeded():
    """Story 1/2: happy path persists a succeeded extraction with the model result."""
    calls: dict = {}
    result = {"parties": [{"name": "Acme", "role": "buyer"}], "key_dates": [], "key_terms": []}
    acts = _stub_set(calls,
                     fetch={"ok": True, "text": "doc text", "page_count": 3},
                     extract={"result": result, "model_id": "global.anthropic.claude-opus-4-7"})
    out = await _run(acts)
    assert out["status"] == "succeeded"
    assert calls["persist_extraction"]["result"] == result
    assert "persist_failure" not in calls


async def test_ac_workflow_rejection_routes_to_failure_without_model_call():
    """Edge/Story 2: a guard-rail rejection is persisted as failed and never calls the model."""
    calls: dict = {}
    acts = _stub_set(calls, fetch={"ok": False, "reason": "too_large", "page_count": 42})
    out = await _run(acts)
    assert out["status"] == "failed" and out["reason"] == "too_large"
    assert calls["persist_failure"] == {"reason": "too_large", "page_count": 42}
    assert "extract_called" not in calls  # paid model call never made on a rejected doc


async def test_ac_workflow_model_error_routes_to_failure():
    """Story 2: an unparseable model result is persisted as a model_error failure, no guessed fields."""
    calls: dict = {}
    acts = _stub_set(
        calls,
        fetch={"ok": True, "text": "doc text", "page_count": 2},
        extract=ApplicationError("bad json", type="model_error", non_retryable=True),
    )
    out = await _run(acts)
    assert out["status"] == "failed" and out["reason"] == "model_error"
    assert calls["persist_failure"]["reason"] == "model_error"
