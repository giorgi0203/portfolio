import { build } from 'vite';
import { cp } from 'node:fs/promises';
await build({
  configFile: new URL('./vite.config.ts', import.meta.url).pathname,
});
for (const directory of ['server', 'shared']) {
  await cp(
    new URL('./' + directory + '/', import.meta.url),
    new URL(
      '../../dist/apps/decision-department/' + directory + '/',
      import.meta.url,
    ),
    { recursive: true },
  );
}
