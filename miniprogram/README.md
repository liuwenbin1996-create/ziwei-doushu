# 紫微 · 观星：微信小程序本机版

导入本目录到“微信开发者工具”，不要选择上层 Next.js 仓库。四个标签为排盘、命盘、AI 解读、历史；排盘和历史在本机运行。

项目已经包含 `utils/chart-engine.js`，导入后无需“构建 npm”。`touristappid` 是游客占位。已在 Stable 2.02.2608080 的“游客模式”中导入，选择“不使用云服务”即可在本机模拟器运行。

已完成微信开发者工具内真实编译和 iPhone 模拟器的四页验收，20 项自动测试通过。游客项目禁用手机预览；改用工具提供的“测试号”后已生成预览码，用户扫码反馈手机能打开并排盘。测试号仅保存在桌面副本中，没有提交个人 AppID。未上传发布，AI 后端未配置，没有调用真实 OpenAI。

要在手机预览，登录开发者工具，在新建小程序页面点击 AppID 旁的“测试号”，再将已有项目“详情 → 基本信息”中的 AppID 改为工具实际提供的值。编译后点击“预览”并用手机微信扫码。测试号仍不能直接正式上传，详细步骤见下方仓库文档。

开发修改后，在上层仓库根目录运行：

```bash
npm ci
npm run build:miniprogram
npm run test:miniprogram
```

AI 需要公开 HTTPS 后端地址，填写在 `config.js` 的 `apiBaseUrl`。国内方案在后端配置 `AI_PROVIDER=zhipu`、`ZHIPU_API_KEY` 和 `AI_ACCESS_TOKEN`，使用当前免费定价的 `glm-4.7-flash`；`config.js` 的 `aiProvider` 须与后端一致。模型 Key 只放后端环境变量，不能写进本目录。免费模型仍需本人账号与 Key，受平台限流和当期政策约束，不自动改用收费模型。页面输入的私有访问口令离页清空，不进入历史。

完整导入与部署说明见 [仓库文档](https://github.com/liuwenbin1996-create/ziwei-doushu/blob/feat/wechat-miniprogram-preview/docs/WECHAT_PREVIEW.md)。源码测试不能代替微信模拟器和手机验证。后续使用真实 AppID 时需核对网络配置、服务类目与平台审核要求，本轮没有上传或发布。

分发时保留 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。引擎使用 MIT 代码与日历依赖，未加载受非商业许可限制的课程原话或商业断语库。
