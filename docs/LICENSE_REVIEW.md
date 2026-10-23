# 许可审查：紫微 · 观星

审查日期：2026-10-22。上游基线：`Renhuai123/ziwei-doushu@1059c347231c636bd86ddb78fd8ed430d5de8d2a`。本记录区分代码、数据与原话语料的许可，不把 GitHub 的 MIT 标签套用到整个仓库。

## 本次使用范围

手机网页版复用 `lib/ziwei/` 排盘算法、类型与必要表格，新增自己的界面、AI 提示词和后端。新功能只向 AI 提供结构化命盘，不检索或注入《天纪》原话，不下载 Releases 解读数据集。上游旧文件保留原有许可证；保留在源码中不代表被新应用加载或获得新的授权。

| 对象 | 上游许可与限制 | 本次处理 |
| --- | --- | --- |
| `lib/`、`app/`、`components/` 代码 | MIT，允许修改、分发与商用，必须保留版权与许可 | 保留根目录 `LICENSE`，在 `THIRD_PARTY_NOTICES.md` 记录来源 |
| iztro 排盘库 | MIT，版权 2023 All Contributors | 保留依赖与许可声明 |
| lunar-javascript 历法库 | MIT，版权 2018 6tail | 保留依赖与许可声明 |
| Releases 的 v3.0 样本与 v4.0 解读数据集 | CC BY 4.0；须署名和标明来源；其中倪海厦原话被明确排除在数据授权外 | 本次不下载、不接入，不声称产品使用了这些数据 |
| `docs/tianji-ziwei/` | CC BY-NC-SA 4.0，限非商业使用；原课程权利属于原权利人 | 原源码文档保留，不纳入新页面、AI 提示词或检索库 |
| `heming-knowledge.ts` 的 `ni_quote` 等引文 | 混合现代原话与古籍来源；不能仅因文件位于代码目录就忽略原话权利 | 本次 AI 不使用该知识库 |
| 古籍原文 | 上游将《骨髓赋》《紫微斗数全集》《紫微斗数全书》标为公有领域 | 新 AI 功能不复制原文；未独立核验每条现代整理文字的权利链 |

## 开源边界

上游 README 明确：完整断语库、线上商业界面、AI 提示词、后端 API、用户与支付系统不在其开源范围。`lib/ziwei/db-analysis.ts` 的 `STAR_DB` 是空占位。本次 AI 解读由新增后端独立实现，不代表上游商业版效果。

上游 `school-data.ts` 与生成表称“按通行口径整理、经金标准盘核对”，未列明每张原始表的出处。本次可以依据明示的 MIT 许可复用代码，但不会把上游的校验声明表述为本项目独立验证的结果。

今后若接入数据集，应按具体版本在产品和文档中注明数据名称、来源、作者“王多鱼AI”，标识修改，并排除未经另行授权的现代课程原话。不要为了补充 AI 内容而抓取其线上商业站。

## 核查来源

- [上游代码 MIT 许可](https://github.com/Renhuai123/ziwei-doushu/blob/1059c347231c636bd86ddb78fd8ed430d5de8d2a/LICENSE)
- [数据许可及引文排除](https://github.com/Renhuai123/ziwei-doushu/blob/1059c347231c636bd86ddb78fd8ed430d5de8d2a/DATASET-LICENSE)
- [《天纪》目录单独许可](https://github.com/Renhuai123/ziwei-doushu/blob/1059c347231c636bd86ddb78fd8ed430d5de8d2a/docs/tianji-ziwei/LICENSE.md)
- [README 的开源边界](https://github.com/Renhuai123/ziwei-doushu/blob/1059c347231c636bd86ddb78fd8ed430d5de8d2a/README.md)
- [iztro MIT 许可](https://github.com/SylarLong/iztro/blob/main/LICENSE)
- [lunar-javascript MIT 许可](https://github.com/6tail/lunar-javascript/blob/master/LICENSE)
