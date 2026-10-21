"""Store chunk vectors next to the chunks file, and load them back.

For document <doc_id> and model <org>/<name>, in data/processed/:
    <doc_id>.chunks.jsonl                  chunks (from ingestion)
    <doc_id>.<org>__<name>.npy             float32 matrix, row i = line i of the JSONL
    <doc_id>.<org>__<name>.meta.json       model, dimension, hash of the JSONL
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

PROCESSED_DIR = Path(__file__).resolve().parents[2] / "data" / "processed"


@dataclass
class IndexPaths:
    chunks: Path
    vectors: Path
    meta: Path


@dataclass
class Index:
    chunks: list[dict]
    vectors: np.ndarray
    model_name: str


def index_paths(doc_id: str, model_name: str, base_dir: Path = PROCESSED_DIR) -> IndexPaths:
    stem = f"{doc_id}.{model_name.replace('/', '__')}"
    return IndexPaths(
        chunks=base_dir / f"{doc_id}.chunks.jsonl",
        vectors=base_dir / f"{stem}.npy",
        meta=base_dir / f"{stem}.meta.json",
    )


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_chunks(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def is_stale(meta: dict, chunks_sha256: str, model_name: str) -> bool:
    """True if the vectors were built from other chunks or with another model."""
    return meta.get("chunks_sha256") != chunks_sha256 or meta.get("model") != model_name


def needs_build(paths: IndexPaths, model_name: str) -> bool:
    if not paths.vectors.exists() or not paths.meta.exists():
        return True
    meta = json.loads(paths.meta.read_text(encoding="utf-8"))
    return is_stale(meta, file_sha256(paths.chunks), model_name)


def save_index(paths: IndexPaths, vectors: np.ndarray, model_name: str) -> None:
    np.save(paths.vectors, vectors)
    meta = {
        "model": model_name,
        "dim": int(vectors.shape[1]),
        "count": int(vectors.shape[0]),
        "chunks_file": paths.chunks.name,
        "chunks_sha256": file_sha256(paths.chunks),
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    paths.meta.write_text(json.dumps(meta, indent=2), encoding="utf-8")


def load_index(doc_id: str, model_name: str, base_dir: Path = PROCESSED_DIR) -> Index:
    paths = index_paths(doc_id, model_name, base_dir)
    if needs_build(paths, model_name):
        raise FileNotFoundError(
            f"no up-to-date index for {doc_id} with {model_name}; "
            f"run: python -m retrieval.build_index --doc-id {doc_id} --model {model_name}"
        )
    chunks = load_chunks(paths.chunks)
    vectors = np.load(paths.vectors)
    if len(chunks) != vectors.shape[0]:
        raise ValueError(f"{paths.vectors.name}: {vectors.shape[0]} vectors for {len(chunks)} chunks")
    return Index(chunks=chunks, vectors=vectors, model_name=model_name)
