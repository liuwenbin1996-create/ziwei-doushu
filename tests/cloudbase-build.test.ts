import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const directory = path.resolve("cloudfunctions/interpret");
const bundle = fs.readFileSync(path.join(directory, "index.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(directory, "package-lock.json"), "utf8"));
const notices = fs.readFileSync(path.join(directory, "THIRD_PARTY_NOTICES.md"), "utf8");

test("cloud deployment pins SDK dependency and contains license texts for bundled runtime packages", () => {
  assert.deepEqual(Object.keys(manifest.dependencies), ["wx-server-sdk"]);
  assert.equal(manifest.dependencies["wx-server-sdk"], "4.0.2");
  assert.equal(lock.packages["node_modules/wx-server-sdk"].version, "4.0.2");
  assert.equal(manifest.engines.node, ">=22.0.0");
  assert.ok(bundle.length > 0);
  assert.match(bundle, /require\(["']wx-server-sdk["']\)/);
  assert.doesNotMatch(bundle, /require\(["'](?:next|react|@anthropic-ai)/);
  assert.doesNotMatch(bundle, /(?:node_modules\/next\/|lib\/(?:nihai|classics)\/)/);
  for (const name of ["openai", "iztro", "lunar-javascript", "wx-server-sdk", "dayjs", "i18next"])
    assert.ok(notices.includes("## " + name + " "), name);
  assert.match(notices, /Apache License/);
  assert.match(notices, /Permission is hereby granted/);
  assert.ok(fs.readFileSync(path.join(directory, "LICENSE"), "utf8").includes("MIT License"));
});

test("generated cloud entry uses SDK context rather than forged event identity", async () => {
  const realRequire = createRequire(path.join(directory, "index.js"));
  const moduleObject = { exports: {} as { main?: (event: unknown) => Promise<any> } };
  let identity = { APPID: "wx0000000000000000", OPENID: "platform-caller-openid" };
  let initCalls = 0;
  const sdk = {
    DYNAMIC_CURRENT_ENV: "TEST_CURRENT_ENV",
    init: (value: { env: string }) => { initCalls++; assert.equal(value.env, "TEST_CURRENT_ENV"); },
    getWXContext: () => identity,
  };
  const logs: unknown[][] = [];
  const context = vm.createContext({
    module: moduleObject, exports: moduleObject.exports,
    require: (name: string) => name === "wx-server-sdk" ? sdk : realRequire(name),
    process: { env: { WECHAT_APP_ID: identity.APPID }, platform: "linux", arch: "x64", version: process.version, versions: process.versions },
    console: Object.fromEntries(["log", "error", "warn", "info", "debug"].map((name) => [name, (...values: unknown[]) => logs.push(values)])),
    Buffer, Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController,
    setTimeout, clearTimeout, fetch: async () => { assert.fail("identity must not call a model"); },
  });
  vm.runInContext(bundle, context, { filename: "interpret/index.js", timeout: 10_000 });
  assert.equal(initCalls, 1);
  assert.equal(typeof moduleObject.exports.main, "function");
  const result = await moduleObject.exports.main!({ action: "identity", userInfo: { openId: "forged-client-openid" }, OPENID: "forged-client-openid" });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { statusCode: 200, data: { openid: "platform-caller-openid" } });
  identity = { APPID: "wrong-app", OPENID: "platform-caller-openid" };
  assert.equal((await moduleObject.exports.main!({ action: "identity" })).statusCode, 403);
  assert.deepEqual(logs, []);
});
