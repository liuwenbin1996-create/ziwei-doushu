# 紫微 · 观星：本地测试与 Vercel 部署

这是面向 iPhone Safari 的紫微斗数手机网页版。排盘与最多 20 条历史记录在本机处理；AI 解读由服务端调用 OpenAI。历史不跨设备同步；清除浏览器网站数据会同时清除历史。简体中文界面采用墨色与金色，图标为本项目原创几何星盘。

## 本地启动

使用 Node.js 22.x，在仓库根目录执行：

```bash
npm ci
npm run typecheck
npm test
npm run test:mobile
npm run build
npm start
```

打开 `http://localhost:3000`。只测试排盘无需任何密钥。日常开发可用 `npm run dev`，PWA Service Worker 仅在生产构建中注册，因此安装和离线测试要用 `npm run build` 加 `npm start`，或 Vercel HTTPS 预览。

## 开启 AI 解读

复制 `.env.example` 为 `.env.local`，只在本机填入实际值：

| 服务端变量 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | 你的 OpenAI 项目 API Key |
| `OPENAI_MODEL` | 可选，默认 `gpt-5.4-mini`；可改为项目有权限的、支持 Responses 与结构化输出的文本模型 |
| `AI_ACCESS_TOKEN` | 建议自行生成至少 24 字符的随机访问口令，限制个人测试版的 AI 调用 |

网页里的“AI 访问口令”填 `AI_ACCESS_TOKEN` 的值，不是 API Key。口令只提供给获准使用测试版的人。共享口令适合个人试用；正式开放服务需要接入用户认证、持久限流与用量配额。不要把真实密钥写进代码、URL、截图、日志或 GitHub。

