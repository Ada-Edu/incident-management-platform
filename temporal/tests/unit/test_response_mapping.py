"""UNIT — model response parsing/mapping in extract_fields (model call mocked).

Maps to Story 2 (nothing invented; None-found) and Story 3 (multi-party + roles).
Asserts on actual field VALUES, not just shape.
"""
from __future__ import annotations

import pytest
from temporalio.exceptions import ApplicationError

from src.activities import document_extraction as de


def _model(monkeypatch, payload: str):
    monkeypatch.setattr(de, "converse_text", lambda system, user: payload)


def test_empty_groups_preserved(monkeypatch):
    _model(monkeypatch, '{"parties":[],"key_dates":[],"key_terms":[]}')
    out = de.extract_fields("nothing structured here")
    assert out["result"] == {"parties": [], "key_dates": [], "key_terms": []}


def test_partial_groups_none_found(monkeypatch):
    _model(monkeypatch, '{"parties":[{"name":"Acme","role":"supplier"}],"key_dates":[],"key_terms":[]}')
    r = de.extract_fields("Acme is the supplier.")["result"]
    assert r["parties"] == [{"name": "Acme", "role": "supplier"}]
    assert r["key_dates"] == [] and r["key_terms"] == []


def test_multi_party_roles_preserved_in_order(monkeypatch):
    _model(monkeypatch,
           '{"parties":[{"name":"Acme","role":"buyer"},{"name":"Globex","role":"seller"},'
           '{"name":"Initech","role":"guarantor"}],"key_dates":[],"key_terms":[]}')
    parties = de.extract_fields("...")["result"]["parties"]
    assert [p["name"] for p in parties] == ["Acme", "Globex", "Initech"]
    assert [p["role"] for p in parties] == ["buyer", "seller", "guarantor"]


def test_party_without_role_is_null_not_invented(monkeypatch):
    _model(monkeypatch, '{"parties":[{"name":"Jane Doe","role":null}],"key_dates":[],"key_terms":[]}')
    assert de.extract_fields("Jane Doe signed.")["result"]["parties"] == [{"name": "Jane Doe", "role": None}]


def test_key_terms_values_mapped(monkeypatch):
    _model(monkeypatch,
           '{"parties":[],"key_dates":[{"label":"Effective date","date":"1 March 2026"}],'
           '"key_terms":[{"label":"Monthly fee","value":"$5,000"}]}')
    r = de.extract_fields("...")["result"]
    assert r["key_dates"][0] == {"label": "Effective date", "date": "1 March 2026"}
    assert r["key_terms"][0] == {"label": "Monthly fee", "value": "$5,000"}


def test_fenced_json_is_salvaged(monkeypatch):
    _model(monkeypatch, '```json\n{"parties":[],"key_dates":[],"key_terms":[]}\n```')
    assert de.extract_fields("...")["result"]["parties"] == []


def test_json_embedded_in_prose_is_salvaged(monkeypatch):
    _model(monkeypatch, 'Here is the result: {"parties":[{"name":"Acme","role":null}],"key_dates":[],"key_terms":[]} done')
    assert de.extract_fields("...")["result"]["parties"] == [{"name": "Acme", "role": None}]


def test_non_json_raises_non_retryable_model_error(monkeypatch):
    _model(monkeypatch, "I'm sorry, I can't help with that.")
    with pytest.raises(ApplicationError) as ei:
        de.extract_fields("...")
    assert ei.value.type == "model_error" and ei.value.non_retryable


def test_non_list_group_coerced_to_empty(monkeypatch):
    """A group returned as a non-list is defensively coerced to [] (never crashes / never invents)."""
    _model(monkeypatch, '{"parties":"oops","key_dates":[],"key_terms":[]}')
    assert de.extract_fields("...")["result"]["parties"] == []


def test_model_id_recorded(monkeypatch):
    _model(monkeypatch, '{"parties":[],"key_dates":[],"key_terms":[]}')
    from src.config import settings
    assert de.extract_fields("...")["model_id"] == settings.bedrock_model_id


def test_system_prompt_passed_to_model(monkeypatch):
    captured = {}
    monkeypatch.setattr(de, "converse_text",
                        lambda system, user: captured.update(system=system, user=user) or
                        '{"parties":[],"key_dates":[],"key_terms":[]}')
    de.extract_fields("MY DOCUMENT TEXT")
    assert captured["user"] == "MY DOCUMENT TEXT"
    assert "JSON object" in captured["system"]
