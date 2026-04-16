import {readFileSync, writeFileSync} from 'node:fs';
import {build} from 'esbuild';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

await build({
    entryPoints: ['src/cli.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/cli.js',
    define: {
        '__VERSION__': JSON.stringify(pkg.version),
    },
});

// Prepend shebang
const content = readFileSync('dist/cli.js', 'utf-8');
writeFileSync('dist/cli.js', '#!/usr/bin/env node\n' + content);
