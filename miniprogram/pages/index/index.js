const engine = require('../../utils/chart-engine');

Page({
  data: {
    date: '1996-06-15', maxDate: '', hourIndex: 4,
    hours: engine.TIME_LABELS, genderIndex: 1, genders: ['男', '女'],
    error: '', busy: false,
  },
  onShow() {
    const request = getApp().globalData.currentRequest;
    this.setData({ maxDate: engine.todayISO(), ...(request ? {
      date: request.birth.date,
      hourIndex: request.birth.lateZi ? 12 : request.birth.hour,
      genderIndex: request.birth.gender === 'male' ? 0 : 1,
    } : {}) });
  },
  changeDate(e) { this.setData({ date: e.detail.value, error: '' }); },
  changeHour(e) { this.setData({ hourIndex: Number(e.detail.value), error: '' }); },
  changeGender(e) { this.setData({ genderIndex: Number(e.detail.value), error: '' }); },
  submit() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      getApp().setCurrentRequest({ birth: {
        date: this.data.date, hour: this.data.hourIndex === 12 ? 0 : this.data.hourIndex,
        gender: this.data.genderIndex === 0 ? 'male' : 'female', lateZi: this.data.hourIndex === 12,
      }, year: engine.getCurrentLunarYear() });
      wx.switchTab({ url: '/pages/chart/index' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '排盘失败，请检查出生信息。' });
    } finally { this.setData({ busy: false }); }
  },
});
