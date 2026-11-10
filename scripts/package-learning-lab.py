"""Package the tested browser-only Learning Lab update, excluding account data."""
from pathlib import Path
import tempfile,subprocess,shutil,json,hashlib
repo=Path(__file__).resolve().parents[1]
source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
archive=Path('/tmp/giorgi-learning-lab.tar.gz')
with tempfile.TemporaryDirectory(prefix='giorgi-learning-package-') as directory:
 stage=Path(directory)
 shutil.copytree(repo/'dist/apps/angular-compiler-ui/browser',stage/'browser',symlinks=True)
 assert (stage/'browser/preview/runtime.js').is_file()
 (stage/'deploy').mkdir();shutil.copy2(repo/'deploy/install-learning-lab.sh',stage/'deploy/install-learning-lab.sh')
 subprocess.run(['tar','-czf',str(archive),'-C',str(stage),'browser','deploy'],check=True)
meta={'source':source,'path':str(archive),'checksum':hashlib.sha256(archive.read_bytes()).hexdigest()}
Path('/tmp/giorgi-learning-lab-meta.json').write_text(json.dumps(meta));print(json.dumps(meta))
