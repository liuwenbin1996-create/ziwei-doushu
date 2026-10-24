import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientFiles = ['app.js', 'app.json', 'app.wxss', 'config.js', 'sitemap.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
const functionFiles = ['index.js', 'package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
const allowedExtensions = new Set(['.js', '.json', '.wxml', '.wxss', '.md']);

function canonicalOutput(destination) {
  let ancestor = destination;
  const missing = [];
  while (!fs.existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('无法解析导出目录。');
    ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}

function copyFile(source, destination) {
  if (!fs.lstatSync(source).isFile()) throw new Error('Only regular files may be exported: ' + source);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyClientDirectory(source, destination) {
  if (!fs.lstatSync(source).isDirectory()) throw new Error('Client source directory is invalid.');
  for (const name of fs.readdirSync(source).sort()) {
    const from = path.join(source, name), to = path.join(destination, name);
    const stat = fs.lstatSync(from);
    if (stat.isDirectory()) copyClientDirectory(from, to);
    else if (stat.isFile() && !name.startsWith('.') && allowedExtensions.has(path.extname(name))) copyFile(from, to);
    else throw new Error('Unexpected file in client export: ' + name);
  }
}

/** Creates a fresh project; never overwrites a user's configured export. */
export function exportWechatProject(outDir) {
  const destination = path.resolve(outDir);
  if (fs.existsSync(destination)) throw new Error('导出目录已存在，请通过 --out 指定新目录，避免覆盖你的配置。');
  const canonical = canonicalOutput(destination);
  for (const directory of ['miniprogram', 'cloudfunctions', 'node_modules', '.git']) {
    const source = path.join(fs.realpathSync(root), directory);
    if (canonical === source || canonical.startsWith(source + path.sep)) throw new Error('导出目录不能位于源码、依赖或 Git 目录内。');
  }
  // Validate all required input files before creating an output directory.
  for (const name of clientFiles) fs.accessSync(path.join(root, 'miniprogram', name));
  for (const name of functionFiles) fs.accessSync(path.join(root, 'cloudfunctions/interpret', name));
  fs.accessSync(path.join(root, 'docs/WECHAT_CLOUDBASE.md'));
  const configuration = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  if (configuration.appid !== 'touristappid' || configuration.setting?.urlCheck !== true) throw new Error('Source project must keep portable AppID and network checks.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try { fs.mkdirSync(destination); }
  catch (error) {
    if (error && error.code === 'EEXIST') throw new Error('导出目录已存在，请通过 --out 指定新目录，避免覆盖你的配置。');
    throw error;
  }
  fs.writeFileSync(path.join(destination, 'project.config.json'), JSON.stringify(configuration, null, 2) + '\n');
  for (const name of clientFiles) copyFile(path.join(root, 'miniprogram', name), path.join(destination, 'miniprogram', name));
  for (const name of ['pages', 'utils']) copyClientDirectory(path.join(root, 'miniprogram', name), path.join(destination, 'miniprogram', name));
  for (const name of functionFiles) copyFile(path.join(root, 'cloudfunctions/interpret', name), path.join(destination, 'cloudfunctions/interpret', name));
  copyFile(path.join(root, 'docs/WECHAT_CLOUDBASE.md'), path.join(destination, 'README.md'));
  console.log('微信云开发项目已导出：' + destination);
  console.log('仅包含白名单中的客户端、云函数和许可文件；未读取环境变量或环境文件。');
  return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Usage: node scripts/export-wechat-cloudbase.mjs [--out NEW_DIRECTORY]');
  exportWechatProject(args[1] || path.join(root, 'dist/wechat-cloudbase'));
}
