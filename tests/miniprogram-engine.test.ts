import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { createMobileChart, parseMobileRequest, type MobileRequest } from '../lib/mobile/chart';
import { getSiHuaByStem } from '../lib/ziwei/sihua';
import type * as Engine from '../miniprogram/src/engine';
const source = readFileSync(resolve('miniprogram/utils/chart-engine.js'), 'utf8');
const moduleObject = { exports: {} };
const context = vm.createContext({ module: moduleObject, exports: moduleObject.exports, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, setTimeout, clearTimeout, Intl: undefined, window: undefined, document: undefined, process: undefined, fetch: undefined });
vm.runInContext(source, context, { filename: 'chart-engine.js', timeout: 10000 });
const engine = moduleObject.exports as typeof Engine;
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const example: MobileRequest = { birth: { date: '1996-06-15', hour: 4, gender: 'female', lateZi: false }, year: 2026 };
test('offline bundle loads without host require, Intl, browser or Node globals', () => {
  assert.ok(Buffer.byteLength(source) < 2 * 1024 * 1024);
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /\b(?:window|document|process)\s*(?:\.|\[)/);
  assert.doesNotMatch(source, /\b(?:OPENAI_API_KEY|AI_ACCESS_TOKEN)\b/);
  assert.doesNotMatch(source, /node_modules\/(?:openai|next|react)\//);
  for (const name of ['createMobileChart','parseMobileRequest','readHistory','saveHistory','parseInterpretation','todayISO','getCurrentLunarYear'] as const) assert.equal(typeof engine[name], 'function', name);
  assert.equal(engine.TIME_LABELS.length, 13); assert.equal(engine.BRANCHES.length, 12); assert.equal(engine.STEMS.length, 10);
});
test('offline charts match shared web domain across calendar boundaries', () => {
  const cases: MobileRequest[] = [example,
    { birth: { date: '1900-01-01', hour: 0, gender: 'male', lateZi: false }, year: 2026 },
    { birth: { date: '1999-02-11', hour: 11, gender: 'male', lateZi: false }, year: 2026 },
    { birth: { date: '2000-02-29', hour: 6, gender: 'female', lateZi: false }, year: 2024 },
    { birth: { date: '1999-12-31', hour: 0, gender: 'male', lateZi: true }, year: 2000 },
    { birth: { date: '2023-04-10', hour: 3, gender: 'female', lateZi: false }, year: 2026 }];
  for (const input of cases) {
    const bundled = engine.createMobileChart(input);
    assert.deepEqual(plain(bundled), plain(createMobileChart(input)), input.birth.date);
    assert.equal(bundled.chart.palaces.length, 12);
    const major = bundled.chart.palaces.flatMap(p => p.stars.filter(s => s.type === 'major'));
    assert.equal(major.length, 14); assert.equal(new Set(major.map(s => s.name)).size, 14);
    for (const [transformation, starName] of Object.entries(getSiHuaByStem(bundled.chart.lunarInfo.yearStem))) {
      assert.ok(bundled.chart.palaces.some(p => p.stars.some(s => s.name === starName && s.siHua === transformation)));
    }
    assert.equal(bundled.annual.age, input.year - bundled.chart.lunarInfo.lunarYear + 1);
    assert.equal(bundled.chart.currentAge, bundled.annual.age);
  }
});
test('late Zi crosses Gregorian year once, preserving original input', () => {
  const late = engine.createMobileChart({ ...example, birth: { ...example.birth, date: '1999-12-31', hour: 0, lateZi: true } });
  const next = engine.createMobileChart({ ...example, birth: { ...example.birth, date: '2000-01-01', hour: 0, lateZi: false } });
  assert.equal(late.chart.birthInfo.year, 2000); assert.equal(late.chart.birthInfo.month, 1); assert.equal(late.chart.birthInfo.day, 1);
  assert.equal(late.input.birth.date, '1999-12-31'); assert.deepEqual(plain(late.chart.palaces), plain(next.chart.palaces));
});
test('offline validation rejects invalid input without Intl and matches UTC+8 date boundary', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  for (const date of ['1900-02-29','2001-02-29','2000-02-30','1899-12-31','2026-10-23']) {
    const input = { ...example, birth: { ...example.birth, date } };
    assert.throws(() => engine.parseMobileRequest(input, now)); assert.throws(() => parseMobileRequest(input, now));
  }
  assert.throws(() => engine.parseMobileRequest({ ...example, birth: { ...example.birth, lateZi: true } }, now));
  const midnight = new Date('2026-10-21T16:00:00Z');
  const today = { ...example, birth: { ...example.birth, date: '2026-10-22' } };
  assert.deepEqual(plain(engine.parseMobileRequest(today, midnight)), parseMobileRequest(today, midnight));
});
test('China date and lunar year helpers work without Intl at New Year boundaries', () => {
  assert.equal(engine.todayISO(new Date('2026-12-31T15:59:59Z')), '2026-12-31');
  assert.equal(engine.todayISO(new Date('2026-12-31T16:00:00Z')), '2027-01-01');
  assert.equal(engine.getCurrentLunarYear(new Date('2024-02-09T15:59:59Z')), 2023);
  assert.equal(engine.getCurrentLunarYear(new Date('2024-02-09T16:00:00Z')), 2024);
});
test('offline history round trips, caps 20 entries and replaces duplicate births', () => {
  let entries: ReturnType<typeof engine.readHistory> = [];
  for (let index = 0; index < 25; index++) {
    const input = { ...example, birth: { ...example.birth, date: '1996-06-' + String(index+1).padStart(2,'0') } };
    entries = engine.saveHistory(entries, input, 'saved-'+index, '2026-10-23T00:00:00.000Z');
  }
  assert.equal(entries.length, 20); assert.deepEqual(plain(engine.readHistory(JSON.stringify(entries))), plain(entries));
  entries = engine.saveHistory(entries, entries[5].request, 'replacement', '2026-10-23T01:00:00.000Z');
  assert.equal(entries.length,20); assert.equal(entries[0].id,'replacement');
  assert.equal(entries.filter(e => e.request.birth.date === entries[0].request.birth.date).length,1);
  assert.throws(() => engine.readHistory('{"bad":"history"}'));
});
test('offline interpretation validation accepts five themes and rejects duplicate themes', () => {
  const result = { sections: ['性格','事业','财运','婚姻','流年'].map(topic => ({topic,summary:'传统文化观察。',observations:['核对盘面。'],suggestions:['结合实际情况反思。']})), notice:'仅供文化参考' };
  assert.equal(engine.parseInterpretation(result).sections.length,5);
  assert.throws(() => engine.parseInterpretation({...result, sections:result.sections.map(() => result.sections[0])}));
});
