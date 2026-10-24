// 这里只填写公开的连接配置。不要放入模型 Key、共享口令或个人 OPENID。
// cloudbase 为默认方式；先由部署者开通环境、部署 interpret 云函数和配置本人内测名单。
// 旧 HTTPS 后端仅在显式选择 aiTransport: 'https' 时使用，访问口令由页面临时输入。
module.exports = {
  aiTransport: 'cloudbase',
  cloudEnvId: '',
  cloudFunctionName: 'interpret',
  apiBaseUrl: '',
  aiProvider: 'zhipu',
};
