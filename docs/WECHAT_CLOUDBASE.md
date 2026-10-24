# 紫微·观星：微信云开发本人预览

当前准备的是代码和部署包，不是已经开通的云服务。本文的云端步骤尚未执行；没有上传智谱 Key，没有完成云函数部署，也没有据此验证手机 AI 成功。现有本机排盘与历史不受影响。

本方案使用微信原生 `wx.cloud.callFunction` 调用普通事件云函数 `interpret`，由云函数调用智谱。它不使用 Vercel，不依赖本机临时 HTTPS 通道，也不靠关闭合法域名或 TLS 校验来运行。前提是实际小程序 AppID 已获准关联到对应的微信云开发环境。[官方调用流程](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)

## 先明确授权和费用

你已授权准备代码。以下操作仍需在最终确认后再做：

- 使用本人微信/腾讯云账号开通或关联环境，确认地区、套餐、免费资格、到期时间、超限策略和可能费用。
- 把云函数代码上传至选定环境，并将智谱 API Key 配置到腾讯云函数环境变量中。这意味着腾讯云环境会接收并保管该 Key。
- 开始真实调用时，微信/腾讯云处理调用身份、出生信息和解读结果；智谱处理代码筛选出的命盘事实。需要先确认这一数据流与当前页面的同意文案。

