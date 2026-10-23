import { interpretationEvidence } from "../lib/mobile/grounding";
import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createMobileChart } from "../lib/mobile/chart";
import { handleInterpret } from "../lib/mobile/http";
import { generateInterpretation } from "../lib/mobile/openai";
import { resolveAIConfiguration } from "../lib/mobile/ai-config";
import {
  CULTURAL_NOTICE,
  INTERPRETATION_TOPICS,
} from "../lib/mobile/interpretation";

const input = {
  birth: {
    date: "1990-06-15",
    hour: 5,
    gender: "female" as const,
    lateZi: false,
  },
  year: 2026,
};
const env = {
  AI_PROVIDER: "zhipu",
  ZHIPU_API_KEY: "zhipu-sdk-test-placeholder",
  AI_ACCESS_TOKEN: "private-test-access",
  OPENAI_API_KEY: "unused-openai-test-placeholder",
  OPENAI_MODEL: "paid-model-sentinel",
};
const interpretation = {
  sections: INTERPRETATION_TOPICS.map((topic) => ({
    topic,
    summary: topic + "传统文化观察。",
    observations: interpretationEvidence(createMobileChart(input))[topic],
    suggestions: ["结合实际经历观察日常习惯。"],
  })),
  notice: "传统文化参考",
};
type Call = {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, any>;
};
function sdkTransport(payload: unknown, status = 200) {
  const calls: Call[] = [];
  const mockFetch: typeof fetch = async (url, init) => {
    const request = new Request(url, init);
    calls.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: JSON.parse(await request.text()),
    });
    return Response.json(payload, { status });
  };
  return { calls, fetch: mockFetch };
}
function chatReply(
  content: string | null = JSON.stringify(interpretation),
  finish = "stop",
  refusal: string | null = null,
) {
  return {
    id: "chatcmpl_mock",
    object: "chat.completion",
    created: 0,
    model: "glm-4.7-flash",
    choices: [
      {
        index: 0,
        finish_reason: finish,
        message: { role: "assistant", content, refusal },
      },
    ],
  };
}
function request(
  body: unknown = { ...input, consent: true, provider: "zhipu" },
) {
  return new Request("https://ziwei.test/api/interpret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://ziwei.test",
      Authorization: "Bearer " + env.AI_ACCESS_TOKEN,
    },
    body: JSON.stringify(body),
  });
}
const viaSDK =
  (transport: ReturnType<typeof sdkTransport>) =>
  (
    chart: Parameters<typeof generateInterpretation>[0],
    config: Parameters<typeof generateInterpretation>[1],
  ) =>
    generateInterpretation(chart, config, transport.fetch);
before(() => {
  mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected real network in SDK test");
  });
});
after(() => {
  mock.restoreAll();
});

// 真正执行安装的 SDK，仅替换 HTTP 传输；不发送真实网络请求或使用真实密钥。
test("Zhipu SDK contract fixes the free model, endpoint, authentication and JSON format", async () => {
  const config = resolveAIConfiguration(env);
  assert.ok(config);
  assert.equal(config.model, "glm-4.7-flash");
  const transport = sdkTransport(chatReply());
  await assert.rejects(
    generateInterpretation(
      createMobileChart(input),
      { ...config, model: "paid-model-sentinel" },
      transport.fetch,
    ),
  );
  assert.equal(transport.calls.length, 0);
  const result = await generateInterpretation(
    createMobileChart(input),
    config,
    transport.fetch,
  );
  assert.equal(result.status, "completed");
  assert.equal(transport.calls.length, 1);
  const call = transport.calls[0];
  assert.equal(
    call.url,
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  );
  assert.equal(call.method, "POST");
  assert.equal(
    call.headers.get("authorization"),
    "Bearer " + env.ZHIPU_API_KEY,
  );
  assert.equal(call.headers.get("openai-organization"), null);
  assert.equal(call.headers.get("openai-project"), null);
  assert.equal(call.headers.get("x-stainless-timeout"), "45");
  assert.equal(call.headers.get("x-stainless-retry-count"), "0");
  assert.equal(call.body.model, "glm-4.7-flash");
  assert.equal(call.body.stream, false);
  assert.equal(call.body.max_tokens, 5000);
  assert.deepEqual(call.body.thinking, { type: "disabled" });
  assert.deepEqual(call.body.response_format, { type: "json_object" });
  assert.deepEqual(
    call.body.messages.map((m: any) => m.role),
    ["system", "user"],
  );
  const serialized = JSON.stringify(call.body);
  for (const marker of [
    input.birth.date,
    "birthInfo",
    "origInput",
    env.ZHIPU_API_KEY,
    env.AI_ACCESS_TOKEN,
    env.OPENAI_API_KEY,
    "paid-model-sentinel",
  ])
    assert.ok(!serialized.includes(marker), marker);
});

