import {readFileSync, writeFileSync} from 'node:fs';
import {build} from 'esbuild';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

await build({
    entryPoints: ['src/bin.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/bin.js',
    define: {
        '__VERSION__': JSON.stringify(pkg.version),
    },
});

// Prepend shebang
const content = readFileSync('dist/bin.js', 'utf-8');
writeFileSync('dist/bin.js', '#!/usr/bin/env node\n' + content);
