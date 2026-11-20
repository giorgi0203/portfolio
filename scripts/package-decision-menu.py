"""Package tested Decision and identity builds without credentials or databases."""
from pathlib import Path
import hashlib,json,shutil,subprocess,tempfile,os
repo=Path(__file__).resolve().parents[1]
identity_repo=Path('/workspace/smart-todolist')
def revision(folder):return subprocess.check_output(['git','rev-parse','HEAD'],cwd=folder,text=True).strip()
archive=Path('/tmp/giorgi-decision-menu.tar.gz')
with tempfile.TemporaryDirectory(prefix='decision-menu-release-') as directory:
 stage=Path(directory)
 shutil.copytree(repo/'dist/apps/decision-department',stage/'decision')
 shutil.copytree(identity_repo/'.next/standalone',stage/'identity',symlinks=True)
 shutil.copytree(identity_repo/'.next/static',stage/'identity/.next/static')
 shutil.copytree(identity_repo/'public',stage/'identity/public',dirs_exist_ok=True)
 for parent,dirs,files in os.walk(stage):
  assert '.data' not in dirs,parent
  for name in files:assert not(name.startswith('.env') or name.endswith(('.sqlite','.sqlite-wal','.sqlite-shm','.db','.pem','.key'))),name
 (stage/'deploy').mkdir()
 for name in ['install-decision-menu.sh','verify-decision-menu.py']:shutil.copy2(repo/'deploy'/name,stage/'deploy'/name)
 shutil.copy2(repo/'apps/decision-department/tests/fixtures/menu.png',stage/'deploy/menu.png')
 (stage/'release.json').write_text(json.dumps({'decisionSource':revision(repo),'identitySource':revision(identity_repo)}))
 subprocess.run(['tar','-czf',str(archive),'-C',str(stage),'decision','identity','deploy','release.json'],check=True)
metadata={'decisionSource':revision(repo),'identitySource':revision(identity_repo),'path':str(archive),'checksum':hashlib.sha256(archive.read_bytes()).hexdigest()}
Path('/tmp/giorgi-decision-menu-meta.json').write_text(json.dumps(metadata));print(json.dumps(metadata))
