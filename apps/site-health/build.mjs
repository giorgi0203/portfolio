import {build} from 'vite';
import {cp,mkdir} from 'node:fs/promises';
await build({configFile:false,root:new URL('.',import.meta.url).pathname,build:{outDir:'../../dist/apps/site-health/public',emptyOutDir:true,target:'es2022'}});
await mkdir(new URL('../../dist/apps/site-health/server/',import.meta.url),{recursive:true});
await cp(new URL('./server/',import.meta.url),new URL('../../dist/apps/site-health/server/',import.meta.url),{recursive:true});
