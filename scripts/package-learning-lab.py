"""Package only the Angular Learning Lab's tested browser and compiler builds."""
import argparse
import tarfile
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("archive", type=Path)
args = parser.parse_args()

browser = repo / "dist/apps/angular-compiler-ui/browser"
compiler = repo / "dist/apps/angular-compiler-api"
libraries = repo / "deploy/compiler-runtime/node_modules"
for required in (browser / "index.html", browser / "preview/runtime.js",
                 compiler / "main.js", compiler / "compiler/worker.js",
                 libraries / "@angular/compiler-cli/package.json"):
    if not required.is_file():
        raise SystemExit(f"Missing build output: {required}")

with tarfile.open(args.archive, "w:gz", compresslevel=3) as bundle:
    bundle.add(browser, arcname="browser")
    bundle.add(compiler / "main.js", arcname="compiler/main.js")
    bundle.add(compiler / "compiler/worker.js", arcname="compiler/compiler/worker.js")
    bundle.add(libraries, arcname="compiler/node_modules")
    bundle.add(repo / "deploy/install-learning-lab.sh", arcname="install-learning-lab.sh")
