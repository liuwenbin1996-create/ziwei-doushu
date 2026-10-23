export const INTERPRETATION_TOPICS = [
  "性格",
  "事业",
  "财运",
  "婚姻",
  "流年",
] as const;
export type InterpretationTopic = (typeof INTERPRETATION_TOPICS)[number];
export interface InterpretationSection {
  topic: InterpretationTopic;
  summary: string;
  observations: string[];
  suggestions: string[];
}
export interface Interpretation {
  sections: InterpretationSection[];
  notice: string;
  generatedAt?: string;
}

export const CULTURAL_NOTICE =
  "本解读仅供传统文化学习与自我观察，不是科学预测，也不构成医疗、投资或婚姻决策建议。";

export const INTERPRETATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections", "notice"],
  properties: {
    sections: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "summary", "observations", "suggestions"],
        properties: {
          topic: { type: "string", enum: [...INTERPRETATION_TOPICS] },
          summary: { type: "string", minLength: 1, maxLength: 600 },
          observations: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", minLength: 1, maxLength: 400 },
          },
          suggestions: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", minLength: 1, maxLength: 400 },
          },
        },
      },
    },
    notice: { type: "string", minLength: 1, maxLength: 500 },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validText(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= limit
  );
}
function validList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 4 &&
    value.every((text) => validText(text, 400))
  );
}

/** 服务端仍验证输出，覆盖拒答、截断、重复主题与上游格式异常。 */
export function parseInterpretation(value: unknown): Interpretation {
  if (
    !isRecord(value) ||
    !Array.isArray(value.sections) ||
    value.sections.length !== 5 ||
    !validText(value.notice, 500)
  ) {
    throw new Error("AI 返回的格式不完整，请重试。");
  }
  const sections = value.sections.map((section): InterpretationSection => {
    if (
      !isRecord(section) ||
      !INTERPRETATION_TOPICS.includes(section.topic as InterpretationTopic) ||
      !validText(section.summary, 600) ||
      !validList(section.observations) ||
      !validList(section.suggestions)
    ) {
      throw new Error("AI 返回的内容不完整，请重试。");
    }
    return {
      topic: section.topic as InterpretationTopic,
      summary: section.summary,
      observations: section.observations,
      suggestions: section.suggestions,
    };
  });
  if (new Set(sections.map((section) => section.topic)).size !== 5)
    throw new Error("AI 返回的主题不完整，请重试。");
  sections.sort(
    (a, b) =>
      INTERPRETATION_TOPICS.indexOf(a.topic) -
      INTERPRETATION_TOPICS.indexOf(b.topic),
  );
  return { sections, notice: CULTURAL_NOTICE };
}
