"""UNIT — the extraction system prompt encodes the spec's contract.

If these guarantees drift, extraction quality/behaviour silently changes, so we
pin the load-bearing instructions.
"""
from src.activities import document_extraction as de


def test_prompt_requires_single_json_object():
    assert "ONLY a single JSON object" in de._SYSTEM_PROMPT


def test_prompt_defines_all_three_groups():
    for key in ("parties", "key_dates", "key_terms"):
        assert key in de._SYSTEM_PROMPT


def test_prompt_forbids_invention():
    assert "Never invent" in de._SYSTEM_PROMPT


def test_prompt_defines_key_terms_scope():
    # The spec's full definition of a Key Term must be conveyed to the model:
    # monetary amounts, obligations, service levels (SLAs), durations/notice
    # periods, and reference numbers.
    for token in ("monetary amounts", "obligations", "service levels",
                  "durations/notice periods", "reference numbers"):
        assert token in de._SYSTEM_PROMPT


def test_prompt_requires_role_or_null():
    assert "role=null" in de._SYSTEM_PROMPT or "role where" in de._SYSTEM_PROMPT


def test_prompt_requires_empty_array_for_absent_groups():
    """Maps to Story 2: an empty group is still returned (heading shown with
    'None found'), so the model must emit [] rather than omit the group."""
    assert "empty array" in de._SYSTEM_PROMPT


def test_prompt_encodes_exact_output_schema():
    """The three group keys and the nullable party role are pinned in the schema
    the model is told to match, so downstream mapping stays in sync."""
    for token in ('"parties"', '"key_dates"', '"key_terms"',
                  '"name":string,"role":string|null'):
        assert token in de._SYSTEM_PROMPT