腾讯云云函数、运行资源、网络和日志的计费，与智谱模型的免费资格是两回事。官方有体验与付费套餐及资源点计量规则；本说明不承诺永久免费，也不将过期活动当作当前权益。以本人账号的开通页、套餐用量页和订单确认页为准。若显示购买、自动续费、超限按量或升级付费，不要仅为完成演示就直接确认。[官方计费 FAQ](https://docs.cloudbase.net/quick-start/resource-point)

当前方案是**本人名单预览版**，不是公开生产服务。名单只是调用准入，不等于完整的配额、计费或公共用户管理系统。

## 1. 在本机构建可导入的标准目录

使用仓库约定的 Node.js 22，在仓库根目录执行：

```bash
npm ci
npm ci --prefix cloudfunctions/interpret --ignore-scripts
npm run export:wechat-cloudbase
```

第二条命令按云函数自己的锁文件安装 `wx-server-sdk` 运行依赖，构建脚本会收集实际可获得的许可证文本，并明确记录指定版本缺少文本的外部依赖，不要省略安装。生成通知文件不等于所有运行依赖的授权已经确认。

导出目录为 `dist/wechat-cloudbase`。为避免覆盖个人配置，脚本会拒绝已经存在的目标目录。再次导出应指定一个新的空路径，例如：

```bash
npm run export:wechat-cloudbase -- --out dist/wechat-cloudbase-new
```

不要为了重新导出而删除已配置的个人副本。仅需重新生成云函数时执行：

```bash
npm run build:cloudbase
```

标准布局为：

```text
dist/wechat-cloudbase/
├── project.config.json
├── miniprogram/
│   └── config.js
└── cloudfunctions/
    └── interpret/
        ├── index.js
        ├── package.json
        ├── package-lock.json
        ├── LICENSE
        └── THIRD_PARTY_NOTICES.md
```

`index.js` 是打包好的函数入口；连同 package、锁文件、`LICENSE` 和 `THIRD_PARTY_NOTICES.md` 一起部署，不要只复制入口代码。打包进入入口的排盘代码及已核实依赖保留对应许可；受非商业限制的课程原话和上游商业断语库不进入新函数。`wx-server-sdk` 及其运行依赖保持外部引用，导出目录不包含其 `node_modules` 或源码，由云端按锁文件安装；这一安排不等于免除或确认其许可要求。

**云 SDK 许可仍有未确认项。** 截至 2026-10-24，本地 `@cloudbase/node-sdk@3.17.2` 仅在 package 中声明 MIT、未随包提供许可证文本；其 [声明的官方仓库](https://github.com/TencentCloudBase/node-sdk) 也未找到可与该版本对应的许可证文本或标签。`@cloudbase/signature-nodejs@2.2.0` 与 `@cloudbase/wx-cloud-client-sdk@1.7.1` 未随包提供许可字段或许可证文本，尚未从对应版本的官方来源补证。不能以同属腾讯、上层 SDK 的 MIT，或其它版本的声明代替这些包自身的授权。构建通知还可能列出其它明确的外部文本缺项，应逐项保留；实际云端安装、公开分发或商业使用前，需向维护方核实缺项。本文不宣称第三方授权已全部审完。

导出源码保持空云环境 ID、`touristappid` 占位，不包含本人 AppID、OpenID、名单或密钥。个人调试使用单独的桌面副本“紫微观星-云开发预览”，不要把该副本的个人配置提交 Git。

## 2. 导入正确的项目根目录

在微信开发者工具中导入 `dist/wechat-cloudbase`，或导入本仓库根目录。云函数方案应使用包含根 `project.config.json` 的标准布局：

- `miniprogramRoot: 'miniprogram/'`
- `cloudfunctionRoot: 'cloudfunctions/'`

旧版只导入 `miniprogram` 单目录的方式仍可用于离线排盘预览，但不作为本次云函数部署入口。不要假定导出目录或桌面副本已经导入工具。

在个人副本中使用本人有权限、能与目标环境关联的小程序 AppID。`touristappid` 不是可部署云开发的真实身份。现有测试号是否具备开通/关联云开发的资格尚未验证；若官方界面不支持，应停在此步核对账号资格，不借用他人的 AppID，也不改动域名或 TLS 校验来替代云权限。

## 3. 在确认后创建或选择环境

通过微信开发者工具的云开发入口，或官方 CloudBase 控制台，使用本人账号选择环境。先核对套餐及可能费用，再创建；已有合适环境时先核对归属和权限，不重复开通。

在环境配置的安全配置/小程序关联入口，关联个人副本所使用的 AppID；记录该环境的完整环境 ID。名字相同不代表环境 ID 相同。关联与 `wx.cloud.init` 使用的环境必须一致，否则可能出现“非法的 env”或调用权限错误。[官方关联说明](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)

这一步不代表函数已部署，也不代表测试号、云环境和手机之间的调用链已验证。

## 4. 创建并部署普通 Event 函数

在目标环境创建或部署函数，设置：

| 项目 | 本项目设置 |
| --- | --- |
| 函数名 | `interpret` |
| 函数类型 | 普通事件函数 `Event`，不是 HTTP 云函数 |
| 入口 | `index.main` |
| 运行环境 | `Nodejs22.21`，或 `Nodejs24.11` |
| 函数超时 | 明确设置为 **60 秒** |
| 模型请求超时 | 代码内 **45 秒** |
| 调用方式 | 小程序 `wx.cloud.callFunction` |

官方当前普通云函数运行时列表包含 Node.js 22.21 和 24.11；不要照旧教程直接使用较旧默认版本。如果账号或地区的控制台未提供这些运行时，先核对支持情况，不在没有验证的情况下改用旧版本。[官方运行环境](https://docs.cloudbase.net/cloud-function/runtime-support)

只上传 `cloudfunctions/interpret` 这个函数目录。可在开发者工具中对该目录选择“上传并部署：云端安装依赖”，也可将函数目录的**内容**打成 ZIP，在控制台上传；ZIP 根目录应直接有 `index.js`、package 和锁文件，而不是再套一层 `interpret` 文件夹。保持同包的 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`；通知会区分已收集文本与尚未确认的外部 SDK 缺项。[官方部署说明](https://docs.cloudbase.net/cloud-function/manage)

不要上传整个仓库、Next.js 构建目录、`.git`、`.env`、`.env.local` 或个人资料。密钥不放入代码包；部署前检查压缩包的实际文件清单。不要建立 HTTP 网关、公开访问地址或额外触发器来替代普通事件调用。

函数超时与环境变量在云端函数配置中设置，保存后确认实际值；不要沿用平台默认的几秒超时。60 秒是本项目配置，不是免费额度。[官方函数配置项](https://docs.cloudbase.net/cli-v1/functions/configs)

## 5. 先取本人身份，再启用 AI

先在云端函数环境变量中设置 `WECHAT_APP_ID`，值为当前个人副本使用、且已关联该环境的实际 AppID。本人名单先保持为空；空名单不能开放 AI。

在个人副本的 `miniprogram/config.js` 中配置公开的调用目标：

```javascript
module.exports = {
  aiTransport: 'cloudbase',
  cloudEnvId: '这里填本人已确认的环境ID',
  cloudFunctionName: 'interpret',
  aiProvider: 'zhipu',
  apiBaseUrl: ''
};
```

环境 ID 和函数名不等于访问凭据。此文件不放智谱 Key、不放内部访问口令、不放允许访问者名单。重新编译个人副本后，在 AI 页点击“查看我的内测身份”，发起 `action: 'identity'`，只在本人界面查看当前微信调用者的 OpenID。

身份来自云函数的微信上下文，不接受客户端自行填写的 OpenID 作为授权依据。首次查询无需先发出 AI 请求；它不代表已经加入名单或模型已连通。把查到的本人 OpenID 填到云端 `AI_ALLOWED_OPENIDS`，名单按逗号分隔，初次只授权本人一项，不配置通配符。不要将 OpenID 发到聊天、写进源码或打印完整身份日志。

云函数从可信微信上下文取得 APPID/OPENID，再校验 AppID 与本人名单；更换 AppID 或微信账号后应重新核对身份，不能复用之前的假定。[官方身份传递说明](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)

## 6. 在云端配置模型与内部口令

确认本人名单无误，并已明确同意把智谱 Key 存入腾讯云环境后，在 **interpret 函数的云端环境变量**中填写：

| 变量 | 值与用途 |
| --- | --- |
| `AI_PROVIDER` | `zhipu` |
| `ZHIPU_MODEL` | `glm-4-flash-250414`，本次预览选择的已允许型号 |
| `ZHIPU_API_KEY` | 本人的智谱标准模型 API Key，只在云端设置 |
| `AI_ACCESS_TOKEN` | 由部署者生成的随机内部口令，仅供云函数内部复用服务逻辑，不交给小程序或用户输入 |
| `WECHAT_APP_ID` | 当前已关联环境的小程序 AppID |
| `AI_ALLOWED_OPENIDS` | 刚核对的本人 OpenID，初次仅一人；空名单拒绝 AI |

不要把本机 `.env.local` 整份上传来设置这些变量，也不要在控制台在线源码编辑器里写死密钥。只修改函数配置。更新后核对函数名、环境和部署版本一致，再重新测试。

代码不自动改用付费型号或 OpenAI；免费资格和平台限流仍由智谱当期规则决定。OpenAI 仍是其它部署可明确选择的方案，本次云开发本人预览保持智谱，不因模型失败自动切换供应商。

## 7. 本人手机联调与验收

先在工具模拟器验证，再生成手机预览码。每一步分别记录结果，不把上传成功当成手机 AI 成功：

| 检查 | 应看到的结果 |
| --- | --- |
| 环境未配置/函数不存在 | 页面给出明确配置或调用错误，不伪造 AI 文本 |
| 查询身份 | 只显示当前调用者自己的身份，不列出其他用户或完整名单 |
| 本人尚未授权 | AI 拒绝执行，不调用模型 |
| 未同意数据发送 | AI 拒绝执行 |
| 供应商不匹配 | 要求更新配置并重新同意，不向另一服务商发送 |
| 本人在名单中并同意 | 生成性格、事业、财运、婚姻、流年五个主题，盘面事实与本地排盘一致 |
| 手机切换页面或等待超时 | 不把迟到结果写入另一张命盘；不显示假成功 |

前端最多等待约 **55 秒**。前端超时、离开页面或停止等待，**不等于已取消云端函数或模型调用**；它们可能继续运行直到返回或触发自身超时，仍可能消耗云资源。确认上次状态后再试，不连续重复点击。

查看云日志只用必要的错误码、时间和 RequestId 定位。不要复制出生信息、请求体、完整解读、内部口令、身份名单或模型 Key 到日志和聊天。腾讯云/智谱自身的数据处理与保留以各自政策为准，不能把“业务代码不主动打印”说成平台零保留。

## 当前交付边界与来源

本轮只完成本地代码准备与本地验证，以最终交付报告列出的测试结果为准。云环境资格与开通、实际费用、Key 的云端配置、函数部署、真实云调用、手机 AI 联调、公开审核和发布均未完成。本人名单预览通过也不等于可以直接公开生产；公开服务仍需另行核对账号、类目、隐私、AI 资质、用量和内容要求。

核查日期：2026-10-24。官方资料用于核对平台流程，项目特定的变量、名单、超时与打包结构以本仓库实现为准：

- [普通云函数运行时](https://docs.cloudbase.net/cloud-function/runtime-support)
- [函数配置与环境变量字段](https://docs.cloudbase.net/cli-v1/functions/configs)
- [控制台上传与依赖安装](https://docs.cloudbase.net/cloud-function/manage)
- [小程序关联、调用与微信身份](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)
- [计费与体验资格说明](https://docs.cloudbase.net/quick-start/resource-point)
