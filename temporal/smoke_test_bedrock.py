"""Phase 0 smoke test: send ONE prompt to our Bedrock endpoint and print the reply.

Run from the temporal/ directory (host or Docker):
    pip install -e .                      # pulls boto3
    export AWS_BEARER_TOKEN_BEDROCK=...   # your Bedrock API key (never commit)
    python smoke_test_bedrock.py

Exit code 0 = the model replied. Non-zero = something to fix before Phase 1.
"""
from __future__ import annotations

import sys

from src.config import settings
from src.model_client import converse_text


def main() -> int:
    print(f"[smoke] region={settings.bedrock_region} model={settings.bedrock_model_id}")
    try:
        text = converse_text(
            "You are a connectivity check.",
            "Reply with exactly: Bedrock reachable.",
        )
    except Exception as exc:  # noqa: BLE001 -- smoke test: surface any failure plainly
        print(f"[smoke] FAILED: {type(exc).__name__}: {exc}")
        return 1

    print(f"[smoke] response: {text.strip()!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
