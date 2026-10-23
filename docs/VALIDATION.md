# 本机验证记录

日期：2026-10-22。Node.js 22.22.1，Next.js 16.3.8。

- npm install / 锁文件更新：完成。
- npm run typecheck：通过。
- npm test：上游全部回归通过，含 768 个命盘完整性采样及日期/时辰/四化回归。
- npm run test:mobile：23 项通过，0 失败；所有 AI 请求均为模拟，不产生 API 费用。
- npm run build：生产编译、类型检查、39 个静态页面生成均通过。旧演示/知识路由配置为跳转到新主页。
- npm audit --registry=https://registry.npmjs.org：0 项漏洞（包括开发依赖）。
- git diff --check：通过。真实 .env 文件由 .gitignore 排除。

## 实际浏览器检查

在 390×844 手机视口中检查：首页、十二宫排盘、主辅星四化、所选宫位详情、大限视图四个运限四化标记、历史保存及确认删除、AI 未配置错误。页面宽度 375px（扣除滚动条），body.scrollWidth=375，无横向溢出。生产预览控制台无 error/warn。桌面页面也已目视检查。测试出生信息为合成示例，不是用户本人资料。

## 生产 HTTP 验收

首页、隐私、条款、许可、manifest、sw.js 和 PNG 图标均 200；排盘 API 返回 12 宫且 Cache-Control:no-store；AI 无配置返回 503 及中文提示；跨站请求返回403；旧 /chart 返回307。

## 限制

没有调用真实 OpenAI API，未验证账户模型权限、余额、网络或真实解读效果。没有实体 iPhone Safari 主屏幕安装验收。PWA manifest/图标通过 HTTP 检查；离线与缓存行为通过 Node VM 回归，未把此结果当作实体设备安装成功。没有执行 Vercel 公网部署。

2026-10-23：代码已发布到 [个人 Fork](https://github.com/liuwenbin1996-create/ziwei-doushu)，并创建 [PR #1](https://github.com/liuwenbin1996-create/ziwei-doushu/pull/1)。首版提交的两项 GitHub 自动检查已通过。部署前进一步将 package.json 与锁文件的 Node 版本固定为 22.x，保持与已验证环境一致。公网部署状态以实际部署结果为准。

## 微信原生本机版（2026-10-23）

- Node 22.22.1；esbuild 0.28.2；Next.js 升至 16.4.3，修复 npm 官方审计新报告的 Next.js 漏洞。安装后的 npm audit 为 0 项漏洞。
- `npm run build:miniprogram`：独立 CommonJS 引擎生成成功，873460 字节，无外部模块依赖，已提交生成文件供直接导入。六个实际打包依赖及额外许可通知随项目保留。
- `npm run test:miniprogram`：20 项通过，涵盖去除 Intl / Node / 浏览器全局变量的 VM 排盘、网页结果一致性、日期边界、晚子时、四化、大限流年、原生页面逻辑、存储与模拟 AI 请求。没有真实 OpenAI 调用或费用。
- `npm run typecheck`：通过。
- `npm test` 原全部回归与 `npm run test:mobile` 23 项通过。
- `npm run build -- --webpack`：生产编译、类型检查、39 个静态页面生成通过。默认 Turbopack 在当前宿主因创建本机端口 EPERM 失败，提权重试仍失败；改用 Next.js 官方支持的 Webpack 构建完成验证。未据此声称默认 Turbopack 已在本机通过。
- 测试脚本采用 `node --import tsx`，避免 tsx CLI 为测试额外创建 IPC 监听端口。

当前电脑没有微信开发者工具。官方下载页的自动读取失败，电脑界面访问也被工具安全策略终止，已停止相关操作。**未进行微信开发者工具真实编译、WXSS 视觉验收、手机扫码预览、真机调试或上传审核。** `touristappid` 是本机开发占位，不代表账号或真实手机预览能力。AI 默认未配置；Vercel 尚未部署。导入步骤与后续配置见 [WECHAT_PREVIEW.md](WECHAT_PREVIEW.md)。
