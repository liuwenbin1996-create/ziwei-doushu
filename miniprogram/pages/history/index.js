const storage = require('../../utils/storage');
const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const displayEntries = entries => entries.map(entry => ({ id: entry.id, date: entry.request.birth.date, hour: BRANCHES[entry.request.birth.hour] + '时' + (entry.request.birth.lateZi ? '（晚子）' : ''), gender: entry.request.birth.gender === 'male' ? '男' : '女', year: entry.request.year, savedAt: entry.savedAt.slice(0, 10) }));
Page({
  data: { entries: [], error: '', corrupt: false },
  onShow() { this.refresh(); },
  refresh() { const result = storage.loadHistory(); this.setData({ entries: displayEntries(result.entries), error: result.error, corrupt: result.corrupt }); },
  onStart() { wx.switchTab({ url: '/pages/index/index' }); },
  onRestore(event) {
    const current = storage.loadHistory();
    if (!current.ok || current.corrupt) { this.setData({ error: current.error, corrupt: current.corrupt }); return; }
    const entry = current.entries.find(item => item.id === event.currentTarget.dataset.id);
    if (!entry) { this.refresh(); this.setData({ error: '这条记录已不存在，请选择其他命盘。' }); return; }
    try { getApp().setCurrentRequest(entry.request); wx.switchTab({ url: '/pages/chart/index' }); }
    catch (_) { this.setData({ error: '这条命盘暂时无法恢复，请检查记录或重新排盘。' }); }
  },
  onDelete(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({ title: '删除这张命盘？', content: '只删除当前小程序中的这条本机记录，删除后无法撤销。', confirmText: '删除', confirmColor: '#a84f43', success: answer => {
      if (!answer.confirm) return;
      const result = storage.removeHistory(id); this.refresh();
      if (!result.ok) this.setData({ error: result.error });
      else wx.showToast({ title: '记录已删除', icon: 'success' });
    } });
  },
  onClear() {
    wx.showModal({ title: this.data.corrupt ? '重置损坏的历史？' : '清空全部命盘？', content: '将清空当前小程序中保存的全部命盘。此操作无法从本机撤销，不影响网页版历史。', confirmText: '确认清空', confirmColor: '#a84f43', success: answer => {
      if (!answer.confirm) return;
      const result = storage.clearHistory(); this.refresh();
      if (!result.ok) this.setData({ error: result.error });
      else wx.showToast({ title: '历史已清空', icon: 'success' });
    } });
  },
});
