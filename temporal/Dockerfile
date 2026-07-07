# Temporal worker + extraction gateway image.
FROM python:3.12-slim
WORKDIR /app

# System deps kept minimal; pypdf/python-docx are pure-python.
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

# Default command runs the worker; the gateway service overrides it in compose.
CMD ["python", "-m", "src.worker"]
