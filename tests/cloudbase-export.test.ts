import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { exportWechatProject } from '../scripts/export-wechat-cloudbase.mjs';

test('CloudBase export isolates server code and never overwrites a configured project', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'ziwei-cloud-export-'));
  const target = path.join(temporary, 'project');
  try {
    exportWechatProject(target);
    const project = JSON.parse(readFileSync(path.join(target, 'project.config.json'), 'utf8'));
    assert.equal(project.appid, 'touristappid');
    assert.equal(project.setting.urlCheck, true);
    assert.equal(project.miniprogramRoot, 'miniprogram/');
    assert.equal(project.cloudfunctionRoot, 'cloudfunctions/');
    assert.ok(existsSync(path.join(target, 'miniprogram/pages/interpret/index.wxml')));
    assert.ok(existsSync(path.join(target, 'cloudfunctions/interpret/index.js')));
    assert.ok(!existsSync(path.join(target, 'miniprogram/cloudfunctions')));
    assert.ok(!existsSync(path.join(target, 'node_modules')));
    assert.ok(!existsSync(path.join(target, 'cloudfunctions/interpret/src')));
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(directory, item.name)) : [path.join(directory, item.name)]);
    assert.ok(walk(target).every(file => !path.basename(file).startsWith('.env')));
    const original = readFileSync(path.join(target, 'project.config.json'), 'utf8');
    assert.throws(() => exportWechatProject(target), /已存在/);
    assert.equal(readFileSync(path.join(target, 'project.config.json'), 'utf8'), original);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('CloudBase export rejects a destination inside client source, including symlink aliases', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'ziwei-cloud-alias-'));
  const source = path.resolve('miniprogram');
  try {
    const forbidden = path.join(source, 'pages', path.basename(temporary));
    assert.throws(() => exportWechatProject(forbidden), /源码/);
    assert.equal(existsSync(forbidden), false);
    const alias = path.join(temporary, 'alias');
    symlinkSync(source, alias, 'dir');
    const aliased = path.join(alias, 'utils', path.basename(temporary));
    assert.throws(() => exportWechatProject(aliased), /源码/);
    assert.equal(existsSync(aliased), false);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
