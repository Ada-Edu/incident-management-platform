from __future__ import annotations
"""DocumentExtractionWorkflow — orchestrates the extraction pipeline.

fetch_document -> extract_fields (model) -> persist_extraction, with per-activity
retry/timeout policies. Deterministic guard-rail rejections and model errors are
routed to persist_failure so the row never stays 'pending'. See ADR-0001.
"""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError

with workflow.unsafe.imports_passed_through():
    from ...activities import document_extraction as acts


@workflow.defn
class DocumentExtractionWorkflow:
    @workflow.run
    async def run(self, extraction_id: str) -> dict:
        await workflow.execute_activity(
            acts.mark_running,
            extraction_id,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=5),
        )

        # 1) Fetch + guard rails. Transient errors retried; deterministic
        #    rejections come back as ok=False (see activity).
        fetched = await workflow.execute_activity(
            acts.fetch_document,
            extraction_id,
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=RetryPolicy(
                initial_interval=timedelta(seconds=1),
                backoff_coefficient=2.0,
                maximum_attempts=3,
            ),
        )
        if not fetched["ok"]:
            await self._fail(extraction_id, fetched["reason"], fetched.get("page_count"))
            return {"status": "failed", "reason": fetched["reason"]}

        page_count = fetched.get("page_count")

        # 2) THE MODEL CALL. boto exceptions retried per policy; malformed JSON
        #    surfaces as a non-retryable model_error.
        try:
            extracted = await workflow.execute_activity(
                acts.extract_fields,
                fetched["text"],
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=RetryPolicy(
                    initial_interval=timedelta(seconds=2),
                    backoff_coefficient=2.0,
                    maximum_interval=timedelta(seconds=60),
                    maximum_attempts=4,
                ),
            )
        except ActivityError:
            # Any terminal failure of the model activity — a non-retryable
            # model_error (malformed output) OR transient errors that exhausted
            # the retry policy — must still produce a TERMINAL row, never a stuck
            # 'running'. Reason is model_error either way (the model step failed);
            # the specific cause remains in the workflow history.
            await self._fail(extraction_id, "model_error", page_count)
            return {"status": "failed", "reason": "model_error"}

        # 3) Persist success (idempotent upsert on unique id).
        await workflow.execute_activity(
            acts.persist_extraction,
            args=[extraction_id, extracted["result"], page_count, extracted["model_id"]],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=5),
        )
        return {"status": "succeeded", "result": extracted["result"]}

    async def _fail(self, extraction_id: str, reason: str, page_count):
        await workflow.execute_activity(
            acts.persist_failure,
            args=[extraction_id, reason, page_count],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=5),
        )
