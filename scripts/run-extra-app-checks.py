"""Exercise prebuilt services and the real browser UI, then stop test servers."""
import functools
import http.client
import http.server
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request

repo = Path(__file__).resolve().parents[1]


class Frontend(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health' or self.path.startswith('/api/'):
            self.proxy()
        else:
            super().do_GET()

    def do_POST(self):
        self.proxy()

    def proxy(self):
        upstream = http.client.HTTPConnection('127.0.0.1', 3401, timeout=20)
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        upstream.request(self.command, self.path, body, dict(self.headers))
        response = upstream.getresponse()
        self.send_response(response.status)
        for key, value in response.getheaders():
            if key.lower() not in ('transfer-encoding', 'connection'):
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(response.read())
        upstream.close()

    def log_message(self, *args):
        pass


processes = []
with tempfile.TemporaryDirectory(prefix='giorgi-extra-check-') as directory:
    root = Path(directory)
    shutil.copytree(repo / 'dist/apps/angular-compiler-api', root / 'compiler')
    (root / 'compiler/node_modules').symlink_to(repo / 'deploy/compiler-runtime/node_modules', target_is_directory=True)
    with open('/tmp/extra-app-local-servers.log', 'w') as log:
        try:
            services = [
                (['node', str(root / 'compiler/main.js')], {'PORT': '3401', 'COMPILER_NODE_MODULES': str(root / 'compiler/node_modules')}),
                (['node', 'dist/example-mcp/main.js', '--http', '3411'], {}),
                (['node', 'dist/mcp-gateway/main.js'], {'MCP_GATEWAY_PORT': '3421', 'EXAMPLE_MCP_URL': 'http://127.0.0.1:3411'}),
                (['node', 'dist/portfolio-api/main.js'], {'PORT': '3431'}),
            ]
            for command, extra in services:
                processes.append(subprocess.Popen(command, cwd=repo, env=os.environ | {'HOST': '127.0.0.1'} | extra, stdout=log, stderr=log))
            for port, health in [(3401, '/health'), (3411, '/health'), (3421, '/health'), (3431, '/api/health')]:
                for attempt in range(50):
                    try:
                        urllib.request.urlopen(f'http://127.0.0.1:{port}{health}', timeout=1)
                        break
                    except Exception:
                        time.sleep(.2)
                else:
                    raise RuntimeError(f'Service on {port} failed to start; see /tmp/extra-app-local-servers.log')
            assert all(process.poll() is None for process in processes)
            subprocess.run(['node', 'scripts/check-extra-services.cjs'], cwd=repo, check=True)
            frontend = http.server.ThreadingHTTPServer(('127.0.0.1', 4200), functools.partial(Frontend, directory=str(repo / 'dist/apps/angular-compiler-ui/browser')))
            threading.Thread(target=frontend.serve_forever, daemon=True).start()
            try:
                subprocess.run(['node', 'scripts/check-compiler-browser.cjs'], cwd=repo, env=os.environ | {'COMPILER_UI_URL': 'http://127.0.0.1:4200'}, check=True)
            finally:
                frontend.shutdown()
                frontend.server_close()
        finally:
            for process in processes:
                process.terminate()
            for process in processes:
                process.wait()
