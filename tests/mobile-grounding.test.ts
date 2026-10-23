import test from "node:test";
import assert from "node:assert/strict";
import { createMobileChart } from "../lib/mobile/chart";
import {
  interpretationEvidence,
  assertInterpretationGrounding,
} from "../lib/mobile/grounding";
import {
  CULTURAL_NOTICE,
  INTERPRETATION_TOPICS,
} from "../lib/mobile/interpretation";

const chart = createMobileChart({
  birth: { date: "1996-06-15", hour: 4, gender: "female", lateZi: false },
  year: 2026,
});
const evidence = interpretationEvidence(chart);
const answer = () => ({
  sections: INTERPRETATION_TOPICS.map((topic) => ({
    topic,
    summary: "传统说法中，可将这些符号用于观察日常习惯。",
    observations: [...evidence[topic]],
    suggestions: ["记录具体经历后再作反思。"],
  })),
  notice: CULTURAL_NOTICE,
});

test("verified facts retain the actual year pillar and star locations from the chart", () => {
  assert.match(evidence.流年[0], /2026农历流年干支为丙午/);
  assert.ok(
    evidence.事业[1].includes("仆役宫") && evidence.事业[1].includes("文昌"),
  );
  assert.ok(
    evidence.婚姻[0].includes("夫妻宫") && !evidence.婚姻[0].includes("文昌"),
  );
  assert.doesNotThrow(() => assertInterpretationGrounding(answer(), chart));
});

test("altered palace evidence and invented star positions are rejected", () => {
  const changed = answer();
  changed.sections[4].observations[0] = "2026流年地支为未，文昌在夫妻宫。";
  assert.throws(() => assertInterpretationGrounding(changed, chart));
  const invented = answer();
  invented.sections[4].summary = "文昌位于夫妻宫，地支未。";
  assert.throws(() => assertInterpretationGrounding(invented, chart));
});

test("budget guidance cannot turn into investment recommendations", () => {
  const value = answer();
  value.sections[2].suggestions = ["适合长期投资，选择稳健理财。"];
  assert.throws(() => assertInterpretationGrounding(value, chart));
  const anotherTopic = answer();
  anotherTopic.sections[1].suggestions = ["建议投资股票。"];
  assert.throws(() => assertInterpretationGrounding(anotherTopic, chart));
  const prediction = answer();
  prediction.sections[4].summary = "你明年必定升职。";
  assert.throws(() => assertInterpretationGrounding(prediction, chart));
});
