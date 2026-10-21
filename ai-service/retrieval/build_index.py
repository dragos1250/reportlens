"""CLI: embed all chunks of a document and save the vectors.

Usage (from ai-service/):
    python -m retrieval.build_index --doc-id vodafone-20f-fy26 [--model intfloat/multilingual-e5-small]
"""

import argparse
import time

from .embedder import DEFAULT_MODEL, Embedder
from .index import index_paths, load_chunks, needs_build, save_index


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the vector index for one document.")
    parser.add_argument("--doc-id", required=True)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--force", action="store_true", help="rebuild even if the index is up to date")
    args = parser.parse_args()

    paths = index_paths(args.doc_id, args.model)
    if not args.force and not needs_build(paths, args.model):
        print(f"up to date: {paths.vectors.name}")
        return

    chunks = load_chunks(paths.chunks)

    start = time.perf_counter()
    embedder = Embedder(args.model)
    loaded = time.perf_counter()
    vectors = embedder.embed_passages([c["text"] for c in chunks], show_progress=True)
    done = time.perf_counter()
    save_index(paths, vectors, args.model)

    print(f"model:      {args.model} (loaded in {loaded - start:.1f}s)")
    print(f"vectors:    {vectors.shape[0]} x {vectors.shape[1]}")
    print(f"embedding:  {done - loaded:.1f}s")
    print(f"written to: {paths.vectors} ({paths.vectors.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
