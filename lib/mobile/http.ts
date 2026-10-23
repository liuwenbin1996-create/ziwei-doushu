import { createHash, timingSafeEqual } from "node:crypto";
import { createMobileChart, parseMobileRequest } from "./chart";
import { parseInterpretation } from "./interpretation";
import { generateInterpretation, type GenerateInterpretation } from "./openai";

const MAX_BODY_BYTES = 16 * 1024;
class RequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function checkOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url);
  // Next's development adapter may use its bind address (0.0.0.0) in request.url.
  // The HTTP Host is the browser's actual authority; browsers cannot set it via fetch.
  const host = request.headers.get("host");
  if (host && !/[\s\/\\@]/.test(host)) expected.host = host;
  if (
    (origin && origin !== expected.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new RequestError("请从本站页面发起请求。", 403);
  }
}

async function readJSON(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new RequestError("请使用 JSON 格式提交。", 415);
  }
  // 按实际字节读取，不信任 Content-Length，也不先 request.json() 再检查。
  if (!request.body) throw new RequestError("请求内容为空。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new RequestError("请求内容过大，请精简后重试。", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new RequestError("请求格式有误，请重新提交。");
  }
}

function validatedChart(body: unknown) {
  try {
    return createMobileChart(parseMobileRequest(body));
  } catch (error) {
    // 排盘参数错误仅发生在这段，不把任何 AI 上游错误带回给用户。
    throw new RequestError(
      error instanceof Error ? error.message : "出生信息有误，请检查后重试。",
    );
  }
}

function handleRequestError(error: unknown): Response {
  if (error instanceof RequestError)
    return json({ error: error.message }, error.status);
  return json({ error: "服务暂时不可用，请稍后重试。" }, 500);
}

export async function handleChart(request: Request): Promise<Response> {
  try {
    checkOrigin(request);
    return json(validatedChart(await readJSON(request)));
  } catch (error) {
    return handleRequestError(error);
  }
}

interface InterpretDependencies {
  env?: Record<string, string | undefined>;
  generate?: GenerateInterpretation;
}

/** 可注入 mock，测试不会触发真实付费 API。 */
export async function handleInterpret(
  request: Request,
  dependencies: InterpretDependencies = {},
): Promise<Response> {
  try {
    checkOrigin(request);
    const env = dependencies.env ?? process.env;
    const apiKey = env.OPENAI_API_KEY?.trim();
    const accessToken = env.AI_ACCESS_TOKEN?.trim();
    if (!apiKey || !accessToken)
      throw new RequestError("AI 解读尚未配置，请联系网站管理员。", 503);
    const authorization = request.headers.get("authorization") ?? "";
    const supplied = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    // 固定长度摘要做恒定时间比较，不记录或回传任一口令。
    const digest = (value: string) =>
      createHash("sha256").update(value).digest();
    if (!supplied || !timingSafeEqual(digest(supplied), digest(accessToken))) {
      throw new RequestError("AI 访问口令无效，请检查后重试。", 401);
    }
    const body = await readJSON(request);
    if (
      body === null ||
      typeof body !== "object" ||
      !("consent" in body) ||
      body.consent !== true
    ) {
      throw new RequestError("请先同意将命盘数据发送给 OpenAI 生成解读。");
    }
    const chart = validatedChart(body);
    try {
      const result = await (dependencies.generate ?? generateInterpretation)(
        chart,
        {
          apiKey,
          model: env.OPENAI_MODEL?.trim() || "gpt-5.4-mini",
        },
      );
      if (result.status !== "completed" || !result.output_text)
        throw new Error("Incomplete response");
      const interpretation = parseInterpretation(
        JSON.parse(result.output_text),
      );
      return json({ ...interpretation, generatedAt: new Date().toISOString() });
    } catch (error) {
      // 仅按类型/状态分类；原始错误常含请求、密钥或上游响应，不输出也不写日志。
      const metadata =
        error && typeof error === "object"
          ? (error as { status?: number; name?: string })
          : {};
      if (metadata.status === 429)
        throw new RequestError("AI 服务繁忙或额度不足，请稍后重试。", 429);
      if (
        metadata.status === 408 ||
        metadata.status === 504 ||
        metadata.name === "APIConnectionTimeoutError" ||
        metadata.name === "TimeoutError" ||
        metadata.name === "AbortError"
      ) {
        throw new RequestError("AI 解读等待超时，请稍后重试。", 504);
      }
      throw new RequestError("AI 暂时未能生成完整解读，请稍后重试。", 502);
    }
  } catch (error) {
    return handleRequestError(error);
  }
}
