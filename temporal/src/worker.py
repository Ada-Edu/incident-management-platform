from __future__ import annotations
"""Temporal worker entrypoint for the Incident Management Platform.

Registers the Document Field Extraction workflow + activities on the
`incident-main` task queue. Activities are synchronous (httpx/boto3/pypdf), so
they run in a thread pool.
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from temporalio.client import Client
from temporalio.worker import Worker

from .config import settings
from .activities import document_extraction as acts
from .workflows.document_extraction import DocumentExtractionWorkflow

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("worker connecting address=%s namespace=%s", settings.temporal_address, settings.temporal_namespace)
    client = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)

    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[DocumentExtractionWorkflow],
        activities=[
            acts.mark_running,
            acts.fetch_document,
            acts.extract_fields,
            acts.persist_extraction,
            acts.persist_failure,
        ],
        activity_executor=ThreadPoolExecutor(max_workers=20),
    )
    logger.info("worker started task_queue=%s", settings.temporal_task_queue)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
