# 紫微 · 观星：微信原生小程序

四个标签为排盘、命盘、AI 解读、历史。排盘与历史在设备本机运行；已提供编译好的 `utils/chart-engine.js`，不需要在客户端构建 npm。

## 微信云开发（当前方案）

在仓库根目录运行：

```bash
npm ci
npm ci --prefix cloudfunctions/interpret --ignore-scripts
npm run export:wechat-cloudbase
```

在微信开发者工具导入生成的 `dist/wechat-cloudbase`，或导入仓库根目录。云开发需要同时包含 `miniprogram/` 与 `cloudfunctions/` 的标准项目，不能只导入当前客户端目录。重复导出时通过 `--out 新目录` 指定新位置，避免覆盖个人配置。

源码的 AppID 为 `touristappid`，云环境 ID 留空。只在个人副本填正式 AppID 和云环境 ID，不提交个人配置。小程序通过微信内部通道调用 `interpret` 云函数，保留合法域名与证书校验；云函数校验微信提供的身份，默认只允许本人名单内测。手机不需要输入模型 Key 或共享口令。

智谱 Key 及内部访问口令只放在云函数环境变量。云端开通、套餐费用、密钥上传与实际手机 AI 调用，须分别确认和验证，不能把本地测试通过当作云端已上线。完整步骤见[仓库的微信云开发说明](https://github.com/liuwenbin1996-create/ziwei-doushu/blob/feat/wechat-miniprogram-preview/docs/WECHAT_CLOUDBASE.md)。

## 离线兼容与 HTTPS 后端

只想查看离线排盘时，可继续单独导入本目录。游客身份不能代替正式小程序账号和云开发权限。

已配置公开 HTTPS 后端的部署者可显式将 `config.js` 的 `aiTransport` 改成 `https`，填写 `apiBaseUrl`，并保持 `aiProvider` 与服务端一致。此方式仍使用单独访问口令，离页清空；不得填写模型 API Key。微信必须允许该请求域名。

```bash
npm run test:miniprogram
npm run test:cloudbase
```

自动测试不调用真实模型。手机排盘已得到用户确认，手机云开发 AI 尚未完成验收；未上传审核或公开发布。

分发时保留 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。引擎复用许可允许的 MIT 代码与日历依赖，不加载受非商业许可限制的课程原话或商业断语库。
