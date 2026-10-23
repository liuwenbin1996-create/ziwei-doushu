export type AIProvider = "zhipu" | "openai";
export const AI_PROVIDER_NAMES: Record<AIProvider, string> = {
  zhipu: "智谱 BigModel",
  openai: "OpenAI",
};
export const ZHIPU_FREE_MODEL = "glm-4.7-flash";
export const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/";

export interface AIConfiguration {
  provider: AIProvider;
  apiKey: string;
  model: string;
}
type Environment = Record<string, string | undefined>;

export function selectedAIProvider(env: Environment): AIProvider | null {
  // 保留旧 OpenAI 部署；新部署默认智谱。明确选择智谱后绝不回退收费服务。
  const provider =
    env.AI_PROVIDER?.trim() ||
    (env.ZHIPU_API_KEY?.trim()
      ? "zhipu"
      : env.OPENAI_API_KEY?.trim()
        ? "openai"
        : "zhipu");
  return provider === "zhipu" || provider === "openai" ? provider : null;
}

export function resolveAIConfiguration(
  env: Environment,
): AIConfiguration | null {
  const provider = selectedAIProvider(env);
  if (!provider) return null;
  const apiKey = (
    provider === "zhipu" ? env.ZHIPU_API_KEY : env.OPENAI_API_KEY
  )?.trim();
  if (!apiKey) return null;
  return {
    provider,
    apiKey,
    // 免费方案固定此型号，不读取客户端型号，也不自动改用付费 FlashX/旗舰模型。
    model:
      provider === "zhipu"
        ? ZHIPU_FREE_MODEL
        : env.OPENAI_MODEL?.trim() || "gpt-5.4-mini",
  };
}
