"""UNIT — text extraction + guard rails (pure logic; no model, no DB).

Maps to spec Scope & Definitions + Edge Cases: supported formats, 20-page limit,
and each failure reason.
"""
from __future__ import annotations

import pytest

from src.activities import document_extraction as de
from tests.conftest import make_docx, make_pdf_blank, make_pdf_encrypted, CONTRACT_TEXT


def test_docx_success_returns_text_and_page_count():
    text, pages = de._extract_text("contract.docx", make_docx(CONTRACT_TEXT))
    assert "Acme Corp" in text and "Globex Inc" in text
    assert pages >= 1


def test_pdf_over_page_limit_is_too_large_with_exact_count():
    with pytest.raises(de.ExtractionRejected) as ei:
        de._extract_text("big.pdf", make_pdf_blank(de.MAX_PAGES + 1))
    assert ei.value.reason == "too_large" and ei.value.page_count == de.MAX_PAGES + 1


def test_docx_over_page_estimate_is_too_large():
    with pytest.raises(de.ExtractionRejected) as ei:
        de._extract_text("big.docx", make_docx("word " * 12000))
    assert ei.value.reason == "too_large"
    assert ei.value.page_count > de.MAX_PAGES


def test_unsupported_type_rejected():
    with pytest.raises(de.ExtractionRejected) as ei:
        de._extract_text("notes.txt", b"hello world")
    assert ei.value.reason == "unsupported_type"


def test_password_protected_pdf_rejected():
    with pytest.raises(de.ExtractionRejected) as ei:
        de._extract_text("locked.pdf", make_pdf_encrypted())
    assert ei.value.reason == "password_protected"


def test_corrupt_pdf_rejected():
    with pytest.raises(de.ExtractionRejected) as ei:
        de._extract_text("broken.pdf", b"%PDF-1.4 not really a pdf \x00\x01")
    assert ei.value.reason == "corrupt"


def test_scanned_image_no_text_rejected():
    with pytest.raises(de.ExtractionRejected) as ei:
        de._extract_text("scan.pdf", make_pdf_blank(1))
    assert ei.value.reason == "no_text"


def test_uppercase_extension_still_supported():
    """Extension matching is case-insensitive (.DOCX)."""
    text, _ = de._extract_text("Contract.DOCX", make_docx(CONTRACT_TEXT))
    assert "Acme Corp" in text
