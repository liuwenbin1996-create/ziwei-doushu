import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve('miniprogram');
const requireMini = createRequire(path.join(root, 'app.js'));
const engine = requireMini('./utils/chart-engine');
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));

function appFixture(configOverrides: Record<string, unknown> = {}, wx: Record<string, unknown> = {}) {
  let app: any;
  vm.runInNewContext(readFileSync(path.join(root, 'app.js'), 'utf8'), {
    require: (id: string) => id === './config' ? { ...requireMini('./config'), ...configOverrides } : requireMini(id), wx, App: (value: unknown) => { app = value; },
  });
  return app;
}
function pageFixture(name: string, app: any, wx: Record<string, unknown> = {}, replacements: Record<string, unknown> = {}) {
  const filename = path.join(root, 'pages', name, 'index.js');
  const localRequire = createRequire(filename);
  let definition: any;
  vm.runInNewContext(readFileSync(filename, 'utf8'), {
    require: (id: string) => id in replacements ? replacements[id] : localRequire(id),
    getApp: () => app, wx, Page: (value: unknown) => { definition = value; },
  });
  return { ...definition, data: clean(definition.data), setData(update: Record<string, unknown>) { Object.assign(this.data, update); } };
}
const sample = { birth: { date: '1996-06-15', hour: 4, gender: 'female', lateZi: false }, year: 2026 };

test('native input creates a local chart and maps late Zi to next-day Zi', () => {
  const app = appFixture();
  const switches: string[] = [];
  const page = pageFixture('index', app, { switchTab: (value: any) => switches.push(value.url) });
  page.onShow();
  assert.match(page.data.maxDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(page.data.hours.length, 13);
  page.changeDate({ detail: { value: '1996-12-31' } });
  page.changeHour({ detail: { value: '12' } });
  page.submit();
  assert.equal(page.data.error, '');
  assert.equal(page.data.busy, false);
  assert.equal(app.globalData.currentRequest.birth.hour, 0);
  assert.equal(app.globalData.currentRequest.birth.lateZi, true);
  assert.equal(app.globalData.currentResult.chart.birthInfo.year, 1997);
  assert.equal(app.globalData.currentResult.chart.birthInfo.day, 1);
  assert.deepEqual(switches, ['/pages/chart/index']);
});

test('native input refuses invalid dates without replacing the active chart', () => {
  const app = appFixture();
  app.setCurrentRequest(sample);
  const previous = app.globalData.currentResult;
  const page = pageFixture('index', app, { switchTab: () => assert.fail('invalid input navigated') });
  page.setData({ date: '2024-02-30' });
  page.submit();
  assert.ok(page.data.error);
  assert.equal(page.data.busy, false);
  assert.equal(app.globalData.currentResult, previous);
});

test('native chart shows 12 palaces, 14 majors and the selected layer transformations', () => {
  const app = appFixture();
  app.setCurrentRequest(sample);
  const page = pageFixture('chart', app, {}, { '../../utils/storage': { saveCurrent: () => ({ ok: true }) } });
  page.onShow();
  assert.equal(page.data.palaces.length, 12);
  assert.equal(page.data.palaces.reduce((count: number, palace: any) => count + palace.majors.length, 0), 14);
  assert.equal(page.data.transforms.length, 4);
  assert.equal(new Set(page.data.palaces.map((palace: any) => palace.position)).size, 12);
  page.changeMode({ currentTarget: { dataset: { mode: 'annual' } } });
  assert.equal(page.data.modeName, '流年');
  for (const [index, key] of ['lu', 'quan', 'ke', 'ji'].entries()) {
    assert.equal(page.data.transforms[index].name, app.globalData.currentResult.annual.siHua[key]);
  }
  assert.equal(page.data.palaces.filter((palace: any) => palace.active).length, 1);
  page.selectPalace({ currentTarget: { dataset: { branch: '0' } } });
  assert.equal(page.data.selected.branch, 0);
  assert.equal(page.data.selected.stars.length, app.globalData.currentResult.chart.palaces.find((palace: any) => palace.branch === 0).stars.length);
  const decade = page.data.decades.find((item: any) => !item.disabled);
  page.changeDecade({ currentTarget: { dataset: { index: decade.index } } });
  assert.equal(page.data.mode, 'decade');
  assert.equal(page.data.year, decade.year);
  assert.equal(page.data.transforms.length, 4);
  const current = app.globalData.currentResult;
  page.changeYear({ detail: { value: '0' } });
  assert.ok(page.data.error);
  assert.equal(app.globalData.currentResult, current);
  page.setYear(1996);
  assert.equal(page.data.transforms.length, 0);
  assert.ok(page.data.notice);
  assert.ok(page.data.palaces.every((palace: any) => palace.stars.every((star: any) => !star.transform)));
});

test('native chart saving displays storage errors and does not claim success', () => {
  const app = appFixture(); app.setCurrentRequest(sample);
  let success = false;
  const page = pageFixture('chart', app, { showToast: () => { success = true; } }, {
    '../../utils/storage': { saveCurrent: () => ({ ok: false, error: '本机存储空间不足。' }) },
  });
  page.save();
  assert.equal(page.data.error, '本机存储空间不足。');
  assert.equal(success, false);
});

test('preview has four native routes, no backend by default, and enables domain checks', () => {
  const appConfig = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(appConfig.pages.length, 4);
  for (const route of appConfig.pages) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(readFileSync(path.join(root, route + '.' + extension)).length);
    }
    const template = readFileSync(path.join(root, route + '.wxml'), 'utf8');
    assert.doesNotMatch(template, /<(?:div|span|br|script|iframe)\b/i);
  }
  const config = JSON.parse(readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  assert.equal(config.appid, 'touristappid');
  assert.equal(config.setting.urlCheck, true);
  assert.equal(requireMini('./config').apiBaseUrl, '');
  assert.equal(requireMini('./config').aiTransport, 'cloudbase');
  assert.equal(requireMini('./config').cloudEnvId, '');
  assert.equal(requireMini('./config').cloudFunctionName, 'interpret');
  assert.deepEqual(Object.keys(requireMini('./config')).sort(), ['aiProvider', 'aiTransport', 'apiBaseUrl', 'cloudEnvId', 'cloudFunctionName']);
  assert.equal(engine.readHistory(null).length, 0);
});

