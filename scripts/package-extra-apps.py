"""Package the already built and checked apps; no builds run on the droplet."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[1]
source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
archive = Path('/tmp/giorgi-extra-apps-deploy.tar.gz')
with tempfile.TemporaryDirectory(prefix='giorgi-extra-bundle-') as directory:
    stage = Path(directory)
    apps = stage / 'apps'
    apps.mkdir()
    shutil.copytree(repo / 'dist/apps/angular-compiler-api', apps / 'compiler')
    for unwanted in (apps / 'compiler').rglob('*.map'):
        unwanted.unlink()
    shutil.copytree(repo / 'deploy/compiler-runtime/node_modules', apps / 'compiler/node_modules', symlinks=True)
    shutil.copytree(repo / 'dist/apps/angular-compiler-ui/browser', apps / 'ui')
    for name, output in [('example', 'example-mcp'), ('gateway', 'mcp-gateway'), ('api', 'portfolio-api')]:
        (apps / name).mkdir()
        shutil.copy2(repo / f'dist/{output}/main.js', apps / name / 'main.js')
    (apps / 'swagger').mkdir()
    for name in ['swagger-ui.css', 'swagger-ui-bundle.js']:
        shutil.copy2(repo / 'node_modules/swagger-ui-dist' / name, apps / 'swagger' / name)
    (apps / 'metadata/apps').mkdir(parents=True)
    shutil.copy2(repo / 'package.json', apps / 'metadata/package.json')
    for project in sorted((repo / 'apps').iterdir()):
        if (project / 'project.json').is_file():
            (apps / 'metadata/apps' / project.name).mkdir()
            shutil.copy2(project / 'project.json', apps / 'metadata/apps' / project.name / 'project.json')
    (stage / 'scripts').mkdir()
    for name in ['check-extra-services.cjs', 'check-compiler-browser.cjs']:
        shutil.copy2(repo / 'scripts' / name, stage / 'scripts' / name)
    (stage / 'deploy').mkdir()
    shutil.copy2(repo / 'deploy/install-extra-apps.sh', stage / 'deploy/install-extra-apps.sh')
    for file in stage.rglob('*'):
        if file.is_file() and not file.is_symlink():
            assert not (file.name.startswith('.env') or file.suffix in ('.sqlite', '.pem', '.key')), str(file)
    subprocess.run(['tar', '-czf', str(archive), '-C', str(stage), 'apps', 'deploy', 'scripts'], check=True)
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
Path('/tmp/giorgi-extra-package.json').write_text(json.dumps({'source': source, 'checksum': checksum, 'path': str(archive)}))
print(f'Packaged {archive.stat().st_size} bytes from {source}; SHA-256 {checksum}')
