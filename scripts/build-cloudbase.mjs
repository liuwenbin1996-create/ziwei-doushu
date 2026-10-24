import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionRoot = path.join(root, "cloudfunctions/interpret");
const outfile = path.join(functionRoot, "index.js");
const manifest = JSON.parse(fs.readFileSync(path.join(functionRoot, "package.json"), "utf8"));
const lockPath = path.join(functionRoot, "package-lock.json");
if (!fs.existsSync(lockPath)) throw new Error("先在 cloudfunctions/interpret 运行 npm install --ignore-scripts 生成固定依赖锁文件。");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
if (lock.packages?.["node_modules/wx-server-sdk"]?.version !== manifest.dependencies["wx-server-sdk"])
  throw new Error("wx-server-sdk 版本与锁文件不一致。");

const result = await build({
  absWorkingDir: root,
  entryPoints: ["cloudfunctions/interpret/src/index.js"],
  outfile, bundle: true, platform: "node", target: "node22", format: "cjs",
  minify: true, treeShaking: true, legalComments: "eof", charset: "utf8",
  external: ["wx-server-sdk"], metafile: true, write: false, sourcemap: false,
  banner: { js: "/*! Generated cloud function. Node.js >=22. Keep LICENSE and THIRD_PARTY_NOTICES.md. Rebuild: node scripts/build-cloudbase.mjs. */" },
});
const inputs = Object.keys(result.metafile.inputs);
const forbidden = inputs.filter((input) =>
  /(?:^|\/)(?:nihai|classics|releases)(?:\/|$)|heming-knowledge|tianji-ziwei/.test(input)
  || /node_modules\/(?:next|react|@anthropic-ai)(?:\/|$)/.test(input)
  || /(?:^|\/)\.env(?:\.|$)/.test(input));
if (forbidden.length) throw new Error("Unexpected restricted/private or full-web inputs: " + forbidden.join(", "));
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => "node:" + name)]);
const externals = [...new Set(Object.values(result.metafile.outputs).flatMap((output) => output.imports)
  .filter((item) => item.external).map((item) => item.path))];
const unexpected = externals.filter((name) => name !== "wx-server-sdk" && !builtins.has(name));
if (unexpected.length) throw new Error("Unpackaged runtime dependencies: " + unexpected.join(", "));
const artifact = result.outputFiles.find((output) => output.path === outfile);
if (!artifact) throw new Error("Cloud function bundle was not generated.");

// 从实际构建输入及云函数依赖安装目录收集授权文本，不读取任何环境文件。
const packages = new Map();
const bundledPackages = new Set();
// 这些原版包仅 external 安装，不把缺失授权文本推定为 MIT。
// 名单绑定精确版本；任何未来新缺项都必须重新审查，不静默忽略。
const externalLicenseGaps = new Set([
  "@cloudbase/database@2.0.0",
  "@cloudbase/node-sdk@3.17.2",
  "@cloudbase/signature-nodejs@2.2.0",
  "@cloudbase/wx-cloud-client-sdk@1.7.1",
  "agent-base@6.0.2", "http-proxy-agent@5.0.0", "https-proxy-agent@5.0.1",
]);
function addPackage(directory) {
  const filename = path.join(directory, "package.json");
  if (!fs.existsSync(filename)) return false;
  const info = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!info.name || !info.version) return false;
  const key = info.name + "@" + info.version;
  if (!packages.has(key)) packages.set(key, { directory, info });
  return true;
}
for (const input of inputs.filter((name) => name.includes("node_modules/"))) {
  let directory = path.dirname(path.resolve(root, input));
  while (directory.startsWith(root) && directory !== root) {
    if (addPackage(directory)) {
      const info = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
      bundledPackages.add(info.name + "@" + info.version);
      break;
    }
    directory = path.dirname(directory);
  }
}
function scanInstalled(nodeModules) {
  if (!fs.existsSync(nodeModules)) throw new Error("缺少云函数运行依赖，请在 cloudfunctions/interpret 运行 npm ci --ignore-scripts。");
  for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const directory = path.join(nodeModules, entry.name);
    if (entry.name.startsWith("@")) {
      for (const child of fs.readdirSync(directory, { withFileTypes: true })) {
        if (child.isDirectory()) visitInstalled(path.join(directory, child.name));
      }
    } else visitInstalled(directory);
  }
}
function visitInstalled(directory) {
  addPackage(directory);
  const nested = path.join(directory, "node_modules");
  if (fs.existsSync(nested)) scanInstalled(nested);
}
scanInstalled(path.join(functionRoot, "node_modules"));
const records = [...packages.values()].sort((a, b) =>
  (a.info.name + "@" + a.info.version).localeCompare(b.info.name + "@" + b.info.version));
const sections = records.map(({ directory, info }) => {
  const files = fs.readdirSync(directory).filter((name) =>
    /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(name) && fs.statSync(path.join(directory, name)).isFile());
  const key = info.name + "@" + info.version;
  if (!files.length) {
    if (bundledPackages.has(key) || !externalLicenseGaps.has(key))
      throw new Error("Missing local license/notice requiring review: " + key);
    return "## " + info.name + " " + info.version + "\n\n" +
      "External dependency of the original wx-server-sdk npm distribution; its code is not embedded in index.js or redistributed as node_modules in this deployment package.\n\n" +
      "Published package license declaration: " + (typeof info.license === "string" ? info.license : "not provided") + ".\n\n" +
      "This exact npm package publishes no standalone LICENSE/NOTICE text. No MIT or other grant is inferred where it is absent; " +
      "the original external dependency is installed from its pinned package-lock entry. This is a recorded upstream notice gap, not a statement that all license texts were verified.\n";
  }
  const text = files.map((name) => "### " + name + "\n\n" + fs.readFileSync(path.join(directory, name), "utf8").trim()).join("\n\n");
  return "## " + info.name + " " + info.version + "\n\nDeclared license: " + (typeof info.license === "string" ? info.license : JSON.stringify(info.license ?? "See license below")) + "\n\n" + text;
});
const upstream = fs.readFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
const notices = "# Cloud function third-party notices\n\n" +
  "This deployment includes bundled domain/API code and installed wx-server-sdk runtime dependencies. " +
  "No course quotations, restricted release datasets or private configuration files are included.\n\n" +
  "Compatibility note: wx-server-sdk is used only for init/getWXContext. Exact overrides axios@0.34.0 and @cloudbase/database@2.0.0 " +
  "were smoke-tested for SDK loading and platform identity only; database/storage/OpenAPI compatibility has not been verified.\n\n" +
  upstream + "\n\n# Included package license texts and explicit external gaps\n\n" + sections.join("\n\n");
fs.mkdirSync(functionRoot, { recursive: true });
fs.writeFileSync(outfile, artifact.contents);
fs.writeFileSync(path.join(functionRoot, "THIRD_PARTY_NOTICES.md"), notices);
fs.copyFileSync(path.join(root, "LICENSE"), path.join(functionRoot, "LICENSE"));
console.log("CloudBase interpret: " + artifact.contents.byteLength + " bytes; runtime Node.js >=22; wx-server-sdk external.");
console.log("Bundled/installed package license records: " + records.length + ". External imports: " + externals.join(", "));
