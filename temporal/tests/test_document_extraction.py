"""Tests for Document Field Extraction.

Each test maps to an acceptance criterion in
docs/specs/document-field-extraction.md (referenced in the test name/docstring).
Pure-logic tests call activities directly; workflow-routing tests use Temporal's
time-skipping test environment with stub activities.
"""
from __future__ import annotations

import pytest

from src.activities import document_extraction as de
from tests.conftest import make_docx, make_pdf_blank, make_pdf_encrypted


# ---------------------------------------------------------------------------
# fetch_document guard rails  (Scope & Definitions + Edge Cases)
# ---------------------------------------------------------------------------
def _patch_fetch(monkeypatch, file_name: str, data: bytes):
    monkeypatch.setattr(de.supabase_rest, "get_extraction",
                        lambda _id: {"storage_path": f"x/{file_name}", "file_name": file_name})
    monkeypatch.setattr(de.supabase_rest, "download_object", lambda _b, _p: data)


def test_ac_story1_supported_docx_extracts_text_and_pages(monkeypatch):
    """Story 1: a supported document (DOCX ≤20 pages) auto-extracts (ok + text)."""
    _patch_fetch(monkeypatch, "contract.docx", make_docx("Party A agrees to pay Party B."))
    out = de.fetch_document("e1")
    assert out["ok"] is True
    assert "Party A" in out["text"]
    assert out["page_count"] >= 1


def test_ac_edge_unsupported_type(monkeypatch):
    """Edge: unsupported file type → reason unsupported_type, no fields."""
    _patch_fetch(monkeypatch, "notes.txt", b"hello")
    out = de.fetch_document("e2")
    assert out == {"ok": False, "reason": "unsupported_type", "page_count": None}


def test_ac_edge_too_large_docx(monkeypatch):
    """Edge: document larger than 20 pages → reason too_large."""
    _patch_fetch(monkeypatch, "big.docx", make_docx("word " * 12000))  # ~60k chars > 20*1800
    out = de.fetch_document("e3")
    assert out["ok"] is False and out["reason"] == "too_large"
    assert out["page_count"] > de.MAX_PAGES


def test_ac_edge_password_protected(monkeypatch):
    """Edge: password-protected file → reason password_protected."""
    _patch_fetch(monkeypatch, "locked.pdf", make_pdf_encrypted())
    out = de.fetch_document("e4")
    assert out["ok"] is False and out["reason"] == "password_protected"


def test_ac_edge_corrupt(monkeypatch):
    """Edge: corrupt/unopenable file → reason corrupt."""
    _patch_fetch(monkeypatch, "broken.pdf", b"%PDF-1.4 not really a pdf \x00\x01")
    out = de.fetch_document("e5")
    assert out["ok"] is False and out["reason"] == "corrupt"


def test_ac_edge_scanned_image_no_text(monkeypatch):
    """Edge: scanned image with no readable text → reason no_text."""
    _patch_fetch(monkeypatch, "scan.pdf", make_pdf_blank(1))
    out = de.fetch_document("e6")
    assert out["ok"] is False and out["reason"] == "no_text"


# ---------------------------------------------------------------------------
# extract_fields  (THE MODEL CALL)  — Story 2 & 3
# ---------------------------------------------------------------------------
def test_ac_story2_nothing_invented_empty_groups(monkeypatch):
    """Story 2: only what's in the doc; empty groups stay empty (UI shows 'None found')."""
    monkeypatch.setattr(de, "converse_text",
                        lambda s, u: '{"parties":[],"key_dates":[],"key_terms":[]}')
    out = de.extract_fields("some text with nothing structured")
    assert out["result"] == {"parties": [], "key_dates": [], "key_terms": []}


def test_ac_story2_none_found_partial_groups(monkeypatch):
    """Story 2: a group with nothing found comes back empty while others populate."""
    monkeypatch.setattr(de, "converse_text",
                        lambda s, u: '{"parties":[{"name":"Acme","role":"supplier"}],'
                                     '"key_dates":[],"key_terms":[]}')
    out = de.extract_fields("Acme is the supplier.")
    assert out["result"]["parties"] == [{"name": "Acme", "role": "supplier"}]
    assert out["result"]["key_dates"] == [] and out["result"]["key_terms"] == []


def test_ac_story3_multi_party_with_roles(monkeypatch):
    """Story 3: all named parties listed, each with stated role."""
    monkeypatch.setattr(de, "converse_text",
                        lambda s, u: '{"parties":[{"name":"Acme","role":"buyer"},'
                                     '{"name":"Globex","role":"seller"}],'
                                     '"key_dates":[],"key_terms":[]}')
    parties = de.extract_fields("...")["result"]["parties"]
    assert len(parties) == 2
    assert {p["name"]: p["role"] for p in parties} == {"Acme": "buyer", "Globex": "seller"}


def test_ac_story3_party_without_role_not_invented(monkeypatch):
    """Story 3: a party with no stated role is listed with role=null (not invented)."""
    monkeypatch.setattr(de, "converse_text",
                        lambda s, u: '{"parties":[{"name":"Jane Doe","role":null}],'
                                     '"key_dates":[],"key_terms":[]}')
    parties = de.extract_fields("Jane Doe signed.")["result"]["parties"]
    assert parties == [{"name": "Jane Doe", "role": None}]


def test_ac_story2_model_non_json_is_model_error(monkeypatch):
    """Story 2: unparseable model output → non-retryable model_error (no guessed fields)."""
    from temporalio.exceptions import ApplicationError
    monkeypatch.setattr(de, "converse_text", lambda s, u: "sorry, I cannot help with that")
    with pytest.raises(ApplicationError) as ei:
        de.extract_fields("...")
    assert ei.value.type == "model_error" and ei.value.non_retryable


def test_ac_model_output_fenced_json_is_salvaged(monkeypatch):
    """Robustness: JSON wrapped in ```json fences is still parsed."""
    monkeypatch.setattr(de, "converse_text",
                        lambda s, u: '```json\n{"parties":[],"key_dates":[],"key_terms":[]}\n```')
    out = de.extract_fields("...")
    assert out["result"]["parties"] == []
