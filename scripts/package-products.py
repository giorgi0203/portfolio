"""Package already built active products; retired services are never included."""
from pathlib import Path
import subprocess,shutil,tempfile,json,hashlib
repo=Path(__file__).resolve().parents[1]
source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
archive=Path('/tmp/giorgi-products.tar.gz')
with tempfile.TemporaryDirectory(prefix='giorgi-products-') as d:
 stage=Path(d);products=stage/'products';products.mkdir()
 for name,output in [('lab','angular-compiler-ui/browser'),('toolbox','dev-toolbox'),('health','site-health'),('hls','hls-player'),('compiler','angular-compiler-api')]:
  shutil.copytree(repo/'dist/apps'/output,products/name,symlinks=True)
 shutil.copytree(repo/'deploy/compiler-runtime/node_modules',products/'compiler/node_modules',symlinks=True)
 for file in products.rglob('*'):
  if file.is_file() and not file.is_symlink():assert not (file.name.startswith('.env') or file.suffix in ('.sqlite','.pem','.key')),str(file)
 (products/'release.json').write_text(json.dumps({'source':source,'products':['learning-lab','developer-toolbox','website-health','hls-inspector']}))
 (stage/'tests').mkdir();shutil.copy2(Path('/workspace/smart-todolist/tests/verify-learning-accounts.mjs'),stage/'tests/verify-learning-accounts.mjs')
 (stage/'deploy').mkdir();shutil.copy2(repo/'deploy/install-products.sh',stage/'deploy/install-products.sh')
 subprocess.run(['tar','-czf',str(archive),'-C',str(stage),'products','deploy','tests'],check=True)
metadata={'source':source,'path':str(archive),'checksum':hashlib.sha256(archive.read_bytes()).hexdigest()}
Path('/tmp/giorgi-products-meta.json').write_text(json.dumps(metadata));print(json.dumps(metadata))
