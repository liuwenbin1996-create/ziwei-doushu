import { generateChart, setBrightnessSchool } from "../ziwei/algorithm";
import {
  getLiuNianSiHua,
  getYearBranchIndex,
  getSiHuaByStem,
} from "../ziwei/sihua";
import { getDaXianIndexForYear } from "../ziwei/yunxian-context";
import { STEMS } from "../ziwei/constants";
import type { ZiweiChart } from "../ziwei/types";

export interface MobileBirth {
  /** 公历出生日期；不包含姓名或出生地点。 */
  date: string;
  /** 子=0、丑=1……亥=11。 */
  hour: number;
  gender: "male" | "female";
  /** 23:00–23:59；仅子时有效，排盘日归次日。 */
  lateZi: boolean;
}

export interface MobileRequest {
  birth: MobileBirth;
  /** 农历流年年份（正月初一换年）。 */
  year: number;
}

export interface MobileChart {
  input: MobileRequest;
  chart: ZiweiChart;
  annual: {
    year: number;
    age: number;
    branch: number;
    stemName: string;
    siHua: { lu: string; quan: string; ke: string; ji: string };
    /** -1 表示童限或已超出生成的大限区间。 */
    daXianIndex: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function todayInChina(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** 严格校验，不接受 Date 自动顺延的 2 月 30 日等日期。 */
export function parseMobileRequest(
  value: unknown,
  now = new Date(),
): MobileRequest {
  if (!isRecord(value) || !isRecord(value.birth))
    throw new Error("请填写完整的出生信息。");
  const { date, hour, gender, lateZi } = value.birth;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("出生日期请使用 YYYY-MM-DD 格式。");
  }
  const [year, month, day] = date.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 2100 ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error("请输入 1900–2100 年之间真实存在的公历日期。");
  }
  if (date > todayInChina(now)) throw new Error("出生日期不能晚于今天。");
  if (
    typeof hour !== "number" ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 11
  ) {
    throw new Error("请选择有效时辰。");
  }
  if (gender !== "male" && gender !== "female")
    throw new Error("请选择排盘性别。");
  if (typeof lateZi !== "boolean") throw new Error("请确认是否为晚子时。");
  if (lateZi && hour !== 0)
    throw new Error("晚子时只适用于子时（23:00–23:59）。");
  if (
    typeof value.year !== "number" ||
    !Number.isInteger(value.year) ||
    value.year < 1900 ||
    value.year > 2100
  ) {
    throw new Error("流年年份应在 1900–2100 年之间。");
  }
  // 只返回允许字段，客户端附带的命盘或提示词均不进入计算与 AI。
  return { birth: { date, hour, gender, lateZi }, year: value.year };
}

export function createMobileChart(request: MobileRequest): MobileChart {
  const input = parseMobileRequest(request);
  const [year, month, day] = input.birth.date.split("-").map(Number);
  const effectiveDate = new Date(
    Date.UTC(year, month - 1, day + (input.birth.lateZi ? 1 : 0)),
  );
  // 原算法的流派状态是模块级变量。同步重置并计算，固定移动版口径。
  setBrightnessSchool("default");
  const chart = generateChart(
    {
      year: effectiveDate.getUTCFullYear(),
      month: effectiveDate.getUTCMonth() + 1,
      day: effectiveDate.getUTCDate(),
      hour: input.birth.hour,
      gender: input.birth.gender,
      ...(input.birth.lateZi
        ? { origInput: { year, month, day, clockHour: 23, clockMinute: 0 } }
        : {}),
    },
    { leapMonth: "split" },
  );
  // Keep upstream engine untouched; add explicit palace-stem transformations to this adapter.
  for (const decade of chart.daXians) {
    const palace = chart.palaces.find((p) => p.branch === decade.palaceBranch);
    if (!palace) throw new Error("大限宫位数据不完整。");
    const transforms = getSiHuaByStem(palace.stem);
    decade.stemIndex = palace.stem;
    decade.stemName = STEMS[palace.stem];
    decade.siHua = {
      stemIndex: palace.stem,
      stemName: STEMS[palace.stem],
      lu: transforms["禄"],
      quan: transforms["权"],
      ke: transforms["科"],
      ji: transforms["忌"],
    };
  }
  const age = input.year - chart.lunarInfo.lunarYear + 1;
  if (age < 1) throw new Error("所选农历流年早于农历出生年，请重新选择。");
  chart.currentAge = age;
  chart.currentDaXianIndex = getDaXianIndexForYear(chart, input.year);
  for (const palace of chart.palaces)
    palace.isCurrentDaXian =
      palace.branch === chart.daXians[chart.currentDaXianIndex]?.palaceBranch;
  const { stemName, transforms } = getLiuNianSiHua(input.year);
  return {
    input,
    chart,
    annual: {
      year: input.year,
      age,
      branch: getYearBranchIndex(input.year),
      stemName,
      siHua: {
        lu: transforms["禄"],
        quan: transforms["权"],
        ke: transforms["科"],
        ji: transforms["忌"],
      },
      daXianIndex: getDaXianIndexForYear(chart, input.year),
    },
  };
}
