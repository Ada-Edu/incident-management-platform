"""E2E — the real path against the running stack: upload → gateway starts the
Temporal workflow → the deployed worker calls REAL Bedrock → fields land in
Supabase. Few (2-3), high-value.

Gated on RUN_E2E=1 (needs the docker stack + Bedrock credentials up). Assertions
are on real model output, so they check extraction QUALITY (right parties, right
role-to-party mapping, no hallucinated/decoy entities) rather than string echoes.

Why not assert against CONTRACT_TEXT: feeding a doc and asserting strings that
appear verbatim in that input passes even for an echoing/hallucinating model. We
build a document with a KNOWN ground-truth dict below and a DECOY name that is in
the prose but is NOT a party, then assert the model got the semantics right.
"""
from __future__ import annotations

import os
import time
import uuid

import httpx
import pytest

from tests.conftest import make_docx

pytestmark = pytest.mark.e2e

DOCX_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
GATEWAY = os.environ.get("E2E_GATEWAY_URL", "http://host.docker.internal:8088")

# Acceptance criterion (spec Story 1): fields return within 30 seconds for a
# document of 20 pages or fewer. We MEASURE wall-clock from gateway-start to the
# terminal status and assert it is under this budget.
LATENCY_BUDGET_S = 30.0
# Poll headroom well beyond the budget so a *slow* run still yields a row to
# assert the measured latency against (rather than timing out with no data).
POLL_DEADLINE_S = 120.0


# --------------------------------------------------------------------------- #
# Ground-truth document builder (finding #1)
# --------------------------------------------------------------------------- #
# A short contract whose correct extraction requires UNDERSTANDING, not echoing:
#   - exactly TWO parties are named, each with a role;
#   - "Wingfield" appears prominently in prose but is a place, NOT a party — a
#     model that pattern-matches capitalised tokens would wrongly extract it.
# GROUND_TRUTH is the single source of truth for the assertions.
GROUND_TRUTH = {
    "parties": {
        "Acme Corp": "Supplier",
        "Globex Inc": "Client",
    },
    "decoys": ["Wingfield"],  # named in prose; must NOT be extracted as a party
    "date_year": "2027",
    "fee": "7,500",
    "notice_days": "45",
}

# Note the deliberately awkward decoy: "the Wingfield district" is a location, and
# the signing is described happening there — no party is called Wingfield.
GROUND_TRUTH_TEXT = (
    "This Services Agreement is entered into by Acme Corp, acting as the Supplier, "
    "and Globex Inc, acting as the Client.\n"
    "The agreement was negotiated and signed at the offices in the Wingfield district; "
    "Wingfield is a location and is not a party to this agreement.\n"
    "Effective date: 1 April 2027.\n"
    "Monthly service fee: $7,500. Termination notice period: 45 days."
)


def _make_ground_truth_docx() -> bytes:
    return make_docx(GROUND_TRUTH_TEXT)


def _substring_ci(needle: str, haystack: str) -> bool:
    return needle.lower() in haystack.lower()


def _poll_to_terminal(supabase, ext_id: str, deadline_s: float = POLL_DEADLINE_S) -> tuple[dict, float]:
    """Return (row, elapsed_seconds) once status leaves pending/running.

    elapsed is measured from the moment BEFORE this call (the caller times the
    gateway-start immediately before) — see the latency assertion.
    """
    started = time.monotonic()
    deadline = started + deadline_s
    row = supabase.get_extraction(ext_id)
    while row["status"] in ("pending", "running") and time.monotonic() < deadline:
        time.sleep(1)
        row = supabase.get_extraction(ext_id)
    elapsed = time.monotonic() - started
    return row, elapsed


# --------------------------------------------------------------------------- #
# E2E 1 — extraction QUALITY + latency on real model output
#   Covers findings #1 (quality) and #3 (latency), spec Story 1 / Story 3.
# --------------------------------------------------------------------------- #
def test_live_extraction_quality_and_latency(supabase, cleanup_extractions):
    # 1) upload a ground-truth contract + create the pending row
    path = f"e2e/{uuid.uuid4()}-services.docx"
    supabase.upload(path, _make_ground_truth_docx(), DOCX_CT)
    ext_id = supabase.create_extraction(supabase.incident_id(), path, "services.docx")
    cleanup_extractions.append(ext_id)

    # 2) trigger the workflow through the real gateway, timing from just before.
    start = time.monotonic()
    r = httpx.post(f"{GATEWAY}/extractions/{ext_id}/start", timeout=20)
    r.raise_for_status()

    # 3) poll Supabase for the terminal state (real Bedrock call happens here)
    row, elapsed = _poll_to_terminal(supabase, ext_id)
    # measure wall-clock from gateway-start to terminal status
    latency = time.monotonic() - start

    # 4a) terminal state
    assert row["status"] == "succeeded", f"ended {row['status']} / {row.get('failure_reason')}"

    # 4b) LATENCY (finding #3, AC "within 30 seconds"): MEASURE and assert.
    assert latency < LATENCY_BUDGET_S, (
        f"extraction took {latency:.1f}s, budget is {LATENCY_BUDGET_S}s "
        f"(poll loop elapsed {elapsed:.1f}s)"
    )

    result = row["result"]
    parties = result["parties"]
    extracted_names = [p["name"] for p in parties]
    roles_by_name = {p["name"]: p.get("role") for p in parties}

    # 4c) NO HALLUCINATED / DECOY ENTITIES (finding #1a + #1c):
    # the count of parties equals the number actually named in the doc...
    assert len(parties) == len(GROUND_TRUTH["parties"]), (
        f"expected exactly {len(GROUND_TRUTH['parties'])} parties, got {extracted_names}"
    )
    # ...every extracted party name is grounded in the source text...
    for name in extracted_names:
        assert _substring_ci(name, GROUND_TRUTH_TEXT), f"hallucinated party not in source: {name!r}"
    # ...and the decoy that is in the prose is NOT extracted as a party.
    for decoy in GROUND_TRUTH["decoys"]:
        assert all(not _substring_ci(decoy, n) for n in extracted_names), (
            f"decoy {decoy!r} (a location, not a party) was wrongly extracted: {extracted_names}"
        )

    # 4d) ROLE MAPS TO THE CORRECT PARTY (finding #1b): not just "the string exists
    # somewhere" — Acme=Supplier and Globex=Client on the right rows.
    for name, expected_role in GROUND_TRUTH["parties"].items():
        match = next((p for p in parties if _substring_ci(name, p["name"])), None)
        assert match is not None, f"expected party {name!r} missing from {extracted_names}"
        assert match.get("role") and _substring_ci(expected_role, match["role"]), (
            f"party {name!r} should map to role {expected_role!r}, got {roles_by_name}"
        )

    # 4e) key dates / terms are grounded in the doc (values requiring reading, not
    # present as bare labels the model could echo).
    dates_blob = " ".join(d["date"] for d in result["key_dates"])
    assert GROUND_TRUTH["date_year"] in dates_blob, dates_blob
    terms_blob = " ".join(t["value"] for t in result["key_terms"])
    assert (GROUND_TRUTH["fee"] in terms_blob or GROUND_TRUTH["fee"].replace(",", "") in terms_blob), terms_blob
    assert GROUND_TRUTH["notice_days"] in terms_blob, terms_blob


