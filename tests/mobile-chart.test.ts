import test from "node:test";
import assert from "node:assert/strict";
import {
  createMobileChart,
  parseMobileRequest,
  type MobileRequest,
} from "../lib/mobile/chart";
import { getSiHuaByStem } from "../lib/ziwei/sihua";
import { getDaXianIndexForYear } from "../lib/ziwei/yunxian-context";

const input: MobileRequest = {
  birth: { date: "1990-06-15", hour: 5, gender: "female", lateZi: false },
  year: 2026,
};
const now = new Date("2026-10-22T12:00:00Z");

test("dates: accept real leap days and strip unexpected input", () => {
  const parsed = parseMobileRequest(
    {
      ...input,
      birth: { ...input.birth, date: "2000-02-29", name: "不要发送" },
      chart: "fake",
    },
    now,
  );
  assert.deepEqual(parsed.birth, {
    date: "2000-02-29",
    hour: 5,
    gender: "female",
    lateZi: false,
  });
  assert.deepEqual(Object.keys(parsed), ["birth", "year"]);
  assert.doesNotThrow(() =>
    parseMobileRequest(
      { ...input, birth: { ...input.birth, date: "1900-01-01" } },
      now,
    ),
  );
  assert.doesNotThrow(() =>
    parseMobileRequest(
      { ...input, birth: { ...input.birth, date: "2100-12-31" } },
      new Date("2101-01-01T12:00:00Z"),
    ),
  );
});

test("dates: reject impossible, future, out-of-range and unpadded dates", () => {
  for (const date of [
    "1900-02-29",
    "2001-02-29",
    "2000-02-30",
    "2000-04-31",
    "1899-12-31",
    "2101-01-01",
    "2000-00-01",
    "2000-13-01",
    "2000-01-00",
    "2000-1-01",
    "tomorrow",
    "2026-10-23",
  ]) {
    assert.throws(
      () =>
        parseMobileRequest({ ...input, birth: { ...input.birth, date } }, now),
      Error,
      date,
    );
  }
  // 服务端 UTC 仍是 21 日时，上海已经是 22 日。
  assert.doesNotThrow(() =>
    parseMobileRequest(
      { ...input, birth: { ...input.birth, date: "2026-10-22" } },
      new Date("2026-10-21T17:00:00Z"),
    ),
  );
});

test("validation: reject wrong types, invalid hours, genders, years, and late Zi combinations", () => {
  for (const value of [
    null,
    [],
    {},
    { birth: [] },
    { ...input, year: "2026" },
    { ...input, year: 2101 },
    { ...input, year: 1899 },
    { ...input, year: 2026.5 },
  ]) {
    assert.throws(() => parseMobileRequest(value, now));
  }
  for (const patch of [
    { hour: -1 },
    { hour: 12 },
    { hour: 1.5 },
    { hour: "0" },
    { gender: "other" },
    { lateZi: "yes" },
    { lateZi: true, hour: 1 },
  ]) {
    assert.throws(() =>
      parseMobileRequest(
        { ...input, birth: { ...input.birth, ...patch } },
        now,
      ),
    );
  }
});

test("late Zi: rolls across Gregorian year once and preserves original date", () => {
  const late = createMobileChart({
    birth: { date: "1999-12-31", hour: 0, gender: "male", lateZi: true },
    year: 2026,
  });
  const next = createMobileChart({
    birth: { date: "2000-01-01", hour: 0, gender: "male", lateZi: false },
    year: 2026,
  });
  assert.equal(late.input.birth.date, "1999-12-31");
  assert.equal(late.chart.birthInfo.year, 2000);
  assert.equal(late.chart.birthInfo.month, 1);
  assert.equal(late.chart.birthInfo.day, 1);
  assert.equal(late.chart.birthInfo.origInput?.clockHour, 23);
  assert.deepEqual(late.chart.palaces, next.chart.palaces);
  assert.deepEqual(late.chart.lunarInfo, next.chart.lunarInfo);
});

test("chart: twelve distinct palaces, fourteen major stars, minor stars and natal transformations", () => {
  const { chart } = createMobileChart(input);
  assert.equal(chart.palaces.length, 12);
  assert.equal(new Set(chart.palaces.map((palace) => palace.branch)).size, 12);
  const majorStars = chart.palaces.flatMap((palace) =>
    palace.stars.filter((star) => star.type === "major"),
  );
  assert.equal(majorStars.length, 14);
  assert.equal(new Set(majorStars.map((star) => star.name)).size, 14);
  assert.ok(
    chart.palaces.some((palace) =>
      palace.stars.some((star) => star.type !== "major"),
    ),
  );
  const expected = getSiHuaByStem(chart.lunarInfo.yearStem);
  for (const [transformation, starName] of Object.entries(expected)) {
    assert.ok(
      chart.palaces.some((palace) =>
        palace.stars.some(
          (star) => star.name === starName && star.siHua === transformation,
        ),
      ),
      `${starName}化${transformation}`,
    );
  }
  assert.equal(chart.palaces.filter((palace) => palace.isMingGong).length, 1);
  assert.equal(chart.palaces.filter((palace) => palace.isShenGong).length, 1);
});

test("annual: uses lunar birth year and checks Daxian inclusive boundaries", () => {
  const result = createMobileChart({
    birth: { date: "1999-02-11", hour: 0, gender: "male", lateZi: false },
    year: 2026,
  });
  assert.equal(result.chart.lunarInfo.lunarYear, 1998);
  assert.equal(result.annual.age, 29);
  assert.equal(result.annual.branch, 6);
  assert.equal(result.annual.stemName, "丙");
  assert.deepEqual(result.annual.siHua, {
    lu: "天同",
    quan: "天机",
    ke: "文昌",
    ji: "廉贞",
  });
  assert.equal(
    result.annual.daXianIndex,
    getDaXianIndexForYear(result.chart, 2026),
  );
  assert.equal(result.chart.daXians.length, 12);
  for (const [index, dx] of result.chart.daXians.entries()) {
    assert.equal(dx.endAge - dx.startAge, 9);
    assert.equal(
      getDaXianIndexForYear(result.chart, 1998 + dx.startAge - 1),
      index,
    );
    assert.equal(
      getDaXianIndexForYear(result.chart, 1998 + dx.endAge - 1),
      index,
    );
  }
  assert.equal(
    createMobileChart({ ...input, year: 1990 }).annual.daXianIndex,
    -1,
  );
  assert.throws(() => createMobileChart({ ...input, year: 1900 }), /早于/);
});

test("adapter adds Daxian palace-stem transformations and selects the requested year", () => {
  const result = createMobileChart({ ...input, year: 2045 });
  assert.equal(result.chart.currentAge, result.annual.age);
  assert.equal(result.chart.currentDaXianIndex, result.annual.daXianIndex);
  for (const dx of result.chart.daXians) {
    const palace = result.chart.palaces.find(
      (p) => p.branch === dx.palaceBranch,
    )!;
    const expected = getSiHuaByStem(palace.stem);
    assert.equal(dx.siHua?.stemIndex, palace.stem);
    assert.deepEqual(
      {
        lu: dx.siHua?.lu,
        quan: dx.siHua?.quan,
        ke: dx.siHua?.ke,
        ji: dx.siHua?.ji,
      },
      {
        lu: expected["禄"],
        quan: expected["权"],
        ke: expected["科"],
        ji: expected["忌"],
      },
    );
  }
  assert.equal(result.chart.palaces.filter((p) => p.isCurrentDaXian).length, 1);
});
