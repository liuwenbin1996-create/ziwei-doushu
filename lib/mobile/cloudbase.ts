import { Buffer } from "node:buffer";
import { handleInterpret } from "./http";
import type { GenerateInterpretation } from "./openai";

export interface CloudBaseIdentity {
  APPID?: string;
  OPENID?: string;
}
export interface CloudBaseResult {
  statusCode: number;
  data: Record<string, unknown>;
}
export interface CloudBaseDependencies {
  /** 仅由云端 wx-server-sdk 提供；不得用 event.userInfo 替代。 */
  getWXContext: () => CloudBaseIdentity;
  env?: Record<string, string | undefined>;
  generate?: GenerateInterpretation;
}
const MAX_EVENT_BYTES = 16 * 1024;
const fail = (statusCode: number, error: string): CloudBaseResult => ({ statusCode, data: { error } });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** 普通事件云函数适配层；不启动 HTTP 服务，不向客户端返回服务密钥。 */
export async function handleCloudInterpret(
  event: unknown,
  dependencies: CloudBaseDependencies,
): Promise<CloudBaseResult> {
  try {
    // 必须在挑选字段前校验整个事件，避免丢弃垃圾字段后绕过长度限制。
    let serialized: string | undefined;
    try { serialized = JSON.stringify(event); }
    catch { return fail(400, "请求格式有误，请重新提交。"); }
    if (!serialized || !isRecord(event)) return fail(400, "请求内容必须是 JSON 对象。");
    if (Buffer.byteLength(serialized, "utf8") > MAX_EVENT_BYTES)
      return fail(413, "请求内容过大，请精简后重试。");

    const env = dependencies.env ?? process.env;
    const expectedAppId = env.WECHAT_APP_ID?.trim();
    if (!expectedAppId) return fail(503, "云函数尚未绑定小程序，请联系部署者。");
    let identity: CloudBaseIdentity;
    try { identity = dependencies.getWXContext(); }
    catch { return fail(401, "无法确认微信调用身份，请从小程序重新发起。"); }
    if (!identity || typeof identity.APPID !== "string" || !identity.APPID
      || typeof identity.OPENID !== "string" || !identity.OPENID.trim())
      return fail(401, "无法确认微信调用身份，请从小程序重新发起。");
    if (identity.APPID !== expectedAppId) return fail(403, "当前小程序无权调用此云函数。");

    const action = event.action === undefined ? "interpret" : event.action;
    if (action === "identity") {
      // 只向调用者返回自身标识；无需名单、模型配置或任何模型请求。
      return { statusCode: 200, data: { openid: identity.OPENID } };
    }
    if (action !== "interpret") return fail(400, "不支持此操作。");
    const allowed = new Set((env.AI_ALLOWED_OPENIDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
    if (allowed.size === 0) return fail(503, "AI 使用名单尚未配置，请联系部署者。");
    if (!allowed.has(identity.OPENID)) return fail(403, "当前微信账号尚未获准使用 AI 解读。");
    // 本云函数只允许智谱免费型号，配置错误时拒绝，不切换到其它服务商。
    if (env.AI_PROVIDER?.trim() && env.AI_PROVIDER.trim() !== "zhipu")
      return fail(503, "云函数 AI 服务商配置有误，请联系部署者。");
    const httpEnv = {
      AI_PROVIDER: "zhipu",
      ZHIPU_API_KEY: env.ZHIPU_API_KEY,
      ZHIPU_MODEL: env.ZHIPU_MODEL,
      AI_ACCESS_TOKEN: env.AI_ACCESS_TOKEN,
    };
    const birth = isRecord(event.birth) ? {
      date: event.birth.date, hour: event.birth.hour,
      gender: event.birth.gender, lateZi: event.birth.lateZi,
    } : event.birth;
    const request = new Request("https://cloudbase.internal/api/interpret", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 口令仅在可信服务器内部构造；客户端身份已经由 SDK 上下文校验。
        Authorization: "Bearer " + (httpEnv.AI_ACCESS_TOKEN?.trim() ?? ""),
      },
      body: JSON.stringify({ birth, year: event.year, consent: event.consent, provider: event.provider }),
    });
    const response = await handleInterpret(request, { env: httpEnv, generate: dependencies.generate });
    const data: unknown = await response.json();
    if (!isRecord(data)) return fail(502, "AI 未返回完整结果，请稍后重试。");
    return { statusCode: response.status, data };
  } catch {
    // 不记录原始 event、身份、密钥、上游响应或异常堆栈。
    return fail(500, "云端解读服务暂时不可用，请稍后重试。");
  }
}