# --------------------------------------------------------------------------- #
# E2E 2 — failure path through the REAL stack (unsupported type)
#   Covers the requested failure-path e2e + spec edge case "Unsupported file type".
# --------------------------------------------------------------------------- #
def test_live_unsupported_type_fails_and_retains_attachment(supabase, cleanup_extractions):
    # upload a .txt through the real path — extraction is not supported for it.
    path = f"e2e/{uuid.uuid4()}-notes.txt"
    payload = b"just some plain text that is not a supported document type"
    supabase.upload(path, payload, "text/plain")
    ext_id = supabase.create_extraction(supabase.incident_id(), path, "notes.txt")
    cleanup_extractions.append(ext_id)

    r = httpx.post(f"{GATEWAY}/extractions/{ext_id}/start", timeout=20)
    r.raise_for_status()

    row, _elapsed = _poll_to_terminal(supabase, ext_id)

    # row ends failed with the specific, typed reason
    assert row["status"] == "failed", f"expected failed, got {row['status']}"
    assert row["failure_reason"] == "unsupported_type", row.get("failure_reason")
    # no partial or guessed fields on a failure
    assert row["result"] == {"parties": [], "key_dates": [], "key_terms": []}, row["result"]

    # the attachment is RETAINED (spec: "the attachment is kept") — the object is
    # still downloadable in its original form.
    still_there = supabase.download_object(_STORAGE_BUCKET, path) if hasattr(supabase, "download_object") else None
    if still_there is not None:
        assert still_there == payload
    else:
        # Fallback: assert the storage object still resolves via a HEAD/GET.
        _assert_object_retained(supabase, path, payload)


# --------------------------------------------------------------------------- #
# Storage-retention helper (no download_object on the shared client)
# --------------------------------------------------------------------------- #
_STORAGE_BUCKET = "incident-docs"


def _assert_object_retained(supabase, path: str, expected: bytes) -> None:
    """Fetch the stored object directly via the storage API and assert it is
    byte-for-byte the original upload. Uses only the public env the fixture uses.
    """
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        pytest.skip("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    resp = httpx.get(f"{url}/storage/v1/object/{_STORAGE_BUCKET}/{path}", headers=h, timeout=30)
    assert resp.status_code == 200, f"attachment not retained (status {resp.status_code})"
    assert resp.content == expected, "attachment bytes changed — original not preserved"


# --------------------------------------------------------------------------- #
# FRONTEND GAP — skipped placeholder (findings #2 "shown beside source" + #4
# "None found"). The backend e2e cannot reach the rendered ExtractionPanel; this
# documents the intended assertion for a Playwright test the frontend team owns.
# See the summary/recommendation returned with this change.
# --------------------------------------------------------------------------- #
@pytest.mark.skip(
    reason="FRONTEND GAP (#2/#4): backend e2e cannot assert the rendered "
    "ExtractionPanel. Needs a Playwright test at http://localhost:3000 that logs "
    "in, uploads a doc, and asserts the three headings render beside the source "
    "with 'None found' for empty groups. Tracked for the frontend team."
)
def test_frontend_panel_renders_headings_and_none_found_PLACEHOLDER():
    # Intended (Playwright, out of scope for this backend suite):
    #   1. log in at http://localhost:3000
    #   2. open an incident and upload a supported document
    #   3. wait for the ExtractionPanel to leave its spinner state
    #   4. assert the source document (filename + download control) is visible
    #      alongside the fields ("beside the source" — finding #2)
    #   5. assert exactly three headings render with the exact labels
    #      "Parties", "Key Dates", "Key Terms"
    #   6. for a group with no qualifying content, assert it shows "None found"
    #      rather than being blank/omitted (finding #4)
    raise AssertionError("frontend placeholder — must be implemented in the web e2e suite")
