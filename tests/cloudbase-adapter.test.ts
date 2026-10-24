import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { handleCloudInterpret, type CloudBaseDependencies, type CloudBaseResult } from "../lib/mobile/cloudbase";
import { INTERPRETATION_TOPICS, CULTURAL_NOTICE } from "../lib/mobile/interpretation";
import { interpretationEvidence } from "../lib/mobile/grounding";
import { createMobileChart } from "../lib/mobile/chart";
import { generateInterpretation } from "../lib/mobile/openai";

const env = {
  WECHAT_APP_ID: "wx0000000000000000",
  AI_ALLOWED_OPENIDS: "owner-test-openid, second-test-openid",
  AI_PROVIDER: "zhipu",
  ZHIPU_MODEL: "glm-4-flash-250414",
  ZHIPU_API_KEY: "DUMMY_MODEL_KEY_NOT_REAL",
  AI_ACCESS_TOKEN: "DUMMY_INTERNAL_ACCESS_NOT_REAL",
  OPENAI_API_KEY: "DUMMY_UNUSED_PAID_KEY",
};
const input = { birth: { date: "1996-06-15", hour: 4, gender: "female" as const, lateZi: false }, year: 2026, consent: true, provider: "zhipu" };
const evidence = interpretationEvidence(createMobileChart(input));
const interpretation = {
  sections: INTERPRETATION_TOPICS.map((topic) => ({
    topic, summary: "传统说法中，可将这些符号用于观察日常习惯。",
    observations: evidence[topic], suggestions: ["记录具体经历后再作反思。"],
  })), notice: "文化参考",
};
const success = async () => ({ status: "completed", output_text: JSON.stringify(interpretation) });
function dependencies(patch: Partial<CloudBaseDependencies> = {}): CloudBaseDependencies {
  return { env, getWXContext: () => ({ APPID: env.WECHAT_APP_ID, OPENID: "owner-test-openid" }), generate: success, ...patch };
}
function noInference(patch: Partial<CloudBaseDependencies> = {}) {
  let calls = 0;
  const deps = dependencies({ ...patch, generate: async () => { calls++; return success(); } });
  return { deps, calls: () => calls };
}
function privateDetailsAbsent(result: CloudBaseResult) {
  const serialized = JSON.stringify(result);
  for (const marker of [env.ZHIPU_API_KEY, env.AI_ACCESS_TOKEN, env.OPENAI_API_KEY, "PRIVATE_UPSTREAM_DETAIL"])
    assert.ok(!serialized.includes(marker), marker);
}
before(() => {
  mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected real network in cloud test"); });
});
after(() => { mock.restoreAll(); });

test("cloud identity returns only the platform caller, without AI configuration or allowlist", async () => {
  const fixture = noInference({ env: { WECHAT_APP_ID: env.WECHAT_APP_ID } });
  const result = await handleCloudInterpret({ action: "identity", openid: "forged-user", userInfo: { openId: "forged-user" } }, fixture.deps);
  assert.deepEqual(result, { statusCode: 200, data: { openid: "owner-test-openid" } });
  assert.equal(fixture.calls(), 0);
  privateDetailsAbsent(result);
});

test("missing app binding, absent SDK context and cross-app calls fail before AI", async () => {
  for (const [patch, status] of [
    [{ env: { ...env, WECHAT_APP_ID: "" } }, 503],
    [{ getWXContext: () => ({}) }, 401],
    [{ getWXContext: () => ({ APPID: env.WECHAT_APP_ID }) }, 401],
    [{ getWXContext: () => ({ APPID: env.WECHAT_APP_ID, OPENID: "  " }) }, 401],
    [{ getWXContext: () => ({ APPID: "different-app", OPENID: "owner-test-openid" }) }, 403],
    [{ getWXContext: () => { throw new Error("PRIVATE_UPSTREAM_DETAIL"); } }, 401],
  ] as [Partial<CloudBaseDependencies>, number][]) {
    const fixture = noInference(patch);
    for (const event of [input, { action: "identity", OPENID: "owner-test-openid", APPID: env.WECHAT_APP_ID }]) {
      const result = await handleCloudInterpret(event, fixture.deps);
      assert.equal(result.statusCode, status); privateDetailsAbsent(result);
    }
    assert.equal(fixture.calls(), 0);
  }
});