test("provider configuration does not fall back from Zhipu to a paid provider", () => {
  assert.equal(
    resolveAIConfiguration({ ...env, ZHIPU_MODEL: "paid-model-sentinel" }),
    null,
  );
  assert.equal(resolveAIConfiguration({}), null);
  assert.equal(
    resolveAIConfiguration({
      AI_PROVIDER: "unsupported",
      ZHIPU_API_KEY: env.ZHIPU_API_KEY,
    }),
    null,
  );
  assert.equal(
    resolveAIConfiguration({
      AI_PROVIDER: "zhipu",
      OPENAI_API_KEY: env.OPENAI_API_KEY,
    }),
    null,
  );
  assert.equal(
    resolveAIConfiguration({
      AI_PROVIDER: "openai",
      ZHIPU_API_KEY: env.ZHIPU_API_KEY,
    }),
    null,
  );
  assert.equal(
    resolveAIConfiguration({
      ZHIPU_API_KEY: env.ZHIPU_API_KEY,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
    })?.provider,
    "zhipu",
  );
  assert.equal(
    resolveAIConfiguration({ OPENAI_API_KEY: env.OPENAI_API_KEY })?.provider,
    "openai",
  );
});

test("the second verified free model omits unsupported thinking parameters", async () => {
  const config = resolveAIConfiguration({
    ...env,
    ZHIPU_MODEL: "glm-4-flash-250414",
  });
  assert.ok(config);
  const transport = sdkTransport(chatReply());
  const result = await generateInterpretation(
    createMobileChart(input),
    config,
    transport.fetch,
  );
  assert.equal(result.status, "completed");
  assert.equal(transport.calls[0].body.model, "glm-4-flash-250414");
  assert.equal(transport.calls[0].body.thinking, undefined);
  assert.deepEqual(transport.calls[0].body.response_format, {
    type: "json_object",
  });
});

test("Zhipu does not forward OpenAI organization or project identifiers", async () => {
  const oldOrg = process.env.OPENAI_ORG_ID;
  const oldProject = process.env.OPENAI_PROJECT_ID;
  try {
    process.env.OPENAI_ORG_ID = "PRIVATE_ORG_TEST_SENTINEL";
    process.env.OPENAI_PROJECT_ID = "PRIVATE_PROJECT_TEST_SENTINEL";
    const transport = sdkTransport(chatReply());
    await generateInterpretation(
      createMobileChart(input),
      resolveAIConfiguration(env)!,
      transport.fetch,
    );
    assert.equal(transport.calls[0].headers.get("openai-organization"), null);
    assert.equal(transport.calls[0].headers.get("openai-project"), null);
  } finally {
    if (oldOrg === undefined) delete process.env.OPENAI_ORG_ID;
    else process.env.OPENAI_ORG_ID = oldOrg;
    if (oldProject === undefined) delete process.env.OPENAI_PROJECT_ID;
    else process.env.OPENAI_PROJECT_ID = oldProject;
  }
});

