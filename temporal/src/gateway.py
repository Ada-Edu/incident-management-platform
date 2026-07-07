from __future__ import annotations
"""Tiny HTTP gateway to start extraction workflows.

A Deno Supabase edge function (or the frontend) POSTs here to kick off the
workflow; this keeps the Temporal client server-side. The workflow id makes the
trigger idempotent: starting the same extraction twice is rejected, not duplicated.

    POST /extractions/{extraction_id}/start  ->  { "workflow_id": "...", "run_id": "..." }
    GET  /health                             ->  { "ok": true }
"""
import logging

from fastapi import FastAPI, HTTPException
from temporalio.client import Client
from temporalio.exceptions import WorkflowAlreadyStartedError

from .config import settings
from .workflows.document_extraction import DocumentExtractionWorkflow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Incident extraction gateway")
_client: Client | None = None


async def _get_client() -> Client:
    global _client
    if _client is None:
        _client = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)
    return _client


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.post("/extractions/{extraction_id}/start")
async def start_extraction(extraction_id: str) -> dict:
    client = await _get_client()
    workflow_id = f"doc-extract-{extraction_id}"
    try:
        handle = await client.start_workflow(
            DocumentExtractionWorkflow.run,
            extraction_id,
            id=workflow_id,
            task_queue=settings.temporal_task_queue,
        )
    except WorkflowAlreadyStartedError:
        # Idempotent: the extraction is already running/complete.
        logger.info("extraction already started extraction_id=%s", extraction_id)
        return {"workflow_id": workflow_id, "run_id": None, "already_started": True}
    except Exception as exc:  # noqa: BLE001
        logger.exception("failed to start workflow")
        raise HTTPException(status_code=502, detail=str(exc))
    return {"workflow_id": workflow_id, "run_id": handle.result_run_id, "already_started": False}