test('cloud initialization is opt-in by environment and disables user tracing', () => {
  const calls: any[] = [];
  const wx = { cloud: { init: (options: unknown) => { calls.push(options); } } };
  const missing = appFixture({}, wx); missing.onLaunch();
  assert.equal(calls.length, 0); assert.equal(missing.globalData.cloudReady, false); assert.ok(missing.globalData.cloudError);
  missing.setCurrentRequest(sample); assert.equal(missing.globalData.currentResult.chart.palaces.length, 12);
  const https = appFixture({ aiTransport: 'https', cloudEnvId: 'unused-env' }, wx); https.onLaunch(); assert.equal(calls.length, 0);
  const app = appFixture({ cloudEnvId: 'test-cloud-env' }, wx); app.onLaunch();
  assert.equal(calls.length, 1); assert.equal(JSON.stringify(calls[0]), JSON.stringify({ env: 'test-cloud-env', traceUser: false }));
  assert.equal(app.globalData.cloudReady, true); assert.equal(app.globalData.cloudError, '');
});

test('cloud initialization failures are safe and leave local charting usable', async () => {
  const unavailable = appFixture({ cloudEnvId: 'test-cloud-env' }); unavailable.onLaunch();
  assert.equal(unavailable.globalData.cloudReady, false); assert.ok(unavailable.globalData.cloudError);
  for (const init of [() => { throw new Error('PRIVATE_SDK_DETAIL'); }, () => Promise.reject(new Error('PRIVATE_SDK_DETAIL'))]) {
    const app = appFixture({ cloudEnvId: 'test-cloud-env' }, { cloud: { init } });
    app.onLaunch(); if (app.cloudInitialization) await app.cloudInitialization;
    assert.equal(app.globalData.cloudReady, false); assert.match(app.globalData.cloudError, /初始化失败/);
    assert.ok(!app.globalData.cloudError.includes('PRIVATE_SDK_DETAIL'));
    app.setCurrentRequest(sample); assert.equal(app.globalData.currentResult.chart.palaces.length, 12);
  }
});

test('a validated new chart notifies active views and unsubscribe detaches them', () => {
  const app = appFixture(); let calls = 0;
  const remove = app.subscribeCurrentRequest(() => { calls++; });
  app.setCurrentRequest(sample); assert.equal(calls, 1);
  assert.throws(() => app.setCurrentRequest({ ...sample, birth: { ...sample.birth, date: '2024-02-30' } }));
  assert.equal(calls, 1);
  remove(); app.setCurrentRequest({ ...sample, year: 2027 }); assert.equal(calls, 1);
});