上述三个变量都不能使用 `NEXT_PUBLIC_` 前缀。只有 `NEXT_PUBLIC_SITE_URL` 是公开的站点地址，用于元数据。修改环境变量后重启本地服务；Vercel 上修改后重新部署。OpenAI 建议将 API Key 存在服务端环境变量或密钥管理服务中，浏览器不应接触它。[OpenAI API 认证说明](https://developers.openai.com/api/reference/overview)

AI 请求前需要用户同意：出生信息和所选流年发送给本站服务端；服务端重新排盘，仅将结构化星曜、农历出生年、性别和所选流年/大限发送给 OpenAI（不发送公历生日、姓名或地点）；页面会给出文化参考提示。不要在浏览器输入 OpenAI API Key。真实调用可能产生你的 OpenAI 账户费用；构建和自动测试不需要真实密钥，也不证明实际账户、模型权限、余额或网络可用。

## Vercel 部署

1. 将分支或 Pull Request 合并到你可控制的 GitHub 仓库。
2. 在 Vercel 选择 **Add New → Project**，导入该仓库。
3. Framework Preset 选择 **Next.js**，Root Directory 保持仓库根目录；Node.js Version 选择 **22.x**。配置文件已指定 `npm ci` 安装、`npm run build` 构建，不设置静态导出目录。
4. 在 **Settings → Environment Variables** 添加上表三个服务端变量。只测试排盘可暂不配置 AI；AI 会提示服务未配置。Preview 和 Production 按需要分别设置，避免把生产密钥用于不受信任的 PR 预览。
5. 将 `NEXT_PUBLIC_SITE_URL` 设置为最终 HTTPS 域名；预览阶段可使用预览域名。
6. 点击 **Deploy**。每个已连接的 Git 分支/PR 可获得 Vercel Preview URL。正式域名可在项目的 Domains 中配置。
7. 在 iPhone Safari 打开 Vercel 给出的 HTTPS 地址，完成下面的验收。

`vercel.json` 为 AI 路由配置 60 秒函数上限，并让 API 响应使用 `no-store`。实际可用时长和额度由 Vercel 计划决定。Node.js 22 是 Vercel 当前支持的版本之一；依赖锁文件会随仓库提交。[Vercel Next.js 部署](https://vercel.com/docs/frameworks/full-stack/nextjs)、[Node.js 版本配置](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[环境变量](https://vercel.com/docs/environment-variables)

## iPhone 验收

| 操作 | 应看到的结果 |
| --- | --- |
| 选择出生年月日、时辰、性别后排盘 | 十二宫有清晰宫名、主辅星、四化；可查看大限与流年 |
| 切换性别、时辰和流年 | 排盘按新输入重算；选择宫位可以查看详情 |
| 输入不存在的日期、未来日期或范围外年份 | 表单给出可理解的错误，不生成错误命盘 |
| 保存、载入和删除历史 | 当前浏览器保留最多 20 条；单条删除需要确认；损坏数据可确认重置 |
| 未同意发送信息即申请 AI | 提示先同意，不发送分析请求 |
| 未配置密钥/口令，或口令错误 | 页面显示明确错误，不伪造 AI 解读 |
| 配置完成后用一个测试命盘请求 AI | 显示事业、财运、婚姻、性格、流年五部分；检查实际费用和错误提示 |
| Safari 分享 → 添加到主屏幕 | 显示“紫微观星”图标，主屏幕打开后为独立窗口 |

时辰序号为子 0、丑 1，直到亥 11；不是钟点 0–23。首版生日支持 1900–2100 且不得晚于今天。晚子时采用次日口径；闰月采用按日切分；紫微斗数流年以农历正月初一换年。不同流派的规则可能不同，应以页面口径说明和算法测试为准。

iPhone 没有通用的自动安装弹窗，需从 Safari 分享菜单手动添加。Safari 标签页与主屏幕应用的存储可能隔离，不要把两处历史不相同误认为丢失。安装图标本身不会备份历史。[PWA 在 iOS 上安装说明](https://web.dev/learn/pwa/installation)

## 离线边界与检查

本版本有 manifest、有效的 192/512 PNG 图标、180 PNG Apple Touch 图标和 Service Worker。首次成功联网加载并完成注册后，缓存独立的 `offline.html`、图标以及后续请求过的 Next 静态 JS/CSS/字体。不会预缓存首页、命盘页面、请求参数、任何 `/api/` 响应、AI 文本或访问口令；升级只清理 `ziwei-guanxing-` 前缀的旧缓存。

已打开页面中的客户端排盘可以继续操作；完整应用离线冷启动未保证。断网后刷新或重新打开，会显示专门的离线提示页。AI 始终需要联网。首次安装后若未完成 Service Worker 注册，离线页面也可能暂不可用。

在生产构建或 HTTPS 预览中：先联网打开，等待注册，再打开浏览器开发者工具查看 Application/Storage 的 manifest、Service Worker 和 Cache Storage；启用 Offline 后刷新，确认显示离线提示；检查 Cache Storage 中不存在 API、命盘 HTML 或带出生信息的请求。恢复网络后点击重试。Service Worker 要求 HTTPS，`localhost` 可供本机测试，普通局域网 HTTP 地址不具备同等条件。[Next.js PWA 指南](https://nextjs.org/docs/app/guides/progressive-web-apps)、[Service Worker 使用条件](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)

## 验证范围与后续迁移

`npm test` 运行保留的上游排盘回归；`npm run test:mobile` 覆盖新增输入校验、历史与 AI 边界/模拟错误；CI 在没有真实密钥时执行类型检查、两组测试和生产构建。自动测试不能代替实体 iPhone Safari 安装、实际 OpenAI 调用和公网 Vercel 部署。交付报告会分别说明哪些已运行，哪些还需你的环境完成。

后续迁移微信小程序时，复用纯 TypeScript 领域类型、输入校验、排盘适配与 HTTP 数据结构；将 Web DOM、CSS、localStorage、PWA 安装逻辑换成小程序页面、组件与存储 API。OpenAI 调用仍留在服务端，通过 HTTPS 接口提供给小程序，并按微信要求配置合法域名及适用的发布审核材料。小程序界面需要重写，不能直接把 Next.js 页面作为原生小程序运行。

许可范围和解读资料限制见 [LICENSE_REVIEW.md](./LICENSE_REVIEW.md)。

## 开发验证记录

生产构建已在 Node 22 本机通过；上游排盘回归通过，包含 768 个采样命盘。手机尺寸浏览器已检查 12 宫、四化切换、历史保存与删除、AI 未配置提示和横向溢出。完整 npm 官方依赖审查为 0 项漏洞。详情与测试数量以最终交付记录为准。

尚未使用真实 OpenAI Key 发起付费请求；尚未完成实体 iPhone Safari 主屏幕安装和 Vercel 公网部署。AI 费用、模型权限、网络与真实解读效果需部署者实际试用验证。
