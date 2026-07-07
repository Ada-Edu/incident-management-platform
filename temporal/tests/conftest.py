"""Shared test helpers: build real PDF/DOCX bytes for the guard-rail tests."""
from __future__ import annotations

import io


def make_docx(text: str) -> bytes:
    import docx
    d = docx.Document()
    for line in text.split("\n"):
        d.add_paragraph(line)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def make_pdf_blank(n_pages: int) -> bytes:
    """A valid PDF with n blank pages (no extractable text)."""
    from pypdf import PdfWriter
    w = PdfWriter()
    for _ in range(n_pages):
        w.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def make_pdf_encrypted() -> bytes:
    from pypdf import PdfWriter
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    w.encrypt("secret")
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()
