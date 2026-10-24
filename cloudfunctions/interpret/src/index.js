// 只使用平台 SDK 的身份上下文；event.userInfo/openid 均不作凭证。
const cloud = require('wx-server-sdk');
const { handleCloudInterpret } = require('../../../lib/mobile/cloudbase');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
exports.main = async (event) => handleCloudInterpret(event, {
  getWXContext: () => cloud.getWXContext(),
});
