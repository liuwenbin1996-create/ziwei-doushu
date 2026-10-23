import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { MobileChart } from "./chart";
import { INTERPRETATION_SCHEMA } from "./interpretation";

export interface AIConfiguration {
  apiKey: string;
  model: string;
}
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
每段给出短摘要、1–4 条盘面观察（说明对应宫位、星曜、四化或大限），以及 1–4 条可自行验证的日常建议。
明确区分本命、所选农历流年与对应大限；daXianIndex=-1 时说明尚无所属实际大限，不得套用第一个大限。
不得编造盘中不存在的星曜或人物经历，不得把命盘符号说成事实、宿命、人格诊断或确定事件。
不得预测寿命、疾病、灾祸、中奖或投资涨跌；不得断言结婚离婚、发财破产、录取升职的必然性，也不得指导重大决策。
婚姻只讨论沟通与边界，财运只讨论预算和风险意识，事业只讨论可反思的工作习惯。流年不是公历某天开始的精确预测。
不引用书籍、讲义、课程或作者原文，不假称专业咨询。语气中立、具体、简洁，不制造恐惧。
仅输出符合指定 JSON schema 的内容，notice 说明传统文化学习参考的限制。`;

export function buildResponseParameters(
  chart: MobileChart,
  model: string,
): ResponseCreateParamsNonStreaming {
  // 不发送公历生日、姓名、地点或客户端自由文本，尽量减少外传个人信息。
  const data = {
    annual: chart.annual,
    natal: {
      gender: chart.input.birth.gender,
      lunarYear: chart.chart.lunarInfo.lunarYear,
      wuxingJuName: chart.chart.wuxingJuName,
      mingGongBranch: chart.chart.mingGongBranch,
      shenGongBranch: chart.chart.shenGongBranch,
      palaces: chart.chart.palaces.map(
        ({ branch, stem, name, stars, daXianAge, isMingGong, isShenGong }) => ({
          branch,
          stem,
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
  return {
    model,
    store: false,
    max_output_tokens: 5000,
    instructions: INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: `请按固定主题解读以下结构化命盘：\n${JSON.stringify(data)}`,
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

export const generateInterpretation: GenerateInterpretation = async (
  chart,
  configuration,
) => {
  const client = new OpenAI({
    apiKey: configuration.apiKey,
    timeout: 45_000,
    maxRetries: 0,
  });
  return client.responses.create(
    buildResponseParameters(chart, configuration.model),
    { timeout: 45_000, maxRetries: 0 },
  );
};
