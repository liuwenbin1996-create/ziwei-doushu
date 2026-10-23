const { readHistory, saveHistory } = require('./chart-engine');
const HISTORY_KEY = 'guanxing-mini-history-v1';
const state = (entries, error, corrupt, ok) => ({ entries, error: error || '', corrupt: Boolean(corrupt), ok: Boolean(ok) });
function loadHistory() {
  let raw;
  try { raw = wx.getStorageSync(HISTORY_KEY); }
  catch (_) { return state([], '无法读取本机历史，请稍后重试。原记录没有被覆盖。', false, false); }
  if (raw === '' || raw === undefined || raw === null) return state([], '', false, true);
  if (typeof raw !== 'string') return state([], '本机历史格式异常，请确认清空后再保存。', true, false);
  try { return state(readHistory(raw), '', false, true); }
  catch (_) { return state([], '本机历史损坏，暂时不能保存或删除。请确认清空后重试。', true, false); }
}
function write(entries, previous) {
  try { wx.setStorageSync(HISTORY_KEY, JSON.stringify(entries)); return state(entries, '', false, true); }
  catch (_) { return state(previous || [], '保存失败：本机存储不可用或空间不足。', false, false); }
}
function saveCurrent(request) {
  const current = loadHistory();
  if (!current.ok || current.corrupt) return current;
  try {
    const id = 'chart-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    return write(saveHistory(current.entries, request, id, new Date().toISOString()), current.entries);
  } catch (_) { return state(current.entries, '命盘信息不完整，请重新排盘后保存。', false, false); }
}
function removeHistory(id) {
  const current = loadHistory();
  if (!current.ok || current.corrupt) return current;
  if (typeof id !== 'string' || !current.entries.some(entry => entry.id === id)) return state(current.entries, '这条记录已不存在，请刷新历史。', false, false);
  return write(current.entries.filter(entry => entry.id !== id), current.entries);
}
// Only call after explicit confirmation in the history page.
function clearHistory() { return write([], []); }
module.exports = { HISTORY_KEY, loadHistory, saveCurrent, removeHistory, clearHistory };
