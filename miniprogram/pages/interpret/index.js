const config = require('../../config');
const { parseInterpretation } = require('../../utils/chart-engine');
const PROVIDERS = { zhipu: '智谱 BigModel', openai: 'OpenAI' };
const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const fingerprint = request => request ? JSON.stringify(request) : '';
function baseUrl() {
  const base = typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl.trim().replace(/\/+$/, '') : '';
  return /^https:\/\/[^\/?#\s@]+(?:\/[^?#\s]*)?$/i.test(base) ? base : '';
}
function responseBody(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}
function transportState(app) {
  const transport = config.aiTransport || 'cloudbase';
  const isCloud = transport === 'cloudbase';
  const providerName = PROVIDERS[config.aiProvider] || '';
  const env = typeof config.cloudEnvId === 'string' ? config.cloudEnvId.trim() : '';
  const name = typeof config.cloudFunctionName === 'string' ? config.cloudFunctionName.trim() : 'interpret';
  let error = '';
  if (!providerName) error = 'AI 服务商配置有误，请联系部署者检查。';
  else if (isCloud) {
    if (!env || !name) error = 'AI 云开发暂未配置，请由部署者填写环境并部署云函数。排盘与历史仍可本机使用。';
    else if (app.globalData.cloudError) error = app.globalData.cloudError;
    else if (!app.globalData.cloudReady) error = '云开发尚未初始化，请稍后重新打开此页面或联系部署者。';
    else if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') error = '当前微信环境不支持调用云函数，请更新微信或检查基础库。';
  } else if (transport === 'https') {
    if (!baseUrl()) error = 'HTTPS AI 服务暂未配置，当前仍可本机排盘和保存历史。';
  } else error = 'AI 连接方式配置有误，请联系部署者检查。';
  return { transport, isCloud, providerName, env, name, configured: !error, error };
}
Page({
  data: {
    hasChart: false, configured: false, isCloud: true, providerName: '', viaTunnel: false,
    configurationError: '', chartSummary: '', token: '', consent: false, busy: false,
    identityBusy: false, openid: '', error: '', analysis: null,
    topics: ['性格','事业','财运','婚姻','流年'],
  },
  onShow() {
    this._active = true;
    const app = getApp();
    if (this._unsubscribe) this._unsubscribe();
    this._unsubscribe = typeof app.subscribeCurrentRequest === 'function' ? app.subscribeCurrentRequest(() => {
      if (!this._active) return;
      this.cancelRequest();
      this.syncView();
    }) : null;
    this.syncView();
    if (app.cloudInitialization && typeof app.cloudInitialization.then === 'function') {
      app.cloudInitialization.then(() => { if (this._active) this.syncView(); });
    }
  },
  syncView() {
    const app = getApp(), request = app.globalData.currentRequest;
    const next = fingerprint(request), changed = next !== this._fingerprint;
    this._fingerprint = next;
    const ready = Boolean(request && app.globalData.currentResult);
    const state = transportState(app);
    this.setData({
      hasChart: ready, configured: state.configured, isCloud: state.isCloud,
      providerName: state.providerName, configurationError: state.error,
      viaTunnel: !state.isCloud && /^https:\/\/[^/]+\.trycloudflare\.com(?:\/|$)/i.test(baseUrl()),
      chartSummary: ready ? request.birth.date + ' · ' + BRANCHES[request.birth.hour] + '时' + (request.birth.lateZi ? '（晚子）' : '') + ' · ' + (request.birth.gender === 'male' ? '男' : '女') + ' · ' + request.year + ' 流年' : '',
      ...(changed || !ready ? { analysis: null, token: '', consent: false, openid: '', error: '' } : {}),
    });
  },
  onHide() {
    this._active = false;
    if (this._unsubscribe) this._unsubscribe();
    this._unsubscribe = null;
    this.cancelRequest();
    this.setData({ token: '', consent: false, openid: '' });
  },
  onUnload() {
    this._active = false;
    if (this._unsubscribe) this._unsubscribe();
    this._unsubscribe = null;
    this.cancelRequest(false);
    Object.assign(this.data, { token: '', consent: false, openid: '', busy: false, identityBusy: false });
  },
  cancelRequest(update = true) {
    this._revision = (this._revision || 0) + 1;
    if (this._timer !== undefined && this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
    const task = this._task;
    this._task = null;
    if (task && typeof task.abort === 'function') task.abort();
    if (update) this.setData({ busy: false, identityBusy: false });
  },
  isCurrent(revision, requestFingerprint) {
    if (!this._active || revision !== this._revision) return false;
    if (requestFingerprint !== fingerprint(getApp().globalData.currentRequest)) {
      this.cancelRequest();
      this.syncView();
      return false;
    }
    return true;
  },
  finishWaiting(revision, requestFingerprint) {
    if (!this.isCurrent(revision, requestFingerprint)) return;
    if (this._timer !== undefined && this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
    this._task = null;
    this.setData({ busy: false, identityBusy: false });
  },
  beginWaiting(kind, isCloud) {
    this.cancelRequest();
    const revision = this._revision, requestFingerprint = fingerprint(getApp().globalData.currentRequest);
    this.setData({ busy: kind === 'analysis', identityBusy: kind === 'identity', error: '', ...(kind === 'analysis' ? { analysis: null } : { openid: '' }) });
    this._timer = setTimeout(() => {
      if (!this.isCurrent(revision, requestFingerprint)) return;
      this.cancelRequest();
      this.setData({ error: isCloud ? '等待云端响应超时。本次仅取消等待，服务端可能继续处理，请勿连续重试。' : 'AI 解读等待超时，请稍后重试。' });
    }, 55000);
    return { revision, requestFingerprint };
  },
  acceptResult(statusCode, value, kind, revision, requestFingerprint) {
    if (!this.isCurrent(revision, requestFingerprint)) return;
    const body = responseBody(value);
    if (typeof statusCode !== 'number' || statusCode < 200 || statusCode >= 300) {
      this.setData({ error: body && typeof body.error === 'string' && body.error.length <= 500 ? body.error : 'AI 服务暂时不可用，请稍后重试。' });
      return;
    }
    if (kind === 'identity') {
      if (!body || typeof body.openid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.openid)) this.setData({ error: '未能取得当前微信身份，请联系部署者检查云函数。' });
      else this.setData({ openid: body.openid, error: '' });
      return;
    }
    try { this.setData({ analysis: parseInterpretation(body), error: '' }); }
    catch (_) { this.setData({ error: 'AI 未返回完整的五项解读，请稍后重试。' }); }
  },
  callCloud(data, kind, state) {
    const wait = this.beginWaiting(kind, true);
    try {
      const response = wx.cloud.callFunction({ name: state.name, config: { env: state.env }, data });
      Promise.resolve(response).then(result => {
        if (this.isCurrent(wait.revision, wait.requestFingerprint)) {
          const envelope = result && result.result;
          this.acceptResult(envelope && envelope.statusCode, envelope && envelope.data, kind, wait.revision, wait.requestFingerprint);
        }
        this.finishWaiting(wait.revision, wait.requestFingerprint);
      }, () => {
        if (this.isCurrent(wait.revision, wait.requestFingerprint)) this.setData({ error: '调用云函数失败，请检查网络、云环境和内测配置；服务端可能仍在处理。' });
        this.finishWaiting(wait.revision, wait.requestFingerprint);
      });
    } catch (_) {
      if (this.isCurrent(wait.revision, wait.requestFingerprint)) this.setData({ error: '云函数请求未能发出，请联系部署者检查云环境。' });
      this.finishWaiting(wait.revision, wait.requestFingerprint);
    }
  },
  onTokenInput(event) { this.setData({ token: String(event.detail.value || '') }); },
  onConsentChange(event) { this.setData({ consent: (event.detail.value || []).indexOf('consent') !== -1 }); },
  onStart() { wx.switchTab({ url: '/pages/index/index' }); },
  onIdentity() {
    if (!this._active || this.data.busy || this.data.identityBusy) return;
    const state = transportState(getApp());
    if (!state.isCloud || !state.configured) { this.setData({ error: state.error || '仅云开发方式支持查询本人内测身份。' }); return; }
    this.callCloud({ action: 'identity' }, 'identity', state);
  },
  onInterpret() {
    if (!this._active || this.data.busy || this.data.identityBusy) return;
    const app = getApp(), request = app.globalData.currentRequest;
    if (!request || !app.globalData.currentResult) { this.setData({ error: '请先排一张命盘。' }); return; }
    const state = transportState(app);
    if (!state.configured) { this.setData({ error: state.error }); return; }
    if (!this.data.consent) { this.setData({ error: '请先同意发送本次命盘数据。' }); return; }
    const data = { birth: { date: request.birth.date, hour: request.birth.hour, gender: request.birth.gender, lateZi: request.birth.lateZi }, year: request.year, consent: true, provider: config.aiProvider };
    if (state.isCloud) { this.callCloud(data, 'analysis', state); return; }
    const token = this.data.token.trim();
    if (!token) { this.setData({ error: '请输入部署者提供的 AI 访问口令，不是模型 API Key。' }); return; }
    const wait = this.beginWaiting('analysis', false);
    try {
      this._task = wx.request({
        url: baseUrl() + '/api/interpret', method: 'POST', timeout: 55000,
        header: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, data,
        success: response => this.acceptResult(response.statusCode, response.data, 'analysis', wait.revision, wait.requestFingerprint),
        fail: failure => {
          if (!this.isCurrent(wait.revision, wait.requestFingerprint)) return;
          const message = failure && typeof failure.errMsg === 'string' ? failure.errMsg : '';
          this.setData({ error: /url not in domain list/i.test(message)
            ? '微信拦截了请求：服务地址未加入小程序合法请求域名。请联系部署者检查微信后台配置。'
            : /timeout/i.test(message) ? 'AI 解读等待超时，请稍后重试。'
              : '连接 AI 服务失败，请检查网络和小程序的合法请求域名配置。' });
        },
        complete: () => this.finishWaiting(wait.revision, wait.requestFingerprint),
      });
    } catch (_) {
      if (this.isCurrent(wait.revision, wait.requestFingerprint)) this.setData({ error: 'AI 服务请求未能发出，请检查服务端地址和网络。' });
      this.finishWaiting(wait.revision, wait.requestFingerprint);
    }
  },
});
