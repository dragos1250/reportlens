"""Download the public reports listed in scripts/reports.json into data/raw/.

Standard library only. Usage (from the repository root):
    python scripts/download_reports.py              # all reports
    python scripts/download_reports.py vodafone-fy26
"""

import hashlib
import json
import shutil
import sys
from pathlib import Path
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "scripts" / "reports.json"
RAW_DIR = REPO_ROOT / "data" / "raw"
USER_AGENT = "ReportLens/0.1 (personal portfolio project)"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def check_hash(path: Path, expected: str | None) -> str:
    actual = sha256_of(path)
    if expected and actual != expected:
        raise ValueError(f"{path.name}: sha256 {actual} does not match manifest {expected}")
    return actual


def download(report: dict) -> None:
    target = RAW_DIR / f"{report['doc_id']}.pdf"
    if target.exists():
        print(f"skip  {target.name} (already downloaded, sha256 {check_hash(target, report.get('sha256'))})")
        return

    print(f"get   {report['url']}")
    partial = target.with_suffix(".part")  # never leave a half-written .pdf behind
    request = Request(report["url"], headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=60) as response, partial.open("wb") as f:
        shutil.copyfileobj(response, f)

    with partial.open("rb") as f:
        if f.read(5) != b"%PDF-":
            partial.unlink()
            raise ValueError(f"{report['url']} did not return a PDF")
    try:
        digest = check_hash(partial, report.get("sha256"))
    except ValueError:
        partial.unlink()
        raise
    partial.rename(target)
    print(f"saved {target.relative_to(REPO_ROOT)} ({target.stat().st_size} bytes, sha256 {digest})")


def main() -> None:
    reports = json.loads(MANIFEST.read_text(encoding="utf-8"))
    wanted = set(sys.argv[1:])
    unknown = wanted - {r["doc_id"] for r in reports}
    if unknown:
        sys.exit(f"unknown doc_id: {', '.join(sorted(unknown))}")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for report in reports:
        if not wanted or report["doc_id"] in wanted:
            download(report)


if __name__ == "__main__":
    main()
