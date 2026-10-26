#!/usr/bin/env python3
"""Serve web/ on every interface so a phone on the same Wi-Fi can open it.

Stdlib only. Sends no-store so an edited file shows up on the next reload
instead of hiding behind the browser's heuristic cache. Also sends the
response headers from web/_headers (the Content-Security-Policy included), so
a page that would break on the live site breaks here first.
"""
import functools
import http.server
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"


def site_headers():
    """Headers for every path from web/_headers (Cloudflare's format): the
    indented lines under a `/*` rule. Cache-Control is left to the dev
    server, which wants no-store."""
    found = {}
    applies = False
    try:
        lines = (WEB / "_headers").read_text().splitlines()
    except OSError:
        return found
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line[0].isspace():
            applies = line.strip() == "/*"
        elif applies and ":" in line:
            name, value = line.split(":", 1)
            if name.strip().lower() != "cache-control":
                found[name.strip()] = value.strip()
    return found


class NoStore(http.server.SimpleHTTPRequestHandler):
    # The web app manifest's own type, as Cloudflare sends it; an older
    # Python's mimetypes does not know .webmanifest.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        for name, value in site_headers().items():
            self.send_header(name, value)
        super().end_headers()

    def do_GET(self):
        # The deploy stamps web/version.json; a dev copy has none, and the
        # app would log a 404 on every load. Answer "dev" instead.
        path = self.path.split("?")[0]
        # The cloud's API lives in the Worker (worker/), not here. The app
        # asks /api/cloud whether there is one; say no, plainly, instead of a
        # 404 the console would print in red (docs/design/cloud-profiles.md § 13).
        if path == "/api/cloud":
            body = b'{"ok":false,"why":"dev server: no cloud"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/version.json" and not (WEB / "version.json").exists():
            body = b'{"version":"dev"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def lan_ip():
    # Connecting a UDP socket sends nothing; it only asks the OS which
    # interface would route there.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


def main():
    args = sys.argv[1:]
    port = int(args[0]) if args else 8765
    handler = functools.partial(NoStore, directory=str(WEB))
    try:
        # A page asks for ~50 files at once; the default queue of 5 waiting
        # connections may be why a load under `just look` once failed (not proven).
        http.server.ThreadingHTTPServer.request_queue_size = 128
        server = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    except OSError as err:
        print("❌ Port {} is busy ({}). The soundboard may already be running:".format(port, err.strerror))
        print("   open http://localhost:{}/, or start another copy with `just serve {}`.".format(port, port + 1))
        sys.exit(1)
    print("🔊 Noodle Pads")
    print("   this Mac:    http://localhost:{}/".format(port))
    ip = lan_ip()
    if ip:
        print("   same Wi-Fi:  http://{}:{}/   (plays and uploads; recording needs `just phone`)".format(ip, port))
    print("   Ctrl-C stops it.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
