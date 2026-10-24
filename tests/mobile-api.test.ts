import { interpretationEvidence } from "../lib/mobile/grounding";
import test from "node:test";
import assert from "node:assert/strict";
import { handleChart, handleInterpret } from "../lib/mobile/http";
import { buildResponseParameters } from "../lib/mobile/openai";
import { createMobileChart } from "../lib/mobile/chart";
import {
  CULTURAL_NOTICE,
  INTERPRETATION_TOPICS,
  parseInterpretation,
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
  AI_PROVIDER: "openai",
  OPENAI_API_KEY: "test-placeholder-never-used",
  AI_ACCESS_TOKEN: "unit-test-private-access",
  OPENAI_MODEL: "gpt-5.4-mini",
};
const interpretation = {
  sections: INTERPRETATION_TOPICS.map((topic) => ({
    topic,
    summary: `${topic}传统文化观察。`,
    observations: interpretationEvidence(createMobileChart(input))[topic],
    suggestions: ["结合实际经历自行核对。"],
  })),
  notice: "传统文化参考",
};
function request(
  body: unknown = { ...input, consent: true },
  headers: Record<string, string> = {},
): Request {
  return new Request("https://ziwei.test/api/interpret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.AI_ACCESS_TOKEN}`,
      Origin: "https://ziwei.test",
      ...headers,
    },
    body: JSON.stringify(
      body && typeof body === "object" ? { provider: "openai", ...body } : body,
    ),
  });
}
const success = async () => ({
  status: "completed",
  output_text: JSON.stringify(interpretation),
});
async function assertFailure(
  response: Response,
  status: number,
  forbidden?: string,
): Promise<void> {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.text();
  assert.ok(JSON.parse(body).error);
  if (forbidden) assert.ok(!body.includes(forbidden));
}

test("chart API returns a calculated chart and validation errors without caching", async () => {
  const result = await handleChart(request(input));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  const body = await result.json();
  assert.equal(body.chart.palaces.length, 12);
  await assertFailure(
    await handleChart(
      request({ ...input, birth: { ...input.birth, date: "2001-02-29" } }),
    ),
    400,
  );
  await assertFailure(
    await handleChart(request(input, { "Content-Type": "text/plain" })),
    415,
  );
});

test("interpret API requires server configuration and a valid private token", async () => {
  let calls = 0;
  const generate = async () => {
    calls++;
    return success();
  };
  await assertFailure(
    await handleInterpret(request(), { env: {}, generate }),
    503,
  );
  await assertFailure(
    await handleInterpret(request(), {
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      generate,
    }),
    503,
  );
  await assertFailure(
    await handleInterpret(request(), {
      env: { AI_ACCESS_TOKEN: env.AI_ACCESS_TOKEN },
      generate,
    }),
    503,
  );
  await assertFailure(
    await handleInterpret(
      request(undefined, { Authorization: "Bearer incorrect" }),
      { env, generate },
    ),
    401,
    env.AI_ACCESS_TOKEN,
  );
  await assertFailure(
    await handleInterpret(request(undefined, { Authorization: "" }), {
      env,
      generate,
    }),
    401,
  );
  assert.equal(calls, 0);
});

test("both APIs reject cross-origin requests", async () => {
  await assertFailure(
    await handleChart(request(input, { Origin: "https://other.test" })),
    403,
  );
  await assertFailure(
    await handleInterpret(
      request(undefined, { Origin: "https://other.test" }),
      { env, generate: success },
    ),
    403,
  );
  await assertFailure(
    await handleInterpret(
      request(undefined, { "Sec-Fetch-Site": "cross-site" }),
      { env, generate: success },
    ),
    403,
  );
});

test("interpret API requires explicit consent and validates dates before invoking AI", async () => {
  let calls = 0;
  const generate = async () => {
    calls++;
    return success();
  };
  for (const consent of [undefined, false, "true", 1]) {
    await assertFailure(
      await handleInterpret(request({ ...input, consent }), { env, generate }),
      400,
    );
  }
  await assertFailure(
    await handleInterpret(
      request({ ...input, birth: { ...input.birth, hour: 42 }, consent: true }),
      { env, generate },
    ),
    400,
  );
  assert.equal(calls, 0);
});

