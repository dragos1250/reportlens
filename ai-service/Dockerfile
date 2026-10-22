# AI service (FastAPI) and the one-shot "setup" service share this image.
# Build context: the repository root (the service also needs scripts/).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf \
    HF_HUB_DISABLE_TELEMETRY=1

WORKDIR /app/ai-service

# CPU-only torch from the official PyTorch index, installed first: the default Linux wheel
# also brings the CUDA libraries, which this service never uses.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1

COPY ai-service/requirements.txt .
RUN pip install -r requirements.txt

# The embedding model is part of the image, so starting a container needs no download.
# The re-ranker is not: it is only loaded for the optional "hybrid+rerank" method.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('intfloat/multilingual-e5-small', device='cpu')"
ENV HF_HUB_OFFLINE=1

COPY scripts/download_reports.py scripts/reports.json /app/scripts/
COPY ai-service/ .

RUN useradd --create-home --uid 10001 app && mkdir -p /app/data && chown app /app/data
USER app

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=6 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
