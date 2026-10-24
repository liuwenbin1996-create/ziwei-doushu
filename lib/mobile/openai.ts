import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { MobileChart } from "./chart";
import { INTERPRETATION_SCHEMA } from "./interpretation";
import { interpretationEvidence } from "./grounding";
import { BRANCHES, STEMS } from "../ziwei/constants";
import {
  ZHIPU_BASE_URL,
  ZHIPU_FREE_MODEL,
  ZHIPU_FREE_MODELS,
  type AIConfiguration,
} from "./ai-config";
export interface AIResult {
  status?: string;
  output_text?: string;
}
export type GenerateInterpretation = (
  chart: MobileChart,
  configuration: AIConfiguration,
) => Promise<AIResult>;

// 原创提示词；不引入上游倪海厦/古籍资料、案例正文或数据库。
const INSTRUCTIONS = `你是用简体中文解释紫微斗数盘面符号的传统文化学习助手。
这套体系没有经科学验证的预测能力。请使用“传统说法中可用来观察……”等条件性表达。
只依据给出的服务端结构化排盘数据，解释性格、事业、财运、婚姻、流年五个主题，每个主题恰好一次。
observations 必须逐字复制 verifiedObservations 中对应主题的整个数组，顺序和文字完全不变，不另行生成事实。
summary 和 suggestions 只写条件性的文化联想与日常反思，不得出现星曜名称、具体年份数字或干支，这些盘面事实只在 observations 中展示。
每段给出简短摘要，以及 1–3 条可自行验证的日常建议。
明确区分本命、所选农历流年与对应大限；daXianIndex=-1 时说明尚无所属实际大限，不得套用第一个大限。
不得编造盘中不存在的星曜或人物经历，不得把命盘符号说成事实、宿命、人格诊断或确定事件。
不得预测寿命、疾病、灾祸、中奖或投资涨跌；不得断言结婚离婚、发财破产、录取升职的必然性，也不得指导重大决策。
婚姻只讨论沟通与边界。财运摘要和建议只讨论记账、收支预算和消费习惯，不得出现投资、理财、股票、基金、买卖或收益等建议，不评价财富是否稳定。事业只讨论可反思的工作习惯。流年只提供复盘和规划建议，不判断某年是否顺利、平稳或有变动。
不引用书籍、讲义、课程或作者原文，不假称专业咨询。语气中立、具体、简洁，不制造恐惧。
仅输出符合指定 JSON schema 的内容，notice 说明传统文化学习参考的限制。`;

function chartData(chart: MobileChart) {
  // 不发送公历生日、姓名、地点或客户端自由文本，尽量减少外传个人信息。
  return {
    verifiedObservations: interpretationEvidence(chart),
    annual: { ...chart.annual, branchName: BRANCHES[chart.annual.branch] },
    natal: {
      gender: chart.input.birth.gender,
      lunarYear: chart.chart.lunarInfo.lunarYear,
      wuxingJuName: chart.chart.wuxingJuName,
      mingGongBranch: chart.chart.mingGongBranch,
      shenGongBranch: chart.chart.shenGongBranch,
      palaces: chart.chart.palaces.map(
        ({ branch, stem, name, stars, daXianAge, isMingGong, isShenGong }) => ({
          branch,
          branchName: BRANCHES[branch],
          stem,
          stemName: STEMS[stem],
          name,
          stars,
          daXianAge,
          isMingGong,
          isShenGong,
        }),
      ),
      selectedDaXian: chart.chart.daXians[chart.annual.daXianIndex] ?? null,
    },
  };
}

export function buildResponseParameters(
  chart: MobileChart,
  model: string,
): ResponseCreateParamsNonStreaming {
  return {
    model,
    store: false,
    max_output_tokens: 5000,
    instructions: INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: `请按固定主题解读以下结构化命盘：\n${JSON.stringify(chartData(chart))}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "ziwei_cultural_interpretation",
        strict: true,
        schema: INTERPRETATION_SCHEMA,
      },
    },
  };
}

export function buildZhipuParameters(
  chart: MobileChart,
  model: string = ZHIPU_FREE_MODEL,
): ChatCompletionCreateParamsNonStreaming & {
  thinking?: { type: "disabled" };
} {
  if (!ZHIPU_FREE_MODELS.includes(model as (typeof ZHIPU_FREE_MODELS)[number]))
    throw new Error("Unsupported free model");
  return {
    model,
    stream: false,
    max_tokens: 5000,
    ...(model === ZHIPU_FREE_MODEL
      ? { thinking: { type: "disabled" as const } }
      : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${INSTRUCTIONS}\nJSON schema：${JSON.stringify(INTERPRETATION_SCHEMA)}`,
      },
      {
        role: "user",
        content: `只使用以下核对后的主题事实：\n${JSON.stringify({ verifiedObservations: interpretationEvidence(chart) })}\n最终逐项检查：observations 原样复制；summary 不能重复星名、宫位分析、年份或干支，只写不确定的文化联想与反思。财运只谈记账、收支、消费习惯，不谈投资理财或收益。例：summary="传统说法中，可把这些线索当作观察表达习惯的提醒，不代表已经具备某种性格。" suggestions=["记录一次沟通经历，观察自己的表达节奏。"]。流年摘要只提定期复盘，不预测顺逆。只输出 JSON。`,
      },
    ],
  };
}

export async function generateInterpretation(
  chart: MobileChart,
  configuration: AIConfiguration,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<AIResult> {
  const client = new OpenAI({
    apiKey: configuration.apiKey,
    ...(configuration.provider === "zhipu"
      ? { baseURL: ZHIPU_BASE_URL, organization: null, project: null }
      : {}),
    timeout: 45_000,
    maxRetries: 0,
    logLevel: "off",
    fetch: fetchImplementation,
  });
  if (configuration.provider === "zhipu") {
    const result = await client.chat.completions.create(
      buildZhipuParameters(chart, configuration.model),
      { timeout: 45_000, maxRetries: 0 },
    );
    const choice = result.choices[0];
    return {
      status:
        choice?.finish_reason === "stop" && !choice.message.refusal
          ? "completed"
          : "incomplete",
      output_text: choice?.message.content ?? "",
    };
  }
  return client.responses.create(
    buildResponseParameters(chart, configuration.model),
    { timeout: 45_000, maxRetries: 0 },
  );
}
