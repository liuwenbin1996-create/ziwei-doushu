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

type HarnessOptions = { config?: Record<string, unknown>; hasChart?: boolean; cloudReady?: boolean };
function interpretHarness(options: HarnessOptions = {}) {
  let definition: any; const requests: any[] = [], cloudCalls: any[] = [], deferred: any[] = [];
  let aborted = 0, cloudAborted = 0, nextTimer = 0;
  const timers = new Map<number, () => void>();
  const miniConfig = { aiTransport: 'https', apiBaseUrl: 'https://ziwei.test', aiProvider: 'zhipu', cloudEnvId: '', cloudFunctionName: 'interpret', ...options.config };
  const listeners: Array<() => void> = [];
  const app: any = {
    globalData: { currentRequest: options.hasChart === false ? null : JSON.parse(JSON.stringify(request)), currentResult: options.hasChart === false ? null : {}, cloudReady: options.cloudReady !== false, cloudError: '' },
    subscribeCurrentRequest(listener: () => void) {
      listeners.push(listener);
      return () => { const index = listeners.indexOf(listener); if (index !== -1) listeners.splice(index, 1); };
    },
    setCurrentRequest(next: unknown) {
      this.globalData.currentRequest = JSON.parse(JSON.stringify(next)); this.globalData.currentResult = {};
      listeners.slice().forEach(listener => listener());
    },
  };
  vm.runInNewContext(readFileSync('miniprogram/pages/interpret/index.js', 'utf8'), {
    Page: (page: any) => { definition = page; }, getApp: () => app, JSON,
    require: (name: string) => name === '../../config' ? miniConfig : { parseInterpretation },
    setTimeout(callback: () => void, delay: number) { assert.equal(delay, 55000); const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    wx: {
      request: (call: any) => { requests.push(call); return { abort() { aborted++; call.fail({ errMsg: 'request:fail abort' }); call.complete(); } }; },
      cloud: { callFunction: (call: any) => {
        cloudCalls.push(call);
        const promise: any = new Promise((resolve, reject) => deferred.push({ resolve, reject }));
        promise.abort = () => { cloudAborted++; };
        return promise;
      } },
      switchTab() {},
    },
  });
  const page: any = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)), setData(value: any) { Object.assign(this.data, value); } });
  page.onShow();
  const consent = () => page.onConsentChange({ detail: { value: ['consent'] } });
  const ready = () => { page.onTokenInput({ detail: { value: 'private-test-token' } }); consent(); };
  const fireTimeout = () => { const active = timers.values().next().value; assert.ok(active, 'a timeout must be active'); active(); };
  return { page, app, requests, cloudCalls, deferred, consent, ready, fireTimeout, pendingTimers: () => timers.size, aborted: () => aborted, cloudAborted: () => cloudAborted };
}
function cloudHarness(options: HarnessOptions = {}) {
  return interpretHarness({ ...options, config: { aiTransport: 'cloudbase', cloudEnvId: 'test-cloud-env', cloudFunctionName: 'interpret', ...options.config } });
}
async function flushCloud() { for (let i = 0; i < 4; i++) await Promise.resolve(); }
const analysis = { sections: INTERPRETATION_TOPICS.map(topic => ({ topic, summary: '传统文化观察', observations: ['结合盘面核对'], suggestions: ['自行验证日常习惯'] })), notice: '文化参考' };
test('HTTPS requires explicit transport, HTTPS address, consent and an in-memory token', () => {
  for (const config of [{ apiBaseUrl: '' }, { apiBaseUrl: 'http://ziwei.test' }, { aiTransport: undefined, apiBaseUrl: 'https://ziwei.test' }, { aiTransport: 'unknown' }]) {
    const h = interpretHarness({ config }); h.ready(); h.page.onInterpret();
    assert.equal(h.requests.length, 0); assert.equal(h.cloudCalls.length, 0); assert.equal(h.page.data.configured, false);
  }
  const h = interpretHarness(); h.page.onInterpret(); assert.equal(h.requests.length, 0);
  h.consent(); h.page.onInterpret(); assert.equal(h.requests.length, 0);
  h.ready(); h.page.onInterpret(); assert.equal(h.requests.length, 1); assert.equal(h.cloudCalls.length, 0);
  const call = h.requests[0];
  assert.equal(call.url, 'https://ziwei.test/api/interpret'); assert.equal(call.timeout, 55000);
  assert.equal(call.header.Authorization, 'Bearer private-test-token'); assert.equal(call.data.consent, true);
  assert.equal(call.data.provider, 'zhipu'); assert.equal(h.page.data.providerName, '智谱 BigModel');
  assert.deepEqual(Object.keys(call.data).sort(), ['birth', 'consent', 'provider', 'year']);
  call.success({ statusCode: 200, data: analysis }); call.complete();
  assert.equal(h.page.data.analysis.sections.length, 5); assert.equal(h.page.data.busy, false); assert.equal(h.pendingTimers(), 0);
});
test('HTTPS aborts on hide and ignores late responses and responses for another chart', () => {
  const h = interpretHarness(); h.ready(); h.page.onInterpret();
  const old = h.requests[0]; h.page.onHide();
  assert.equal(h.aborted(), 1); assert.equal(h.page.data.token, ''); assert.equal(h.page.data.busy, false); assert.equal(h.pendingTimers(), 0);
  old.success({ statusCode: 200, data: analysis }); assert.equal(h.page.data.analysis, null);
  h.page.onShow(); h.ready(); h.page.onInterpret();
  h.app.setCurrentRequest({ ...request, year: 2027 });
  assert.equal(h.page.data.busy, false); assert.equal(h.aborted(), 2);
  h.requests[1].success({ statusCode: 200, data: analysis });
  assert.equal(h.page.data.analysis, null); assert.equal(h.page.data.consent, false); assert.equal(h.pendingTimers(), 0);
});
test('HTTPS rejects malformed output and presents safe server, timeout and domain errors', () => {
  const malformed = interpretHarness(); malformed.ready(); malformed.page.onInterpret();
  malformed.requests[0].success({ statusCode: 200, data: { sections: [] } }); malformed.requests[0].complete();
  assert.equal(malformed.page.data.analysis, null); assert.ok(malformed.page.data.error); assert.equal(malformed.pendingTimers(), 0);
  for (const statusCode of [401, 503]) {
    const h = interpretHarness(); h.ready(); h.page.onInterpret();
    h.requests[0].success({ statusCode, data: { error: '服务暂时不可用，请稍后重试。' } }); h.requests[0].complete();
    assert.ok(h.page.data.error); assert.equal(h.page.data.analysis, null); assert.equal(h.page.data.busy, false); assert.equal(h.pendingTimers(), 0);
  }
  for (const errMsg of ['request:fail timeout', 'request:fail url not in domain list https://private-preview.test']) {
    const h = interpretHarness(); h.ready(); h.page.onInterpret(); h.requests[0].fail({ errMsg }); h.requests[0].complete();
    assert.match(h.page.data.error, /超时|合法请求域名/); assert.ok(!h.page.data.error.includes('private-preview.test')); assert.equal(h.page.data.busy, false);
  }
});
test('cloud calls require a configured and initialized environment and explicit consent', () => {
  for (const options of [{ config: { cloudEnvId: '' } }, { config: { cloudFunctionName: '' } }, { cloudReady: false }, { config: { aiProvider: 'unknown' } }]) {
    const h = cloudHarness(options); h.consent(); h.page.onInterpret(); h.page.onIdentity();
    assert.equal(h.cloudCalls.length, 0); assert.equal(h.requests.length, 0); assert.equal(h.page.data.configured, false); assert.ok(h.page.data.error);
  }
  const h = cloudHarness(); h.page.onInterpret(); assert.equal(h.cloudCalls.length, 0);
  assert.equal(h.page.data.isCloud, true); assert.equal(h.page.data.configured, true); assert.equal(h.page.data.viaTunnel, false);
});
test('cloud success sends only chart request fields and never a shared token or client identity', async () => {
  const h = cloudHarness(); h.consent(); h.page.setData({ token: 'DO_NOT_FORWARD_TOKEN', openid: 'DO_NOT_FORWARD_OPENID' }); h.page.onInterpret();
  assert.equal(h.cloudCalls.length, 1); assert.equal(h.requests.length, 0);
  const call = h.cloudCalls[0];
  assert.equal(call.name, 'interpret'); assert.equal(call.config.env, 'test-cloud-env');
  assert.deepEqual(Object.keys(call.data).sort(), ['birth', 'consent', 'provider', 'year']);
  assert.deepEqual(JSON.parse(JSON.stringify(call.data.birth)), request.birth);
  assert.equal(call.data.consent, true); assert.equal(call.data.provider, 'zhipu');
  assert.ok(!JSON.stringify(call).includes('DO_NOT_FORWARD'));
  h.deferred[0].resolve({ result: { statusCode: 200, data: analysis } }); await flushCloud();
  assert.equal(h.page.data.analysis.sections.length, 5); assert.equal(h.page.data.busy, false); assert.equal(h.pendingTimers(), 0);
});
test('cloud server errors, invalid answers and rejected SDK promises clear busy without raw diagnostics', async () => {
  for (const envelope of [{ statusCode: 403, data: { error: '当前微信身份不在内测名单。' } }, { statusCode: 200, data: { sections: [] } }, {}]) {
    const h = cloudHarness(); h.consent(); h.page.onInterpret();
    h.deferred[0].resolve({ result: envelope }); await flushCloud();
    assert.ok(h.page.data.error); assert.equal(h.page.data.analysis, null); assert.equal(h.page.data.busy, false); assert.equal(h.pendingTimers(), 0);
  }
  const h = cloudHarness(); h.consent(); h.page.onInterpret();
  h.deferred[0].reject(new Error('PRIVATE_PLATFORM_DIAGNOSTIC')); await flushCloud();
  assert.ok(h.page.data.error); assert.ok(!h.page.data.error.includes('PRIVATE_PLATFORM')); assert.equal(h.page.data.busy, false); assert.equal(h.pendingTimers(), 0);
});
test('cloud timeout cancels only waiting and ignores a late successful result', async () => {
  const h = cloudHarness(); h.consent(); h.page.onInterpret(); h.fireTimeout();
  assert.equal(h.page.data.busy, false); assert.equal(h.pendingTimers(), 0); assert.equal(h.cloudAborted(), 0);
  assert.match(h.page.data.error, /仅取消等待.*服务端可能继续/);
  h.deferred[0].resolve({ result: { statusCode: 200, data: analysis } }); await flushCloud();
  assert.equal(h.page.data.analysis, null); assert.equal(h.page.data.busy, false);
});
test('cloud hide, unload and changing charts invalidate pending results and clear local credentials', async () => {
  for (const action of ['hide', 'unload', 'chart']) {
    const h = cloudHarness(); h.consent(); h.page.setData({ token: 'MEMORY_ONLY', openid: 'MEMORY_OPENID' }); h.page.onInterpret();
    if (action === 'hide') h.page.onHide();
    else if (action === 'unload') h.page.onUnload();
    else h.app.setCurrentRequest({ ...request, year: 2027 });
    assert.equal(h.page.data.busy, false); assert.equal(h.pendingTimers(), 0); assert.equal(h.cloudAborted(), 0);
    assert.equal(h.page.data.token, ''); assert.equal(h.page.data.openid, ''); assert.equal(h.page.data.consent, false);
    h.deferred[0].resolve({ result: { statusCode: 200, data: analysis } }); await flushCloud();
    assert.equal(h.page.data.analysis, null);
  }
});
test('identity query needs no chart and sends no client-supplied identity, birth data or token', async () => {
  const h = cloudHarness({ hasChart: false }); h.page.onIdentity();
  assert.equal(h.page.data.identityBusy, true);
  assert.equal(JSON.stringify(h.cloudCalls[0].data), JSON.stringify({ action: 'identity' }));
  h.deferred[0].resolve({ result: { statusCode: 200, data: { openid: 'test_owner_openid' } } }); await flushCloud();
  assert.equal(h.page.data.openid, 'test_owner_openid'); assert.equal(h.page.data.identityBusy, false); assert.equal(h.pendingTimers(), 0);
  assert.equal(h.app.globalData.openid, undefined);
  h.page.onHide(); assert.equal(h.page.data.openid, '');
  h.page.onShow(); h.page.onIdentity(); h.page.onHide();
  h.deferred[1].resolve({ result: { statusCode: 200, data: { openid: 'late_owner_openid' } } }); await flushCloud();
  assert.equal(h.page.data.openid, ''); assert.equal(h.pendingTimers(), 0);
});
