const path=require('node:path');
const esbuild=require('esbuild');
esbuild.buildSync({entryPoints:[path.join(__dirname,'../preview/runtime.ts')],outfile:path.join(__dirname,'../public/preview/runtime.js'),bundle:true,minify:true,platform:'browser',format:'iife',target:'es2022',define:{ngDevMode:'false'},logLevel:'warning'});
