"""UNIT — fetch_document routing (Supabase + storage mocked).

Transient/deterministic split: deterministic rejections return ok=False (not
retried); a missing row is a non-retryable ApplicationError.
"""
from __future__ import annotations

import pytest
from temporalio.exceptions import ApplicationError

from src.activities import document_extraction as de
from tests.conftest import make_docx, make_pdf_blank, CONTRACT_TEXT


def _patch(monkeypatch, file_name, data, row=True):
    monkeypatch.setattr(de.supabase_rest, "get_extraction",
                        lambda _id: ({"storage_path": f"x/{file_name}", "file_name": file_name} if row else None))
    monkeypatch.setattr(de.supabase_rest, "download_object", lambda _b, _p: data)


def test_success_returns_text(monkeypatch):
    _patch(monkeypatch, "c.docx", make_docx(CONTRACT_TEXT))
    out = de.fetch_document("e1")
    assert out["ok"] is True and "Acme Corp" in out["text"] and out["page_count"] >= 1


def test_rejection_returns_reason_not_exception(monkeypatch):
    _patch(monkeypatch, "n.txt", b"hi")
    out = de.fetch_document("e2")
    assert out == {"ok": False, "reason": "unsupported_type", "page_count": None}


def test_missing_row_is_non_retryable(monkeypatch):
    _patch(monkeypatch, "c.docx", make_docx("x"), row=False)
    with pytest.raises(ApplicationError) as ei:
        de.fetch_document("missing")
    assert ei.value.non_retryable


def test_file_name_absent_falls_back_to_storage_path_extension(monkeypatch):
    """When the row has no file_name, the extension (and thus format routing) is
    taken from storage_path. A .docx storage_path must still parse as DOCX."""
    monkeypatch.setattr(de.supabase_rest, "get_extraction",
                        lambda _id: {"storage_path": "incident/42/contract.docx", "file_name": None})
    monkeypatch.setattr(de.supabase_rest, "download_object", lambda _b, _p: make_docx(CONTRACT_TEXT))
    out = de.fetch_document("e-fallback")
    assert out["ok"] is True and "Acme Corp" in out["text"]


def test_rejection_carries_page_count_for_too_large(monkeypatch):
    """A too_large rejection routes ok=False AND propagates the page_count so the
    failure row can record how large the document was."""
    _patch(monkeypatch, "huge.pdf", make_pdf_blank(de.MAX_PAGES + 1))
    out = de.fetch_document("e-big")
    assert out["ok"] is False
    assert out["reason"] == "too_large"
    assert out["page_count"] == de.MAX_PAGES + 1


def test_storage_error_propagates_for_retry(monkeypatch):
    """A transient storage error must raise (so Temporal retries), not be swallowed."""
    monkeypatch.setattr(de.supabase_rest, "get_extraction",
                        lambda _id: {"storage_path": "x/c.docx", "file_name": "c.docx"})
    def boom(_b, _p):
        raise RuntimeError("storage 503")
    monkeypatch.setattr(de.supabase_rest, "download_object", boom)
    with pytest.raises(RuntimeError):
        de.fetch_document("e3")