test("interpretation requires configured allowlist and ignores forged client OPENID", async () => {
  for (const [patch, status] of [
    [{ env: { ...env, AI_ALLOWED_OPENIDS: "" } }, 503],
    [{ env: { ...env, AI_ALLOWED_OPENIDS: " ,  , " } }, 503],
    [{ getWXContext: () => ({ APPID: env.WECHAT_APP_ID, OPENID: "unauthorized-test-user" }) }, 403],
  ] as [Partial<CloudBaseDependencies>, number][]) {
    const fixture = noInference(patch);
    const result = await handleCloudInterpret({ ...input, openid: "owner-test-openid", OPENID: "owner-test-openid", userInfo: { openId: "owner-test-openid" } }, fixture.deps);
    assert.equal(result.statusCode, status); assert.equal(fixture.calls(), 0); privateDetailsAbsent(result);
  }
  const fixture = noInference({ getWXContext: () => ({ APPID: env.WECHAT_APP_ID, OPENID: "unauthorized-test-user" }) });
  assert.equal((await handleCloudInterpret({ action: "identity" }, fixture.deps)).data.openid, "unauthorized-test-user");
  assert.equal(fixture.calls(), 0);
});

test("entire event is limited to 16 KiB before discarding unrelated fields", async () => {
  const fixture = noInference();
  for (const event of [
    { ...input, garbage: "中".repeat(6000) },
    { action: "identity", garbage: "x".repeat(17 * 1024) },
    { ...input, birth: { ...input.birth, name: "x".repeat(17 * 1024) } },
  ]) {
    const result = await handleCloudInterpret(event, fixture.deps);
    assert.equal(result.statusCode, 413); privateDetailsAbsent(result);
  }
  assert.equal(fixture.calls(), 0);
  for (const event of [null, [], "string", undefined])
    assert.equal((await handleCloudInterpret(event, fixture.deps)).statusCode, 400);
  const circular: any = {}; circular.self = circular;
  assert.equal((await handleCloudInterpret(circular, fixture.deps)).statusCode, 400);
});

test("unknown actions, missing consent, invalid birth and mismatched provider do not invoke AI", async () => {
  const fixture = noInference();
  for (const [event, status] of [
    [{ ...input, action: "delete" }, 400],
    [{ ...input, action: null }, 400],
    [{ ...input, consent: false }, 400],
    [{ ...input, consent: "true" }, 400],
    [{ ...input, birth: { ...input.birth, date: "2024-02-30" } }, 400],
    [{ ...input, provider: "openai" }, 409],
    [{ ...input, provider: undefined }, 409],
  ] as const) {
    const result = await handleCloudInterpret(event, fixture.deps);
    assert.equal(result.statusCode, status); privateDetailsAbsent(result);
  }
  assert.equal(fixture.calls(), 0);
});

test("cloud interpretation fails closed on missing internal configuration or paid provider/model", async () => {
  for (const patch of [
    { ZHIPU_API_KEY: "" }, { AI_ACCESS_TOKEN: "" }, { AI_PROVIDER: "openai" },
    { ZHIPU_MODEL: "glm-5.3" },
  ]) {
    const fixture = noInference({ env: { ...env, ...patch } });
    const result = await handleCloudInterpret(input, fixture.deps);
    assert.equal(result.statusCode, 503); assert.equal(fixture.calls(), 0); privateDetailsAbsent(result);
  }
});

