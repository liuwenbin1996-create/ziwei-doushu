import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const directory = path.resolve("cloudfunctions/interpret");
test("installed wx-server-sdk reads synthetic runtime identity without network access", () => {
  // 独立进程只注入合成上下文，不继承开发机环境/任何模型或腾讯云凭据。
  const script = `
    const assert = require('node:assert/strict');
    let networkCalls = 0;
    const block = () => { networkCalls++; throw new Error('Unexpected network during SDK smoke test'); };
    for (const protocol of ['node:http', 'node:https']) {
      const client = require(protocol); client.request = block; client.get = block;
    }
    global.fetch = async () => block();
    const logs = [];
    for (const name of ['log', 'error', 'warn', 'info', 'debug']) console[name] = (...args) => logs.push(args);
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const identity = cloud.getWXContext();
    assert.equal(identity.APPID, 'wx0000000000000000');
    assert.equal(identity.OPENID, 'runtime-sdk-test-openid');
    assert.equal(identity.API_TOKEN, undefined);
    const misleadingEvent = { userInfo: { openId: 'forged-client-openid' } };
    assert.notEqual(cloud.getWXContext().OPENID, misleadingEvent.userInfo.openId);
    setImmediate(() => {
      assert.equal(networkCalls, 0);
      assert.equal(logs.length, 0, JSON.stringify(logs));
      process.stdout.write(JSON.stringify({ ok: true, appidMatched: true, platformIdentityMatched: true, networkCalls }));
    });
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: directory, encoding: "utf8", timeout: 10_000,
    env: {
      NODE_ENV: "test",
      TENCENTCLOUD_RUNENV: "SCF",
      TENCENTCLOUD_REGION: "ap-guangzhou",
      SCF_NAMESPACE: "synthetic-sdk-test-env",
      TCB_ENV: "synthetic-sdk-test-env",
      WX_CONTEXT_KEYS: "WX_APPID,WX_OPENID,WX_API_TOKEN",
      WX_APPID: "wx0000000000000000",
      WX_OPENID: "runtime-sdk-test-openid",
      WX_API_TOKEN: "DUMMY_RUNTIME_TOKEN_NOT_REAL",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.error, undefined);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, appidMatched: true, platformIdentityMatched: true, networkCalls: 0 });
});

test("security overrides are exact and locked; no legacy lodash mutation packages remain", () => {
  const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(path.join(directory, "package-lock.json"), "utf8"));
  assert.deepEqual(manifest.overrides, { axios: "0.34.0", "@cloudbase/database": "2.0.0" });
  const entries = Object.entries(lock.packages) as [string, { version?: string }][];
  assert.ok(entries.some(([name]) => name.endsWith("node_modules/axios")));
  assert.ok(entries.some(([name]) => name.endsWith("node_modules/@cloudbase/database")));
  for (const [name, info] of entries) {
    if (name.endsWith("node_modules/axios")) assert.equal(info.version, "0.34.0");
    if (name.endsWith("node_modules/@cloudbase/database")) assert.equal(info.version, "2.0.0");
    assert.ok(!/node_modules\/lodash\.(?:set|unset)$/.test(name), name);
  }
});