test("body size is limited by actual UTF-8 bytes, including false Content-Length", async () => {
  const body = { ...input, consent: true, extra: "中".repeat(6000) };
  await assertFailure(
    await handleInterpret(request(body, { "Content-Length": "1" }), {
      env,
      generate: success,
    }),
    413,
  );
  await assertFailure(await handleChart(request(body)), 413);
  const malformed = new Request("https://ziwei.test/api/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad",
  });
  await assertFailure(await handleChart(malformed), 400);
});

test("success recomputes chart, ignores supplied chart and returns all five validated topics", async () => {
  let calls = 0;
  const response = await handleInterpret(
    request({
      ...input,
      consent: true,
      chart: { palaces: [{ name: "injected" }] },
      instructions: "injected",
    }),
    {
      env,
      generate: async (chart, config) => {
        calls++;
        assert.equal(chart.chart.palaces.length, 12);
        assert.ok(
          chart.chart.palaces.every((palace) => palace.name !== "injected"),
        );
        assert.equal(config.model, env.OPENAI_MODEL);
        return success();
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(
    body.sections.map((section: { topic: string }) => section.topic),
    [...INTERPRETATION_TOPICS],
  );
  assert.equal(body.notice, CULTURAL_NOTICE);
  assert.ok(Number.isFinite(Date.parse(body.generatedAt)));
  assert.ok(!JSON.stringify(body).includes(env.OPENAI_API_KEY));
});

test("upstream failures map to friendly status codes without leaking details", async () => {
  for (const [error, status] of [
    [{ status: 429, message: "SECRET_UPSTREAM_DETAIL" }, 429],
    [
      { name: "APIConnectionTimeoutError", message: "SECRET_UPSTREAM_DETAIL" },
      504,
    ],
    [{ status: 504, message: "SECRET_UPSTREAM_DETAIL" }, 504],
    [
      {
        name: "Error",
        cause: { name: "AbortError" },
        message: "SECRET_UPSTREAM_DETAIL",
      },
      504,
    ],
    [{ status: 401, message: "SECRET_UPSTREAM_DETAIL" }, 502],
    [new Error("SECRET_UPSTREAM_DETAIL"), 502],
  ] as const) {
    const response = await handleInterpret(request(), {
      env,
      generate: async () => {
        throw error;
      },
    });
    await assertFailure(response, status, "SECRET_UPSTREAM_DETAIL");
  }
});

test("structured output rejects refusal, truncation, malformed JSON, duplicates and empty content", async () => {
  const duplicated = {
    ...interpretation,
    sections: interpretation.sections.map(() => interpretation.sections[0]),
  };
  const empty = {
    ...interpretation,
    sections: interpretation.sections.map((section) => ({
      ...section,
      suggestions: [],
    })),
  };
  for (const result of [
    { status: "incomplete", output_text: JSON.stringify(interpretation) },
    { status: "completed", output_text: "" },
    { status: "completed", output_text: "refusal" },
    { status: "completed", output_text: JSON.stringify({}) },
    { status: "completed", output_text: JSON.stringify(duplicated) },
    { status: "completed", output_text: JSON.stringify(empty) },
  ]) {
    await assertFailure(
      await handleInterpret(request(), { env, generate: async () => result }),
      502,
    );
  }
  assert.throws(() => parseInterpretation(duplicated));
});

test("OpenAI request uses Responses strict JSON schema, disables storage and minimizes personal data", () => {
  const params = buildResponseParameters(
    createMobileChart(input),
    "gpt-5.4-mini",
  );
  assert.equal(params.model, "gpt-5.4-mini");
  assert.equal(params.store, false);
  assert.equal(params.text?.format?.type, "json_schema");
  if (params.text?.format?.type === "json_schema")
    assert.equal(params.text.format.strict, true);
  const serialized = JSON.stringify(params.input);
  assert.ok(!serialized.includes(input.birth.date));
  assert.ok(!serialized.includes("origInput"));
  assert.ok(!serialized.includes("birthInfo"));
  assert.ok(!serialized.includes("SECRET_UPSTREAM_DETAIL"));
});

test("same-origin browser requests work with a local bind address", async () => {
  const request = new Request("http://0.0.0.0:3000/api/interpret", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: "{}",
  });
  const response = await handleInterpret(request, { env: {} });
  assert.equal(response.status, 503);
});