test("successful five-topic interpretation recomputes chart and uses only the server free model", async () => {
  let calls = 0;
  const result = await handleCloudInterpret({
    ...input, action: "interpret", token: "CLIENT_ACCESS_SENTINEL", model: "glm-5.3",
    instructions: "CLIENT_PROMPT_SENTINEL", chart: "CLIENT_CHART_SENTINEL",
    birth: { ...input.birth, name: "CLIENT_NAME_SENTINEL" },
  }, dependencies({
    env: { ...env, AI_ALLOWED_OPENIDS: " , owner-test-openid , " },
    generate: async (chart, configuration) => {
      calls++;
      assert.equal(chart.chart.palaces.length, 12);
      assert.equal(configuration.provider, "zhipu"); assert.equal(configuration.model, "glm-4-flash-250414");
      assert.equal(configuration.apiKey, env.ZHIPU_API_KEY);
      assert.deepEqual(chart.input, { birth: input.birth, year: input.year });
      const serialized = JSON.stringify(chart);
      for (const marker of ["CLIENT_ACCESS_SENTINEL", "CLIENT_PROMPT_SENTINEL", "CLIENT_CHART_SENTINEL", "CLIENT_NAME_SENTINEL"])
        assert.ok(!serialized.includes(marker));
      return success();
    },
  }));
  assert.equal(result.statusCode, 200); assert.equal(calls, 1);
  assert.deepEqual((result.data.sections as any[]).map((section) => section.topic), [...INTERPRETATION_TOPICS]);
  assert.equal(result.data.notice, CULTURAL_NOTICE);
  assert.ok(Number.isFinite(Date.parse(result.data.generatedAt as string)));
  assert.ok(!JSON.stringify(result.data).includes("owner-test-openid"));
  privateDetailsAbsent(result);
});

test("truncation, malformed output and modified chart evidence fail without leaking details", async () => {
  const altered = JSON.parse(JSON.stringify(interpretation));
  altered.sections[4].observations[0] = "PRIVATE_UPSTREAM_DETAIL";
  const duplicate = { ...interpretation, sections: interpretation.sections.map(() => interpretation.sections[0]) };
  for (const reply of [
    { status: "incomplete", output_text: JSON.stringify(interpretation) },
    { status: "completed", output_text: "" },
    { status: "completed", output_text: "{PRIVATE_UPSTREAM_DETAIL" },
    { status: "completed", output_text: JSON.stringify(altered) },
    { status: "completed", output_text: JSON.stringify(duplicate) },
  ]) {
    const result = await handleCloudInterpret(input, dependencies({ generate: async () => reply }));
    assert.equal(result.statusCode, 502); privateDetailsAbsent(result);
  }
});

test("SDK refusal/content filter is rejected through the actual installed SDK with mocked transport", async () => {
  for (const finish of ["stop", "content_filter"]) {
    let calls = 0;
    const transport: typeof fetch = async (url, init) => {
      calls++;
      const request = new Request(url, init);
      assert.equal(request.url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
      const body = await request.json();
      assert.equal(body.model, "glm-4-flash-250414"); assert.equal(body.thinking, undefined);
      assert.equal(request.headers.get("x-stainless-timeout"), "45");
      return Response.json({ id: "mock-cloud-response", object: "chat.completion", created: 0, model: body.model,
        choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content: null, refusal: "PRIVATE_UPSTREAM_DETAIL" } }] });
    };
    const result = await handleCloudInterpret(input, dependencies({ generate: (chart, config) => generateInterpretation(chart, config, transport) }));
    assert.equal(result.statusCode, 502); assert.equal(calls, 1); privateDetailsAbsent(result);
  }
});

test("upstream 429/timeouts/other errors keep friendly status and never fall back", async () => {
  for (const [error, status] of [
    [{ status: 429, message: "PRIVATE_UPSTREAM_DETAIL" }, 429],
    [{ name: "APIConnectionTimeoutError", message: "PRIVATE_UPSTREAM_DETAIL" }, 504],
    [new Error("PRIVATE_UPSTREAM_DETAIL"), 502],
  ] as const) {
    let calls = 0;
    const result = await handleCloudInterpret(input, dependencies({ generate: async () => { calls++; throw error; } }));
    assert.equal(result.statusCode, status); assert.equal(calls, 1); privateDetailsAbsent(result);
  }
});

test("adapter does not print identity, event or sensitive upstream diagnostics", async () => {
  const writes: unknown[][] = [];
  const methods = ["log", "error", "warn", "info", "debug"] as const;
  const restorers = methods.map((name) => {
    const original = console[name]; console[name] = (...args: unknown[]) => { writes.push(args); };
    return () => { console[name] = original; };
  });
  try {
    await handleCloudInterpret(input, dependencies({ generate: async () => { throw new Error("PRIVATE_UPSTREAM_DETAIL"); } }));
    await handleCloudInterpret({ action: "identity" }, dependencies());
  } finally { restorers.forEach((restore) => restore()); }
  assert.deepEqual(writes, []);
});
