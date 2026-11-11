"""Package the two tested apps without dependencies, credentials or room databases."""
from pathlib import Path
import hashlib,json,shutil,subprocess,tempfile
repo=Path(__file__).resolve().parents[1]
source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
archive=Path('/tmp/giorgi-fun-apps.tar.gz')
with tempfile.TemporaryDirectory(prefix='giorgi-fun-apps-') as temporary:
 stage=Path(temporary);(stage/'apps').mkdir();(stage/'deploy').mkdir()
 for name in ['http-playground','decision-department']:
  shutil.copytree(repo/'dist/apps'/name,stage/'apps'/name)
 for item in (stage/'apps').rglob('*'):
  if item.is_file():
   assert not(item.name.startswith('.env') or item.suffix in ['.sqlite','.db','.pem','.key']),str(item)
 shutil.copy2(repo/'deploy/install-fun-apps.sh',stage/'deploy/install-fun-apps.sh')
 (stage/'release.json').write_text(json.dumps({'source':source,'apps':['http-playground','decision-department']}))
 subprocess.run(['tar','-czf',str(archive),'-C',str(stage),'apps','deploy','release.json'],check=True)
metadata={'source':source,'path':str(archive),'checksum':hashlib.sha256(archive.read_bytes()).hexdigest()}
Path('/tmp/giorgi-fun-apps-meta.json').write_text(json.dumps(metadata));print(json.dumps(metadata))
