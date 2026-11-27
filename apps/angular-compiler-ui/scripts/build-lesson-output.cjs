/** Ship real compiler output for the seven public starters, ready before the first interaction. */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const output = path.resolve(__dirname, '../public/lessons');
  const tempRoot = path.join(root, 'tmp');
  fs.mkdirSync(tempRoot, { recursive: true });
  const temp = fs.mkdtempSync(path.join(tempRoot, 'lab-compiler-'));
  try {
    const compiler = path.join(root, 'apps/angular-compiler-api/src/compiler');
    esbuild.buildSync({
      entryPoints: {
        lessons: path.resolve(__dirname, '../src/app/lessons.ts'),
        service: path.join(compiler, 'aot-compiler.ts'),
        'compiler/worker': path.join(compiler, 'worker.ts'),
      },
      bundle: true, platform: 'node', format: 'cjs', packages: 'external', outdir: temp,
    });
    const { aotCompiler } = require(path.join(temp, 'service.js'));
    const { learningLessons } = require(path.join(temp, 'lessons.js'));
    fs.mkdirSync(output, { recursive: true });
    for (const lesson of learningLessons) {
      const result = await aotCompiler.compile({ componentTs: lesson.source, templateHtml: '' });
      if (!result.ok) throw new Error(lesson.id + ': ' + JSON.stringify(result.diagnostics));
      fs.writeFileSync(path.join(output, lesson.id + '.json'), JSON.stringify({
        source: lesson.source, files: result.files, diagnostics: result.diagnostics,
      }));
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
