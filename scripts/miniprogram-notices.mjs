import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function writeMiniNotices() {
  const upstream = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const names = ['dayjs', 'i18next', 'lunar-lite', 'lunar-typescript', '@babel/runtime'];
  const notices = names.map((name) => {
    const directory = path.join(root, 'node_modules', name);
    const info = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    if (info.license !== 'MIT') throw new Error(`Review license before bundling ${name}: ${info.license}`);
    const license = fs.readFileSync(path.join(directory, 'LICENSE'), 'utf8');
    return `\n## ${name} ${info.version}\n\n${license.trim()}\n`;
  });
  const source = '# Native WeChat preview bundle notices\n\n' +
    'This folder contains the MIT-licensed chart engine and its runtime dependencies.\n' +
    'Source and full license review: https://github.com/liuwenbin1996-create/ziwei-doushu\n\n' +
    upstream.replace('[docs/LICENSE_REVIEW.md](docs/LICENSE_REVIEW.md)', '[license review](https://github.com/liuwenbin1996-create/ziwei-doushu/blob/main/docs/LICENSE_REVIEW.md)') + notices.join('');
  fs.writeFileSync(path.join(root, 'miniprogram', 'THIRD_PARTY_NOTICES.md'), source);
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'miniprogram', 'LICENSE'));
}
