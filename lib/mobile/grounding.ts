import type { MobileChart } from "./chart";
import type { Interpretation, InterpretationTopic } from "./interpretation";
import { BRANCHES, STEMS } from "../ziwei/constants";

/** 盘面事实由排盘引擎生成，模型只能解释，不能重算或挪动星曜。 */
export function interpretationEvidence(
  chart: MobileChart,
): Record<InterpretationTopic, string[]> {
  const palace = (name: string) => {
    const p = chart.chart.palaces.find((p) => p.name === name);
    if (!p) throw new Error("Missing palace");
    const label = name.endsWith("宫") ? name : name + "宫";
    const stars = p.stars
      .map((s) => s.name + (s.siHua ? `（生年化${s.siHua}）` : ""))
      .join("、");
    return `本命${label}在${STEMS[p.stem]}${BRANCHES[p.branch]}，实际星曜：${stars || "无"}。`;
  };
  const annual = chart.annual;
  const hua = (s: { lu: string; quan: string; ke: string; ji: string }) =>
    `${s.lu}化禄、${s.quan}化权、${s.ke}化科、${s.ji}化忌`;
  const decade = chart.chart.daXians[annual.daXianIndex];
  return {
    性格: [palace("命宫"), palace("福德")],
    事业: [palace("官禄"), palace("仆役")],
    财运: [palace("财帛"), palace("田宅")],
    婚姻: [palace("夫妻"), palace("福德")],
    流年: [
      `${annual.year}农历流年干支为${annual.stemName}${BRANCHES[annual.branch]}，正月初一换年；流年四化为${hua(annual.siHua)}。`,
      decade
        ? `当前实际大限为虚岁${decade.startAge}至${decade.endAge}，落在本命${decade.palaceName.endsWith("宫") ? decade.palaceName : decade.palaceName + "宫"}${BRANCHES[decade.palaceBranch]}位${decade.siHua ? `；大限四化为${hua(decade.siHua)}` : ""}。`
        : "所选流年没有对应的已生成大限，不套用第一个大限。",
    ],
  };
}

export function assertInterpretationGrounding(
  value: Interpretation,
  chart: MobileChart,
): void {
  const evidence = interpretationEvidence(chart);
  const starNames = new Set(
    chart.chart.palaces
      .flatMap((p) => p.stars.map((s) => s.name))
      .filter((n) => n.length >= 2),
  );
  const palaceNames = chart.chart.palaces.map((p) =>
    p.name.endsWith("宫") ? p.name : p.name + "宫",
  );
  for (const section of value.sections) {
    if (
      JSON.stringify(section.observations) !==
      JSON.stringify(evidence[section.topic])
    )
      throw new Error("AI changed verified chart evidence");
    const commentary = [section.summary, ...section.suggestions].join("\n");
    if (
      /必定|注定|必然|一定(?:会|能)|(?:建议|适合|选择|考虑|应当|可以|可).{0,12}(?:投资|理财|买入|卖出|股票|基金)/.test(
        commentary,
      )
    )
      throw new Error("AI added deterministic or investment advice");
    // 具体星曜、干支与年份只允许出现在可核对的事实栏，避免模型另编位置。
    if (
      [...starNames, ...palaceNames].some((name) =>
        commentary.includes(name),
      ) ||
      /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]|(?:19|20|21)\d{2}|天干|地支/.test(
        commentary,
      )
    )
      throw new Error("AI added unverified chart claims");
    if (
      section.topic === "财运" &&
      /投资|理财|股票|基金|买入|卖出|入市|收益|财运平稳|财富稳定/.test(
        commentary,
      )
    )
      throw new Error("AI exceeded budget-only guidance");
  }
}
