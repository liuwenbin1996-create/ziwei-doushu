import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeMiniNotices } from './miniprogram-notices.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'miniprogram/utils/chart-engine.js');
fs.mkdirSync(path.dirname(outfile), { recursive: true });
const result = await build({
  absWorkingDir: root, entryPoints: ['miniprogram/src/engine.ts'], outfile,
  bundle: true, platform: 'browser', format: 'cjs', target: 'es2018',
  minify: true, treeShaking: true, legalComments: 'eof', metafile: true,
  banner: { js: '/* Generated from the MIT-licensed Ziwei engine. Sources: ../src/engine.ts and repository lib/. Preserve LICENSE and THIRD_PARTY_NOTICES.md. Run npm run build:miniprogram to rebuild. */' },
});
const inputs = Object.keys(result.metafile.inputs);
const prohibited = inputs.filter((input) => /(?:openai|anthropic|heming-knowledge|tianji-ziwei|releases|node:)/i.test(input));
if (prohibited.length) throw new Error('Unexpected private/server/restricted input: ' + prohibited.join(', '));
const external = Object.values(result.metafile.outputs).flatMap((output) => output.imports).filter((item) => item.external);
if (external.length) throw new Error('Mini program bundle must not require external modules: ' + JSON.stringify(external));
const bytes = fs.statSync(outfile).size;
if (bytes >= 2 * 1024 * 1024) throw new Error('Engine bundle exceeds 2 MiB: ' + bytes);
writeMiniNotices();
const dependencies = [...new Set(inputs.filter((input) => input.startsWith('node_modules/')).map((input) => {
  const parts = input.split('/'); return parts[1].startsWith('@') ? parts.slice(1, 3).join('/') : parts[1];
}))].sort();
console.log('Native engine bundle: ' + bytes + ' bytes; no external imports.');
console.log('Bundled runtime dependencies: ' + dependencies.join(', '));
