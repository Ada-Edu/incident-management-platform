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


def test_unicode_party_names_preserved_exactly(monkeypatch):
    """Non-ASCII names must survive verbatim (no transliteration/normalisation)."""
    _model(monkeypatch,
           '{"parties":[{"name":"José Peña","role":"vendedor"},'
           '{"name":"株式会社ヤマダ","role":null}],"key_dates":[],"key_terms":[]}')
    parties = de.extract_fields("...")["result"]["parties"]
    assert parties == [
        {"name": "José Peña", "role": "vendedor"},
        {"name": "株式会社ヤマダ", "role": None},
    ]


def test_duplicate_party_names_both_kept(monkeypatch):
    """Every named occurrence is listed; the mapper must not silently dedupe
    (two entries for the same name with different roles are both real)."""
    _model(monkeypatch,
           '{"parties":[{"name":"Acme","role":"buyer"},{"name":"Acme","role":"seller"}],'
           '"key_dates":[],"key_terms":[]}')
    parties = de.extract_fields("...")["result"]["parties"]
    assert parties == [
        {"name": "Acme", "role": "buyer"},
        {"name": "Acme", "role": "seller"},
    ]


def test_extra_unexpected_keys_ignored(monkeypatch):
    """Unknown top-level keys the model volunteers are dropped; only the three
    fixed groups are surfaced."""
    _model(monkeypatch,
           '{"parties":[{"name":"Acme","role":null}],"key_dates":[],"key_terms":[],'
           '"summary":"a contract","confidence":0.9}')
    out = de.extract_fields("...")["result"]
    assert set(out.keys()) == {"parties", "key_dates", "key_terms"}
    assert out["parties"] == [{"name": "Acme", "role": None}]


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


def test_malformed_json_after_salvage_is_model_error(monkeypatch):
    """Braces present but the object is unparseable even after the salvage regex
    grabs {...} -> non-retryable model_error (not a crash, not invented fields)."""
    _model(monkeypatch, 'result: {"parties": [ , ], "key_dates": []} !!')
    with pytest.raises(ApplicationError) as ei:
        de.extract_fields("...")
    assert ei.value.type == "model_error" and ei.value.non_retryable


def test_json_array_not_object_is_model_error(monkeypatch):
    """Spec/prompt contract: the model must return a JSON OBJECT. A top-level JSON
    ARRAY is a contract violation and must surface as a non-retryable model_error
    (never a partial/invented result, never a retryable crash)."""
    _model(monkeypatch, '[{"name":"Acme","role":"buyer"}]')
    with pytest.raises(ApplicationError) as ei:
        de.extract_fields("...")
    assert ei.value.type == "model_error" and ei.value.non_retryable


def test_non_list_group_coerced_to_empty(monkeypatch):
    """A group returned as a non-list is defensively coerced to [] (never crashes /
    never invents). Coercion is per-group: valid sibling groups are untouched."""
    _model(monkeypatch,
           '{"parties":"oops","key_dates":[{"label":"Effective date","date":"1 March 2026"}],'
           '"key_terms":[]}')
    r = de.extract_fields("...")["result"]
    assert r["parties"] == []
    assert r["key_dates"] == [{"label": "Effective date", "date": "1 March 2026"}]
    assert r["key_terms"] == []


def test_missing_group_key_defaults_to_empty(monkeypatch):
    """Spec: all three headings are ALWAYS present (empty -> 'None found', never
    omitted). If the model omits a group entirely, the mapper still returns it as []."""
    _model(monkeypatch, '{"parties":[{"name":"Acme","role":null}]}')
    r = de.extract_fields("...")["result"]
    assert r == {"parties": [{"name": "Acme", "role": None}], "key_dates": [], "key_terms": []}


def test_null_group_coerced_to_empty(monkeypatch):
    """A group returned explicitly as null is coerced to [] (not left as None)."""
    _model(monkeypatch, '{"parties":null,"key_dates":[],"key_terms":[]}')
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