test("HTTP validates SDK output and rejects truncation, refusals and invalid JSON", async () => {
  const duplicate = {
    ...interpretation,
    sections: interpretation.sections.map(() => interpretation.sections[0]),
  };
  for (const payload of [
    chatReply(JSON.stringify(interpretation), "length"),
    chatReply(JSON.stringify(interpretation), "content_filter"),
    chatReply(null, "stop", "refusal"),
    chatReply("{bad"),
    chatReply(JSON.stringify(duplicate)),
    { ...chatReply(), choices: [] },
    { id: "bad-shape" },
  ]) {
    const transport = sdkTransport(payload);
    const response = await handleInterpret(request(), {
      env,
      generate: viaSDK(transport),
    });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const text = await response.text();
    assert.ok(JSON.parse(text).error);
    assert.ok(!text.includes(env.ZHIPU_API_KEY));
    assert.equal(transport.calls.length, 1);
  }
});

test("HTTP recomputes the chart and does not forward client prompts, names or model choices", async () => {
  const transport = sdkTransport(chatReply());
  const response = await handleInterpret(
    request({
      ...input,
      birth: { ...input.birth, name: "CLIENT_NAME_SENTINEL" },
      consent: true,
      provider: "zhipu",
      model: "paid-model-sentinel",
      instructions: "CLIENT_PROMPT_SENTINEL",
      chart: { data: "CLIENT_CHART_SENTINEL" },
    }),
    { env, generate: viaSDK(transport) },
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.sections.length, 5);
  assert.equal(result.notice, CULTURAL_NOTICE);
  const serialized = JSON.stringify(transport.calls[0].body);
  for (const marker of [
    "CLIENT_NAME_SENTINEL",
    "CLIENT_PROMPT_SENTINEL",
    "CLIENT_CHART_SENTINEL",
    "paid-model-sentinel",
    input.birth.date,
  ])
    assert.ok(!serialized.includes(marker), marker);
});

test("provider mismatch or absent selected-provider key blocks the request before SDK execution", async () => {
  let calls = 0;
  const generate = async () => {
    calls++;
    return { status: "completed", output_text: JSON.stringify(interpretation) };
  };
  assert.equal(
    (
      await handleInterpret(
        request({ ...input, consent: true, provider: "openai" }),
        { env, generate },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await handleInterpret(request({ ...input, consent: true }), {
        env,
        generate,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await handleInterpret(request(), {
        env: {
          AI_PROVIDER: "zhipu",
          AI_ACCESS_TOKEN: env.AI_ACCESS_TOKEN,
          OPENAI_API_KEY: env.OPENAI_API_KEY,
        },
        generate,
      })
    ).status,
    503,
  );
  assert.equal(calls, 0);
});

test("quota and upstream errors do not retry or switch to a paid model", async () => {
  for (const status of [429, 503]) {
    const transport = sdkTransport(
      { error: { message: "UPSTREAM_PRIVATE_SENTINEL", type: "quota_error" } },
      status,
    );
    const response = await handleInterpret(request(), {
      env,
      generate: viaSDK(transport),
    });
    assert.equal(response.status, status === 429 ? 429 : 502);
    assert.equal(transport.calls.length, 1);
    assert.equal(transport.calls[0].body.model, "glm-4.7-flash");
    const text = await response.text();
    for (const marker of [
      "UPSTREAM_PRIVATE_SENTINEL",
      env.ZHIPU_API_KEY,
      env.OPENAI_API_KEY,
    ])
      assert.ok(!text.includes(marker));
  }
});

test("explicit OpenAI retains Responses with strict schema and disabled storage", async () => {
  const config = resolveAIConfiguration({
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "openai-sdk-test-placeholder",
    OPENAI_MODEL: "gpt-5.4-mini",
  })!;
  const text = JSON.stringify(interpretation);
  const transport = sdkTransport({
    id: "resp_mock",
    object: "response",
    status: "completed",
    output: [
      {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
  });
  const result = await generateInterpretation(
    createMobileChart(input),
    config,
    transport.fetch,
  );
  assert.equal(result.status, "completed");
  assert.equal(result.output_text, text);
  assert.equal(transport.calls.length, 1);
  assert.equal(new URL(transport.calls[0].url).pathname, "/v1/responses");
  assert.equal(transport.calls[0].body.store, false);
  assert.equal(transport.calls[0].body.text.format.strict, true);
});
