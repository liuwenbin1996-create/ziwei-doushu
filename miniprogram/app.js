const engine = require('./utils/chart-engine');
const config = require('./config');

App({
  globalData: { currentRequest: null, currentResult: null, cloudReady: false, cloudError: '' },
  onLaunch() {
    this.globalData.cloudReady = false;
    this.globalData.cloudError = '';
    if ((config.aiTransport || 'cloudbase') !== 'cloudbase') return;
    const env = typeof config.cloudEnvId === 'string' ? config.cloudEnvId.trim() : '';
    if (!env) {
      this.globalData.cloudError = 'AI 云开发暂未配置，请由部署者填写环境并部署云函数。排盘与历史仍可本机使用。';
      return;
    }
    if (!wx.cloud || typeof wx.cloud.init !== 'function') {
      this.globalData.cloudError = '当前微信环境不支持云开发，请更新微信或检查开发者工具基础库。';
      return;
    }
    const failed = () => {
      this.globalData.cloudReady = false;
      this.globalData.cloudError = '云开发初始化失败，请由部署者检查环境配置和当前微信基础库。';
    };
    try {
      const initialized = wx.cloud.init({ env, traceUser: false });
      if (initialized && typeof initialized.then === 'function') {
        this.cloudInitialization = Promise.resolve(initialized).then(() => {
          this.globalData.cloudReady = true;
          this.globalData.cloudError = '';
        }, failed);
      } else {
        this.globalData.cloudReady = true;
      }
    } catch (_) { failed(); }
  },
  subscribeCurrentRequest(listener) {
    this._requestListeners = this._requestListeners || [];
    this._requestListeners.push(listener);
    return () => { this._requestListeners = this._requestListeners.filter(item => item !== listener); };
  },
  setCurrentRequest(request) {
    const result = engine.createMobileChart(request);
    this.globalData.currentRequest = result.input;
    this.globalData.currentResult = result;
    (this._requestListeners || []).slice().forEach(listener => {
      try { listener(); } catch (_) { /* A view failure must not discard a valid local chart. */ }
    });
    return result;
  },
});
