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
