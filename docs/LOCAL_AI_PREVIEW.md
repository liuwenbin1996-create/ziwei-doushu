# 电脑运行 AI，手机临时预览

当前采用本机服务端加 Cloudflare Quick Tunnel，不需要 Vercel，也无需购买服务器。电脑、API 进程和通道进程都要保持运行；临时地址重启后会变，不用于正式上线。

## 1. 本机服务端

使用 Node.js 22.x，安装依赖，并按 `.env.example` 创建被 Git 忽略的 `.env.local`：

```dotenv
AI_PROVIDER=zhipu
ZHIPU_API_KEY=仅在本机填写你自己的标准API密钥
ZHIPU_MODEL=glm-4-flash-250414
AI_ACCESS_TOKEN=自己生成的随机访问口令
```

示例配置选择已通过合成命盘真实请求的免费型号。代码只允许 `glm-4.7-flash` / `glm-4-flash-250414`，不会自动改用收费模型。免费定价仍以智谱当期政策为准，可能限流。访问口令与模型密钥不同，不要把模型 Key 填入手机页面。

```bash
npm ci
npm run preview:ai
```

服务仅监听 `127.0.0.1:3101`。`GET /health` 返回不含个人资料的状态；`POST /api/interpret` 必须有有效访问口令。其他路径 404，错误方法 405，出生信息请求限制 16 KiB；不开放源码、环境文件或网页其它路由。

## 2. 临时 HTTPS 通道

安装 [Cloudflare 官方 cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)，另开终端：

```bash
cloudflared tunnel --url http://127.0.0.1:3101 --no-autoupdate --protocol http2
```

工具生成随机 HTTPS 地址。启动前须明确同意：手机提交的出生信息、访问口令及返回的解读会经 Cloudflare 转发；模型 API Key 不经过这条通道，仍只由本机调用智谱。只对本人临时试用，不分享访问口令。

Quick Tunnel 当前免费、无需 Cloudflare 账号或自有域名，没有可用性保证，最多 200 个处理中请求，不支持 SSE，进程停止地址失效。邮箱认证不能直接用于 `wx.request`，本应用保留自己的 Bearer 口令。[官方限制](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

## 3. 小程序连接

在本机导入的副本 `config.js` 中填写实际生成的 HTTPS 地址，保持 `aiProvider: 'zhipu'`。重新编译并生成新的手机预览码。仓库默认地址留空，个人测试 AppID、真实密钥和二维码不提交。

手机先排盘，到 AI 页确认服务商及 Cloudflare 转发说明，输入部署者提供的 **AI 访问口令**，主动同意后请求解读。约 20–45 秒；拥堵、超时、事实引用错误或不完整回答会提示失败，不显示伪造的成功内容。

本轮已获用户明确授权并启动通道，公网真实解读约 19.9 秒返回五主题。但当前微信开发工具在开启校验时实测提示 `url not in domain list`，不能将公网 API 成功当作手机成功。正式使用需要在微信后台为真实 AppID 配置合规 HTTPS 请求域名；测试模式不能替代正式配置。

用户随后选择保持校验，等待注册正式小程序账号。本次临时通道及本机 API 进程已关闭，桌面预览副本清空失效的临时地址；本机环境文件保留。完成账号与合法域名配置后，再启动服务并进行手机 AI 验收。

## 数据及验证边界

只有主动请求解读才传输出生信息。本机重新排盘后，把必要的盘面线索发给智谱；不发送公历生日、姓名或地点。事实栏必须逐字对应排盘引擎，解释和建议仍可能有理解偏差，不能称为全部语义已验证。

本机密钥配置、免费 API 的真实合成样例和手机调用是三项独立检查，最终结果见 [VALIDATION.md](VALIDATION.md)。
