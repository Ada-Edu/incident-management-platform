"""UNIT — persistence activities shape the Supabase row correctly (DB mocked).

Asserts the exact patch written for success/failure/running, since the frontend
reads these fields directly.
"""
from __future__ import annotations

from src.activities import document_extraction as de


def _capture(monkeypatch):
    calls = []
    monkeypatch.setattr(de.supabase_rest, "update_extraction",
                        lambda ext_id, patch: calls.append((ext_id, patch)))
    return calls


def test_persist_success_writes_result_and_status(monkeypatch):
    calls = _capture(monkeypatch)
    result = {"parties": [{"name": "Acme", "role": "buyer"}], "key_dates": [], "key_terms": []}
    de.persist_extraction("e1", result, 3, "global.anthropic.claude-opus-4-7")
    ext_id, patch = calls[0]
    assert ext_id == "e1"
    assert patch["status"] == "succeeded"
    assert patch["result"] == result
    assert patch["page_count"] == 3
    assert patch["model_id"] == "global.anthropic.claude-opus-4-7"
    assert patch["failure_reason"] is None


def test_persist_failure_sets_reason_and_empty_result(monkeypatch):
    calls = _capture(monkeypatch)
    de.persist_failure("e2", "too_large", 42)
    _id, patch = calls[0]
    assert patch["status"] == "failed"
    assert patch["failure_reason"] == "too_large"
    assert patch["page_count"] == 42
    # Failure must never leave guessed/partial fields behind.
    assert patch["result"] == {"parties": [], "key_dates": [], "key_terms": []}


def test_mark_running_sets_only_status(monkeypatch):
    calls = _capture(monkeypatch)
    de.mark_running("e3")
    _id, patch = calls[0]
    assert patch == {"status": "running"}
