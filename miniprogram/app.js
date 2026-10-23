const engine = require('./utils/chart-engine');

App({
  globalData: { currentRequest: null, currentResult: null },
  setCurrentRequest(request) {
    const result = engine.createMobileChart(request);
    this.globalData.currentRequest = result.input;
    this.globalData.currentResult = result;
    return result;
  },
});
