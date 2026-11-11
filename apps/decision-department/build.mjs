import { build } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
await build({
  configFile: new URL('./vite.config.ts', import.meta.url).pathname,
});
await mkdir(
  new URL('../../dist/apps/decision-department/server/', import.meta.url),
  { recursive: true },
);
await cp(
  new URL('./server/', import.meta.url),
  new URL('../../dist/apps/decision-department/server/', import.meta.url),
  { recursive: true },
);
