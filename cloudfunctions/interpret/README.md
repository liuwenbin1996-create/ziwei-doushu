# interpret 云函数源码与构建

生成的 index.js、LICENSE、THIRD_PARTY_NOTICES.md 由项目根目录的
`node scripts/build-cloudbase.mjs` 重建。云函数运行依赖锁在本目录 package-lock.json；
部署只需构建产物、package.json、package-lock.json 和许可证说明，不包含 src、node_modules、
任何 .env、个人 AppID 或云环境 ID。实际运行环境选 Node.js 22.21，超时时间建议 60 秒。

本云函数只调用 wx-server-sdk 的 init / getWXContext 获取平台身份。
固定覆盖 axios 0.34.0 和 @cloudbase/database 2.0.0 用于移除旧版传递依赖漏洞；
仅对真实 SDK 加载、init 和 getWXContext 做离线兼容验证，不调用数据库 API。
后续增加云数据库、云存储、微信 OpenAPI 等 SDK 功能前，必须重新核对覆盖版本的接口兼容性并实测。

不会在构建时读取或拷贝模型密钥。云端环境变量由部署者单独配置；名单为空时拒绝解读。
`action: identity` 只返回调用者自身 OPENID，不要求 AI 密钥或名单；此标识用于部署者建立试用名单，
不可从客户端自报的 userInfo/openid 建立授权。
