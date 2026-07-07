from __future__ import annotations
"""Minimal synchronous Supabase client for the Temporal worker.

Activities run in a ThreadPoolExecutor (sync), so we use httpx synchronously
against PostgREST + Storage with the service-role key (bypasses RLS). Only the
operations the Document Field Extraction feature needs are implemented.
"""
from typing import Any

import httpx

from .config import settings


def _headers() -> dict[str, str]:
    key = settings.supabase_service_role_key
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _rest_url(table: str) -> str:
    return f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}"


def get_extraction(extraction_id: str) -> dict[str, Any] | None:
    """Fetch a document_extractions row by id."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            _rest_url("document_extractions"),
            headers=_headers(),
            params={"id": f"eq.{extraction_id}", "select": "*", "limit": "1"},
        )
        resp.raise_for_status()
        rows = resp.json()
    return rows[0] if rows else None


def update_extraction(extraction_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Idempotent update of a single extraction row (keyed by unique id)."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.patch(
            _rest_url("document_extractions"),
            headers=_headers(),
            params={"id": f"eq.{extraction_id}"},
            json=patch,
        )
        resp.raise_for_status()
        rows = resp.json()
    return rows[0] if rows else {}


def download_object(bucket: str, path: str) -> bytes:
    """Download a Storage object's bytes via the service role."""
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{path.lstrip('/')}"
    key = settings.supabase_service_role_key
    with httpx.Client(timeout=60.0) as client:
        resp = client.get(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        resp.raise_for_status()
        return resp.content
