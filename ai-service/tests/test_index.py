import json

import numpy as np
import pytest

from retrieval.index import index_paths, is_stale, load_index, needs_build, save_index

MODEL = "intfloat/multilingual-e5-small"


def write_chunks(base_dir, doc_id, texts):
    path = base_dir / f"{doc_id}.chunks.jsonl"
    path.write_text("".join(json.dumps({"chunk_id": t, "page": 1, "text": t}) + "\n" for t in texts),
                    encoding="utf-8")


def test_index_paths_put_model_name_in_file_name(tmp_path):
    paths = index_paths("doc", MODEL, tmp_path)
    assert paths.chunks.name == "doc.chunks.jsonl"
    assert paths.vectors.name == "doc.intfloat__multilingual-e5-small.npy"
    assert paths.meta.name == "doc.intfloat__multilingual-e5-small.meta.json"


def test_is_stale_when_chunks_or_model_change():
    meta = {"chunks_sha256": "abc", "model": MODEL}
    assert not is_stale(meta, "abc", MODEL)
    assert is_stale(meta, "def", MODEL)
    assert is_stale(meta, "abc", "intfloat/multilingual-e5-base")


def test_save_then_load_round_trip(tmp_path):
    write_chunks(tmp_path, "doc", ["a", "b"])
    paths = index_paths("doc", MODEL, tmp_path)
    vectors = np.eye(2, 3, dtype=np.float32)

    assert needs_build(paths, MODEL)
    save_index(paths, vectors, MODEL)
    assert not needs_build(paths, MODEL)

    index = load_index("doc", MODEL, tmp_path)
    assert [c["text"] for c in index.chunks] == ["a", "b"]
    np.testing.assert_array_equal(index.vectors, vectors)


def test_index_needs_rebuild_after_reingestion(tmp_path):
    write_chunks(tmp_path, "doc", ["a", "b"])
    paths = index_paths("doc", MODEL, tmp_path)
    save_index(paths, np.eye(2, 3, dtype=np.float32), MODEL)

    write_chunks(tmp_path, "doc", ["a", "b", "c"])

    assert needs_build(paths, MODEL)
    with pytest.raises(FileNotFoundError, match="build_index"):
        load_index("doc", MODEL, tmp_path)
