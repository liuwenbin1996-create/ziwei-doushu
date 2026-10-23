import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readHistory, saveHistory } from '../lib/mobile/history';
import { parseInterpretation, INTERPRETATION_TOPICS } from '../lib/mobile/interpretation';
const request = { birth: { date: '1996-06-15', hour: 4, gender: 'female' as const, lateZi: false }, year: 2026 };
function storageHarness(initial: unknown = '') {
  let raw = initial, writes = 0;
  const behavior = { readFails: false, writeFails: false };
  const module = { exports: {} as any };
  vm.runInNewContext(readFileSync('miniprogram/utils/storage.js', 'utf8'), {
    module, Date, Math, JSON,
    require: (name: string) => { assert.equal(name, './chart-engine'); return { readHistory, saveHistory }; },
    wx: {
      getStorageSync(key: string) { assert.equal(key, 'guanxing-mini-history-v1'); if (behavior.readFails) throw new Error('blocked'); return raw; },
      setStorageSync(key: string, value: string) { assert.equal(key, 'guanxing-mini-history-v1'); if (behavior.writeFails) throw new Error('quota'); writes++; raw = value; },
    },
  });
  return { storage: module.exports, behavior, raw: () => raw, writes: () => writes };
}
test('mini history stores JSON requests only, deduplicates and caps at twenty', () => {
  const h = storageHarness();
  assert.equal(h.storage.loadHistory().ok, true);
  assert.equal(h.storage.saveCurrent({ ...request, token: 'never-store', analysis: 'never-store' }).ok, true);
  assert.equal(typeof h.raw(), 'string');
  assert.ok(!String(h.raw()).includes('never-store'));
  assert.equal(h.storage.saveCurrent({ ...request, year: 2027 }).entries.length, 1);
  for (let day = 1; day <= 23; day++) h.storage.saveCurrent({ ...request, birth: { ...request.birth, date: '1990-01-' + String(day).padStart(2, '0') } });
  assert.equal(h.storage.loadHistory().entries.length, 20);
});
test('mini damaged history cannot be overwritten by save or delete; explicit reset restores writes', () => {
  const h = storageHarness('{broken');
  assert.equal(h.storage.loadHistory().corrupt, true);
  assert.equal(h.storage.saveCurrent(request).ok, false);
  assert.equal(h.storage.removeHistory('missing').ok, false);
  assert.equal(h.raw(), '{broken'); assert.equal(h.writes(), 0);
  assert.equal(h.storage.clearHistory().ok, true);
  assert.equal(h.raw(), '[]');
  assert.equal(h.storage.saveCurrent(request).ok, true);
});
test('mini read/write failures preserve existing history and return usable errors', () => {
  const h = storageHarness(); h.storage.saveCurrent(request);
  const original = h.raw();
  h.behavior.readFails = true;
  assert.equal(h.storage.saveCurrent(request).ok, false); assert.equal(h.raw(), original);
  h.behavior.readFails = false; h.behavior.writeFails = true;
  const result = h.storage.saveCurrent({ ...request, year: 2027 });
  assert.equal(result.ok, false); assert.ok(result.error); assert.equal(result.entries.length, 1); assert.equal(h.raw(), original);
});
test('mini removal reloads storage and retains every other record', () => {
  const h = storageHarness(); h.storage.saveCurrent(request);
  const saved = h.storage.saveCurrent({ ...request, birth: { ...request.birth, date: '1990-01-01' } });
  const id = saved.entries[0].id;
  const result = h.storage.removeHistory(id);
  assert.equal(result.ok, true); assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].request.birth.date, request.birth.date);
  assert.equal(h.storage.removeHistory(id).ok, false);
});
function interpretHarness(apiBaseUrl = 'https://ziwei.test') {
  let definition: any; const requests: any[] = []; let aborted = 0;
  const app = { globalData: { currentRequest: JSON.parse(JSON.stringify(request)), currentResult: {} } };
  vm.runInNewContext(readFileSync('miniprogram/pages/interpret/index.js', 'utf8'), {
    Page: (page: any) => { definition = page; }, getApp: () => app, JSON,
    require: (name: string) => name === '../../config' ? { apiBaseUrl, aiProvider: 'zhipu' } : { parseInterpretation },
    wx: { request: (options: any) => { requests.push(options); return { abort() { aborted++; options.fail({ errMsg: 'request:fail abort' }); options.complete(); } }; }, switchTab() {} },
  });
  const page: any = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)), setData(value: any) { Object.assign(this.data, value); } });
  page.onShow();
  const ready = () => { page.onTokenInput({ detail: { value: 'private-test-token' } }); page.onConsentChange({ detail: { value: ['consent'] } }); };
  return { page, app, requests, ready, aborted: () => aborted };
}
const analysis = { sections: INTERPRETATION_TOPICS.map(topic => ({ topic, summary: '传统文化观察', observations: ['结合盘面核对'], suggestions: ['自行验证日常习惯'] })), notice: '文化参考' };
test('mini AI requires configured HTTPS, explicit consent and an in-memory token', () => {
  const missing = interpretHarness(''); missing.ready(); missing.page.onInterpret();
  assert.equal(missing.requests.length, 0); assert.equal(missing.page.data.configured, false);
  const plain = interpretHarness('http://ziwei.test'); plain.ready(); plain.page.onInterpret(); assert.equal(plain.requests.length, 0);
  const h = interpretHarness(); h.page.onInterpret(); assert.equal(h.requests.length, 0);
  h.ready(); h.page.onInterpret(); assert.equal(h.requests.length, 1);
  const call = h.requests[0];
  assert.equal(call.url, 'https://ziwei.test/api/interpret'); assert.equal(call.timeout, 55000);
  assert.equal(call.header.Authorization, 'Bearer private-test-token'); assert.equal(call.data.consent, true);
  assert.equal(call.data.provider, 'zhipu'); assert.equal(h.page.data.providerName, '智谱 BigModel');
  assert.deepEqual(Object.keys(call.data).sort(), ['birth', 'consent', 'provider', 'year']);
  call.success({ statusCode: 200, data: analysis }); call.complete();
  assert.equal(h.page.data.analysis.sections.length, 5); assert.equal(h.page.data.busy, false);
});
test('mini AI aborts on hide and ignores late responses and responses for another chart', () => {
  const h = interpretHarness(); h.ready(); h.page.onInterpret();
  const old = h.requests[0]; h.page.onHide();
  assert.equal(h.aborted(), 1); assert.equal(h.page.data.token, ''); assert.equal(h.page.data.busy, false);
  old.success({ statusCode: 200, data: analysis }); assert.equal(h.page.data.analysis, null);
  h.page.onShow(); h.ready(); h.page.onInterpret();
  h.app.globalData.currentRequest = { ...h.app.globalData.currentRequest, year: 2027 };
  h.requests[1].success({ statusCode: 200, data: analysis });
  assert.equal(h.page.data.analysis, null);
  h.page.onHide(); h.page.onShow(); assert.equal(h.page.data.consent, false);
});
test('mini AI rejects malformed successful output without displaying fabricated sections', () => {
  const h = interpretHarness(); h.ready(); h.page.onInterpret();
  h.requests[0].success({ statusCode: 200, data: { sections: [] } }); h.requests[0].complete();
  assert.equal(h.page.data.analysis, null); assert.ok(h.page.data.error); assert.equal(h.page.data.busy, false);
});
test('mini AI displays server and timeout errors and releases the busy state', () => {
  for (const statusCode of [401, 503]) {
    const h = interpretHarness(); h.ready(); h.page.onInterpret();
    h.requests[0].success({ statusCode, data: { error: '服务暂时不可用，请稍后重试。' } }); h.requests[0].complete();
    assert.ok(h.page.data.error); assert.equal(h.page.data.analysis, null); assert.equal(h.page.data.busy, false);
  }
  const h = interpretHarness(); h.ready(); h.page.onInterpret();
  h.requests[0].fail({ errMsg: 'request:fail timeout' }); h.requests[0].complete();
  assert.match(h.page.data.error, /超时/); assert.equal(h.page.data.busy, false);
});
