# 微信小程序本机预览

已提供四个微信原生页面：排盘、命盘、AI 解读、历史。排盘和历史在本机运行，不依赖 Vercel，不需要 OpenAI Key。当前已完成引擎打包与自动测试；尚未安装微信开发者工具，未在其模拟器中实际编译，也未做手机预览或发布。

## 如何打开

1. 从[微信开发者工具官方页](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)下载适合 Apple 芯片 Mac 的版本。本机是 arm64；安装包与系统要求以官网为准。
2. 打开工具，导入 `/Users/mac/Desktop/ziwei-doushu/miniprogram`。不要选择上层 Next.js 仓库。
3. 配置中的 `touristappid` 是游客占位，不是真实 AppID。如果工具提供游客或“不使用 AppID”入口，选择该入口；若要求微信扫码登录，由你自行完成。
4. 点击“编译”，查看电脑模拟器中的四个标签。

本次工具访问官方下载页受限，已停止自动操作；没有核实当前游客入口名称及能力。如果当前版本不提供无 AppID 导入，应停在该步骤核对，不要填写他人的 AppID。无真实 AppID 时，不承诺手机二维码预览、真机调试或上传可用。登录开发者工具也不等于已注册小程序。

目录已包含编译好的 `utils/chart-engine.js`。首次导入无需在工具里“构建 npm”，也无需在 `miniprogram` 中安装 npm 包。包内包含完整第三方许可通知，不包含 API Key。

## 试用顺序

- 在“排盘”修改默认示例的公历日期、时辰、性别，点击“开始排盘”。晚子时 23:00–23:59 按次日排盘，闰月分前后半月，流年在农历正月初一换年。
- 在“命盘”查看十二宫、主辅星和四化；切换本命、大限、流年，点击宫位查看全部星曜。
- 点击“保存命盘到本机”，到“历史”重新载入或确认删除。最多保留 20 张；不同于 Safari 网页历史，不自动跨设备同步。
- “AI 解读”默认显示尚未连接服务，不生成虚假的解读。

## AI 后端配置

当前 Vercel 尚未部署，真实 AI 请求未验证。要启用 AI，先按[部署说明](MOBILE_DEPLOY.md)部署本仓库后端，在服务端设置 `OPENAI_API_KEY`、`AI_ACCESS_TOKEN`；`OPENAI_MODEL` 可选。然后在 `miniprogram/config.js` 的 `apiBaseUrl` 填公开 HTTPS 网站地址。

**不要将 OpenAI API Key 写入小程序源码、配置或请求参数。** 页面中的访问口令是部署者提供的测试口令，只保留在当前页面内存，离页清空。用户明确同意后，小程序将出生信息发送给后端重新排盘；后端把必要的命盘结构发送给 OpenAI。历史不保存 AI 回答或口令。

使用真实 AppID 时，还需要在官方后台配置合法请求域名，分别验证手机网络与 API 访问。不要用关闭域名或证书校验的方式替代正式配置。

## 开发与验证

在仓库根目录执行：

```bash
npm ci
npm run build:miniprogram
npm run test:miniprogram
npm run typecheck
```

`test:miniprogram` 会重新打包，再运行 `tests/miniprogram*.test.ts`。当前 20 项通过，覆盖无 Intl / Node / 浏览器全局变量的引擎执行、与网页版排盘结果比对、晚子跨年、四化、大限流年、历史损坏保护，以及模拟的 AI 成功、超时与旧响应隔离。没有真实调用 OpenAI。

引擎采用 CommonJS 独立包，无外部模块依赖，当前约 853 KiB。领域源码位于 `miniprogram/src/engine.ts` 和共享 `lib/`，修改后须重新打包。开发者工具的 `project.private.config.json` 已加入 Git 忽略。

自动测试不能代替微信模拟器编译、WXSS 视觉验收或手机验证；这些步骤仍待完成。详细运行记录见 [VALIDATION.md](VALIDATION.md)。

## 许可与后续发布

复用 MIT 排盘代码及其日历依赖，完整通知随项目保存在 `miniprogram/LICENSE` 和 `miniprogram/THIRD_PARTY_NOTICES.md`。没有加载受非商业许可限制的《天纪》原话、Releases 解读数据集或上游商业断语库。详见[许可审查](LICENSE_REVIEW.md)。

本轮只准备本机开发版本。正式上传前需使用本人真实 AppID，核对最新官方运营规范、服务类目及实际功能是否适用。本次未取得明确对应紫微/预测类功能的可读取官方条文，不承诺审核结果；“传统文化”标签不能替代审核。

核查日期：2026-10-23。[官方快速开始](https://developers.weixin.qq.com/miniprogram/dev/framework/quickstart/)、[网络能力](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)、[产品规范入口](https://developers.weixin.qq.com/miniprogram/product/)均为官方查询入口，本次未成功读取正文，不能把提供链接视作当前规则已核实。
