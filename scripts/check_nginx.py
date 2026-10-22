"""Check what the frontend's nginx actually serves: content types, the app's routes, 404s.

Standard library and Docker only. Usage (from the repository root):
    python scripts/check_nginx.py                          # frontend/nginx.conf + sample files, a few seconds
    python scripts/check_nginx.py --image reportlens-frontend  # a built image, with its real assets

Why: the unit tests run in Node and never ask nginx for a file, so a wrong content type
(pdf.js's worker .mjs sent as application/octet-stream, which the browser refuses to run)
passed every test and broke the PDF viewer in Docker only.
"""

import argparse
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
NGINX_CONF = REPO_ROOT / "frontend" / "nginx.conf"
NGINX_IMAGE = "nginx:alpine"  # as in frontend/Dockerfile
JS_TYPES = ("text/javascript", "application/javascript")

SAMPLE_FILES = {
    "index.html": "<!doctype html><title>ReportLens</title>",
    "assets/index-sample.js": "export const a = 1",
    "assets/pdf.worker.min-sample.mjs": "export const b = 2",
    "assets/index-sample.css": "body{}",
}


def docker(*args: str) -> str:
    return subprocess.run(["docker", *args], check=True, capture_output=True, text=True).stdout.strip()


def fetch(base: str, path: str) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(base + path, timeout=5) as response:
            return response.status, response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("Content-Type", "")


def start(image: str | None, site: Path | None) -> str:
    # nginx resolves the proxy_pass host at start; point "backend" anywhere so it starts alone.
    args = ["run", "-d", "--rm", "-p", "127.0.0.1::80", "--add-host", "backend:127.0.0.1"]
    if image is None:
        args += ["-v", f"{NGINX_CONF}:/etc/nginx/conf.d/default.conf:ro",
                 "-v", f"{site}:/usr/share/nginx/html:ro", NGINX_IMAGE]
    else:
        args += [image]
    return docker(*args)


def checks(assets: list[str]) -> list[tuple[str, int, tuple[str, ...] | None]]:
    """(path, expected status, accepted content types or None)."""
    expected = []
    for name in assets:
        if name.endswith((".js", ".mjs")):
            expected.append((f"/assets/{name}", 200, JS_TYPES))
        elif name.endswith(".css"):
            expected.append((f"/assets/{name}", 200, ("text/css",)))
    expected += [
        ("/", 200, ("text/html",)),
        ("/reports/some-app-route", 200, ("text/html",)),  # the React app handles its own routes
        ("/actuator", 404, None),
        ("/actuator/health", 404, None),
        ("/assets/missing-module.mjs", 404, None),  # never index.html for a missing module
    ]
    return expected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--image", help="check a built frontend image instead of nginx.conf with sample files")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        site = None
        if args.image is None:
            site = Path(tmp)
            for name, text in SAMPLE_FILES.items():
                (site / name).parent.mkdir(parents=True, exist_ok=True)
                (site / name).write_text(text, encoding="utf-8")
        container = start(args.image, site)
        try:
            base = "http://" + docker("port", container, "80/tcp").splitlines()[0].replace("0.0.0.0", "127.0.0.1")
            for _ in range(50):  # nginx needs a moment to start
                try:
                    fetch(base, "/")
                    break
                except (urllib.error.URLError, ConnectionError):
                    time.sleep(0.1)
            assets = docker("exec", container, "ls", "/usr/share/nginx/html/assets").split()
            failures = 0
            for path, status, types in checks(assets):
                got_status, got_type = fetch(base, path)
                ok = got_status == status and (types is None or got_type.split(";")[0].strip() in types)
                failures += not ok
                print(f"{'ok  ' if ok else 'FAIL'} {path} -> {got_status} {got_type}")
        finally:
            docker("rm", "-f", container)
    print("all checks passed" if failures == 0 else f"{failures} check(s) failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
