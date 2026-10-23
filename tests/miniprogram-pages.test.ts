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

function appFixture() {
  let app: any;
  vm.runInNewContext(readFileSync(path.join(root, 'app.js'), 'utf8'), {
    require: requireMini, App: (value: unknown) => { app = value; },
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
  assert.equal(engine.readHistory(null).length, 0);
});
