# 紫微 · 观星：iPhone 紫微斗数 AI

基于原项目 MIT 排盘引擎开发的 Next.js + TypeScript 手机网页版。

**运行与 Vercel 部署：[docs/MOBILE_DEPLOY.md](docs/MOBILE_DEPLOY.md)**

功能：十二宫、主辅星、生年/大限/流年四化、农历流年、本地命盘历史、OpenAI 服务端 AI 解读、PWA。

```bash
npm ci
npm test
npm run test:mobile
npm run typecheck
npm run build
npm start -- --hostname 0.0.0.0
```

不配置密钥也可排盘和保存历史。AI 需要服务端 OPENAI_API_KEY、OPENAI_MODEL、AI_ACCESS_TOKEN；配置见 `.env.example`。不要提交真实密钥。

[许可审查](docs/LICENSE_REVIEW.md) · [上游原 README](docs/UPSTREAM_README.md)。上游商业服务介绍不代表本版功能。传统文化参考，非科学预测。
