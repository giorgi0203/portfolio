"""Package the built static app and scoped installer; never package browser state."""
from pathlib import Path
import json,hashlib,shutil,subprocess,tempfile
repo=Path(__file__).resolve().parents[1]
source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
archive=Path('/tmp/giorgi-bug-safari.tar.gz')
with tempfile.TemporaryDirectory(prefix='giorgi-bug-safari-') as temporary:
 stage=Path(temporary);shutil.copytree(repo/'dist/apps/bug-safari',stage/'app');(stage/'deploy').mkdir()
 assert (stage/'app/index.html').is_file() and (stage/'app/runner.js').is_file()
 for item in (stage/'app').rglob('*'):
  if item.is_file():assert not(item.name.startswith('.env') or item.suffix in ['.sqlite','.db','.pem','.key']),str(item)
 shutil.copy2(repo/'deploy/install-bug-safari.sh',stage/'deploy/install-bug-safari.sh')
 (stage/'release.json').write_text(json.dumps({'source':source,'app':'bug-safari'}))
 subprocess.run(['tar','-czf',str(archive),'-C',str(stage),'app','deploy','release.json'],check=True)
metadata={'source':source,'path':str(archive),'checksum':hashlib.sha256(archive.read_bytes()).hexdigest()}
Path('/tmp/giorgi-bug-safari-meta.json').write_text(json.dumps(metadata));print(json.dumps(metadata))
