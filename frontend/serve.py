#!/usr/bin/env python3
"""No-cache dev server — always sends fresh files."""
import http.server, socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, fmt, *args):
        pass  # quiet

PORT = 8080
with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"🚀  ThirstCast dev server: http://127.0.0.1:{PORT}/index.html")
    httpd.serve_forever()
