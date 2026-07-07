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
    # The spec's definition of a Key Term must be conveyed to the model.
    for token in ("monetary amounts", "service levels", "reference numbers"):
        assert token in de._SYSTEM_PROMPT


def test_prompt_requires_role_or_null():
    assert "role=null" in de._SYSTEM_PROMPT or "role where" in de._SYSTEM_PROMPT
