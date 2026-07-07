"""E2E — the real path against the running stack: upload → gateway starts the
Temporal workflow → the deployed worker calls REAL Bedrock → fields land in
Supabase. Few, high-value.

Gated on RUN_E2E=1 (needs the docker stack + Bedrock credentials up). Assertions
are on real model output, so they check stable VALUES (party names, the fee, the
notice period) while tolerating label wording.
"""
from __future__ import annotations

import os
import time
import uuid

import httpx
import pytest

from tests.conftest import make_docx, CONTRACT_TEXT

pytestmark = pytest.mark.e2e

DOCX_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
GATEWAY = os.environ.get("E2E_GATEWAY_URL", "http://host.docker.internal:8088")


@pytest.fixture(autouse=True)
def _require_e2e():
    if os.environ.get("RUN_E2E") != "1":
        pytest.skip("E2E disabled (set RUN_E2E=1 against a live stack)")


def test_live_extraction_lands_real_fields_in_supabase(supabase, cleanup_extractions):
    # 1) upload a real contract + create the pending row
    path = f"e2e/{uuid.uuid4()}-msa.docx"
    supabase.upload(path, make_docx(CONTRACT_TEXT), DOCX_CT)
    ext_id = supabase.create_extraction(supabase.incident_id(), path, "msa.docx")
    cleanup_extractions.append(ext_id)

    # 2) trigger the workflow through the real gateway
    r = httpx.post(f"{GATEWAY}/extractions/{ext_id}/start", timeout=20)
    r.raise_for_status()

    # 3) poll Supabase for the terminal state (real Bedrock call happens here)
    deadline = time.time() + 90
    row = supabase.get_extraction(ext_id)
    while row["status"] in ("pending", "running") and time.time() < deadline:
        time.sleep(3)
        row = supabase.get_extraction(ext_id)

    # 4) behavioural assertions on REAL extracted values
    assert row["status"] == "succeeded", f"ended {row['status']} / {row.get('failure_reason')}"
    names = {p["name"] for p in row["result"]["parties"]}
    assert {"Acme Corp", "Globex Inc", "Initech LLC"}.issubset(names), names
    terms_blob = " ".join(t["value"] for t in row["result"]["key_terms"])
    assert "5,000" in terms_blob or "5000" in terms_blob
    assert "30" in terms_blob
    dates_blob = " ".join(d["date"] for d in row["result"]["key_dates"])
    assert "2026" in dates_blob
