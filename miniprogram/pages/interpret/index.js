const config = require('../../config');
const { parseInterpretation } = require('../../utils/chart-engine');
const PROVIDERS = { zhipu: '智谱 BigModel', openai: 'OpenAI' };
const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
function baseUrl() {
  const base = typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl.trim().replace(/\/+$/, '') : '';
  return /^https:\/\/[^\/?#\s@]+(?:\/[^?#\s]*)?$/i.test(base) ? base : '';
}
const fingerprint = request => request ? JSON.stringify(request) : '';
function responseBody(value) { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch (_) { return null; } }
Page({
  data: { hasChart: false, configured: false, providerName: '', viaTunnel: false, chartSummary: '', token: '', consent: false, busy: false, error: '', analysis: null, topics: ['性格','事业','财运','婚姻','流年'] },
  onShow() {
    this._active = true;
    const app = getApp(), request = app.globalData.currentRequest;
    const next = fingerprint(request), changed = next !== this._fingerprint;
    this._fingerprint = next;
    const ready = Boolean(request && app.globalData.currentResult);
    this.setData({ hasChart: ready, configured: Boolean(baseUrl() && PROVIDERS[config.aiProvider]), providerName: PROVIDERS[config.aiProvider] || '', viaTunnel: /^https:\/\/[^/]+\.trycloudflare\.com(?:\/|$)/i.test(baseUrl()), chartSummary: ready ? request.birth.date + ' · ' + BRANCHES[request.birth.hour] + '时' + (request.birth.lateZi ? '（晚子）' : '') + ' · ' + (request.birth.gender === 'male' ? '男' : '女') + ' · ' + request.year + ' 流年' : '', ...(changed || !ready ? { analysis: null, token: '', consent: false, error: '' } : {}) });
  },
  onHide() { this._active = false; this.cancelRequest(); this.setData({ token: '', consent: false, busy: false }); },
  onUnload() { this._active = false; this.cancelRequest(); },
  cancelRequest() { this._revision = (this._revision || 0) + 1; const task = this._task; this._task = null; if (task && typeof task.abort === 'function') task.abort(); },
  isCurrent(revision, requestFingerprint) { return this._active && revision === this._revision && requestFingerprint === fingerprint(getApp().globalData.currentRequest); },
  onTokenInput(event) { this.setData({ token: String(event.detail.value || '') }); },
  onConsentChange(event) { this.setData({ consent: (event.detail.value || []).indexOf('consent') !== -1 }); },
  onStart() { wx.switchTab({ url: '/pages/index/index' }); },
  onInterpret() {
    if (this.data.busy) return;
    const app = getApp(), request = app.globalData.currentRequest;
    if (!request || !app.globalData.currentResult) { this.setData({ error: '请先排一张命盘。' }); return; }
    const base = baseUrl();
    if (!base || !PROVIDERS[config.aiProvider]) { this.setData({ error: 'AI 服务尚未配置。请先配置 HTTPS 服务端地址；本机排盘与历史仍可使用。' }); return; }
    if (!this.data.consent) { this.setData({ error: '请先同意发送本次命盘数据。' }); return; }
    const token = this.data.token.trim();
    if (!token) { this.setData({ error: '请输入部署者提供的 AI 访问口令，不是模型 API Key。' }); return; }
    this.cancelRequest();
    const revision = this._revision, requestFingerprint = fingerprint(request);
    this.setData({ busy: true, error: '', analysis: null });
    try {
      this._task = wx.request({
        url: base + '/api/interpret', method: 'POST', timeout: 55000,
        header: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        data: { birth: { date: request.birth.date, hour: request.birth.hour, gender: request.birth.gender, lateZi: request.birth.lateZi }, year: request.year, consent: true, provider: config.aiProvider },
        success: response => {
          if (!this.isCurrent(revision, requestFingerprint)) return;
          const body = responseBody(response.data);
          if (response.statusCode < 200 || response.statusCode >= 300) { this.setData({ error: body && typeof body.error === 'string' && body.error.length <= 500 ? body.error : 'AI 服务暂时不可用，请稍后重试。' }); return; }
          try { this.setData({ analysis: parseInterpretation(body), error: '' }); }
          catch (_) { this.setData({ error: 'AI 未返回完整的五项解读，请稍后重试。' }); }
        },
        fail: failure => {
          if (!this.isCurrent(revision, requestFingerprint)) return;
          const timedOut = failure && typeof failure.errMsg === 'string' && /timeout/i.test(failure.errMsg);
          this.setData({ error: timedOut ? 'AI 解读等待超时，请稍后重试。' : '连接 AI 服务失败，请检查网络和小程序的合法请求域名配置。' });
        },
        complete: () => { if (!this.isCurrent(revision, requestFingerprint)) return; this._task = null; this.setData({ busy: false }); },
      });
    } catch (_) { if (this.isCurrent(revision, requestFingerprint)) { this._task = null; this.setData({ busy: false, error: 'AI 服务请求未能发出，请检查服务端地址和网络。' }); } }
  },
});
