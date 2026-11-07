"""Local extensionless preview. Form submissions are deliberately not forwarded."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parts = Path(unquote(urlsplit(self.path).path)).parts
        if any(part.startswith(".") for part in parts):
            self.send_error(404)
            return
        super().do_GET()

    def translate_path(self, path):
        translated = Path(super().translate_path(path))
        if not translated.suffix and translated.with_suffix(".html").is_file():
            return str(translated.with_suffix(".html"))
        return str(translated)

    def do_POST(self):
        self.send_response(503)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write('{"error":"ローカルプレビューでは送信できません。"}'.encode())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    print(f"Preview: http://127.0.0.1:{args.port} (form forwarding disabled)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Preview).serve_forever()
