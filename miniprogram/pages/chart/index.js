const engine = require('../../utils/chart-engine');
const storage = require('../../utils/storage');
const POSITIONS = [[3,2],[3,1],[3,0],[2,0],[1,0],[0,0],[0,1],[0,2],[0,3],[1,3],[2,3],[3,3]];
const KEYS = ['lu', 'quan', 'ke', 'ji'];
const LABELS = ['禄', '权', '科', '忌'];

Page({
  data: { hasChart: false, mode: 'natal', modeName: '本命', year: 0, yearIndex: 0,
    years: Array.from({ length: 201 }, (_, i) => String(1900 + i)), palaces: [], decades: [],
    selected: null, selectedBranch: -1, error: '', notice: '', transforms: [] },
  onShow() { this.refresh(); },
  refresh() {
    const result = getApp().globalData.currentResult;
    if (!result) { this.setData({ hasChart: false }); return; }
    const chart = result.chart;
    const mode = this.data.mode;
    const decade = chart.daXians[result.annual.daXianIndex];
    const table = mode === 'annual' ? result.annual.siHua : mode === 'decade' ? decade && decade.siHua : null;
    const transformFor = (star) => table ? LABELS.filter((_, i) => table[KEYS[i]] === star.name).join('') : mode === 'natal' ? star.siHua || '' : '';
    const selectedBranch = this.data.selectedBranch < 0 ? chart.mingGongBranch : this.data.selectedBranch;
    const palaces = chart.palaces.map((palace) => {
      const stars = palace.stars.map((star) => ({ ...star, transform: transformFor(star) }));
      const majors = stars.filter((star) => star.type === 'major');
      const minors = stars.filter((star) => star.type !== 'major').sort((a, b) => Number(!!b.transform) - Number(!!a.transform));
      const [row, col] = POSITIONS[palace.branch];
      return { ...palace, stars, majors, minors: minors.slice(0, 3), extra: Math.max(0, minors.length - 3),
        branchName: engine.STEMS[palace.stem] + engine.BRANCHES[palace.branch],
        ageRange: palace.daXianAge ? palace.daXianAge.join('–') : '',
        position: 'top:' + row * 25 + '%;left:' + col * 25 + '%;',
        selected: palace.branch === selectedBranch,
        active: mode === 'annual' ? palace.branch === result.annual.branch : mode === 'decade' ? !!decade && palace.branch === decade.palaceBranch : palace.isMingGong,
      };
    });
    const selected = palaces.find((palace) => palace.branch === selectedBranch);
    const natalTransforms = chart.palaces.flatMap((palace) => palace.stars.filter((star) => star.siHua).map((star) => ({ name: star.name, label: star.siHua })));
    const transforms = table ? KEYS.map((key, i) => ({ name: table[key], label: LABELS[i] })) : mode === 'natal' ? natalTransforms : [];
    const decades = chart.daXians.map((item, index) => {
      const year = chart.lunarInfo.lunarYear + item.startAge - 1;
      return { index, label: item.startAge + '–' + item.endAge + '岁', palaceName: item.palaceName,
        year, disabled: year < 1900 || year > 2100, active: index === result.annual.daXianIndex };
    });
    this.setData({ hasChart: true, palaces, selected, selectedBranch, transforms, decades,
      modeName: mode === 'annual' ? '流年' : mode === 'decade' ? '大限' : '本命',
      year: result.annual.year, yearIndex: result.annual.year - 1900,
      birthLabel: result.input.birth.date + ' · ' + (result.input.birth.gender === 'male' ? '男' : '女') + ' · ' + engine.TIME_LABELS[result.input.birth.lateZi ? 12 : result.input.birth.hour],
      lunarLabel: chart.lunarInfo.lunarYear + '年' + (chart.lunarInfo.isLeapMonth ? '闰' : '') + Math.abs(chart.lunarInfo.lunarMonth) + '月' + chart.lunarInfo.lunarDay + '日',
      wuxing: chart.wuxingJuName, age: result.annual.age, mingZhu: chart.mingZhu || '—', shenZhu: chart.shenZhu || '—',
      decadeLabel: decade ? decade.startAge + '–' + decade.endAge + '岁 · ' + decade.palaceName : '童限或超出大限范围',
      notice: mode === 'decade' && !decade ? '所选流年处于童限或超出大限范围，暂无对应大限四化。' : '',
    });
  },
  changeMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!['natal', 'decade', 'annual'].includes(mode)) return;
    this.setData({ mode, error: '' }); this.refresh();
  },
  selectPalace(e) { this.setData({ selectedBranch: Number(e.currentTarget.dataset.branch) }); this.refresh(); },
  setYear(year) {
    const app = getApp();
    if (!app.globalData.currentRequest) return;
    try { app.setCurrentRequest({ ...app.globalData.currentRequest, year }); this.setData({ error: '' }); this.refresh(); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : '流年切换失败。' }); }
  },
  changeYear(e) { this.setYear(1900 + Number(e.detail.value)); },
  changeDecade(e) {
    const item = this.data.decades.find((entry) => entry.index === Number(e.currentTarget.dataset.index));
    if (!item || item.disabled) return;
    this.setData({ mode: 'decade' }); this.setYear(item.year);
  },
  save() {
    const request = getApp().globalData.currentRequest;
    if (!request) return;
    const result = storage.saveCurrent(request);
    this.setData({ error: result.ok ? '' : result.error });
    if (result.ok) wx.showToast({ title: '已保存到本机', icon: 'success' });
  },
  goInput() { wx.switchTab({ url: '/pages/index/index' }); },
  goAI() { wx.switchTab({ url: '/pages/interpret/index' }); },
});
