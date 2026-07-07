"""Shared test helpers + fixtures for the Document Field Extraction pyramid.

- Document builders (real PDF/DOCX bytes) for guard-rail tests.
- Recorded model fixtures (so integration never calls the real model).
- Supabase service-role helpers + cleanup for integration/e2e layers.

Integration/e2e fixtures skip cleanly when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
are not set, so the unit layer runs anywhere.
"""
from __future__ import annotations

import io
import os

import pytest


# --------------------------------------------------------------------------- #
# Document builders
# --------------------------------------------------------------------------- #
def make_docx(text: str) -> bytes:
    import docx
    d = docx.Document()
    for line in text.split("\n"):
        d.add_paragraph(line)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def make_pdf_blank(n_pages: int) -> bytes:
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


# A realistic multi-party contract used across layers. The recorded model output
# below is what a correct extraction of THIS text looks like.
CONTRACT_TEXT = (
    "This Master Services Agreement is between Acme Corp (Supplier) and Globex Inc (Client),\n"
    "with Initech LLC acting as Guarantor.\n"
    "Effective date: 1 March 2026. Termination notice period: 30 days.\n"
    "Monthly fee: $5,000. Reference number: MSA-2026-042."
)

RECORDED_EXTRACTION = {
    "parties": [
        {"name": "Acme Corp", "role": "Supplier"},
        {"name": "Globex Inc", "role": "Client"},
        {"name": "Initech LLC", "role": "Guarantor"},
    ],
    "key_dates": [{"label": "Effective date", "date": "1 March 2026"}],
    "key_terms": [
        {"label": "Termination notice period", "value": "30 days"},
        {"label": "Monthly fee", "value": "$5,000"},
        {"label": "Reference number", "value": "MSA-2026-042"},
    ],
}


# --------------------------------------------------------------------------- #
# Supabase service-role helpers (integration + e2e)
# --------------------------------------------------------------------------- #
def _supabase_env():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    return url, key


@pytest.fixture(scope="session")
def supabase():
    """A tiny service-role Supabase client, or skip if not configured."""
    import httpx

    url, key = _supabase_env()
    if not url or not key:
        pytest.skip("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (integration/e2e only)")

    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    rest = url.rstrip("/") + "/rest/v1"
    storage = url.rstrip("/") + "/storage/v1"

    class Client:
        def incident_id(self) -> str:
            r = httpx.get(f"{rest}/incidents?select=id&limit=1", headers=h, timeout=30)
            r.raise_for_status()
            rows = r.json()
            if not rows:
                pytest.skip("no incident rows to attach extractions to")
            return rows[0]["id"]

        def upload(self, path: str, data: bytes, content_type: str) -> None:
            r = httpx.post(
                f"{storage}/object/incident-docs/{path}",
                headers={**h, "Content-Type": content_type, "x-upsert": "true"},
                content=data, timeout=60,
            )
            r.raise_for_status()

        def create_extraction(self, incident_id: str, path: str, file_name: str) -> str:
            r = httpx.post(
                f"{rest}/document_extractions",
                headers={**h, "Prefer": "return=representation"},
                json={"incident_id": incident_id, "storage_path": path,
                      "file_name": file_name, "status": "pending"}, timeout=30,
            )
            r.raise_for_status()
            return r.json()[0]["id"]

        def get_extraction(self, ext_id: str) -> dict:
            r = httpx.get(f"{rest}/document_extractions?id=eq.{ext_id}&select=*", headers=h, timeout=30)
            r.raise_for_status()
            return r.json()[0]

        def delete_extraction(self, ext_id: str) -> None:
            httpx.delete(f"{rest}/document_extractions?id=eq.{ext_id}", headers=h, timeout=30)

    return Client()


@pytest.fixture
def cleanup_extractions(supabase):
    """Track created extraction ids and delete them after the test."""
    ids: list[str] = []
    yield ids
    for ext_id in ids:
        try:
            supabase.delete_extraction(ext_id)
        except Exception:
            pass
