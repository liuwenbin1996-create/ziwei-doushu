import Link from "next/link";
export default function Licenses() {
  return (
    <main className="legal-page">
      <Link href="/">← 返回观星</Link>
      <h1>开源与资料来源</h1>
      <p>
        本应用复用{" "}
        <a href="https://github.com/Renhuai123/ziwei-doushu">
          Renhuai123/ziwei-doushu
        </a>{" "}
        的 MIT 排盘代码，并保留原许可。核心依赖 iztro（MIT）与
        lunar-javascript（MIT）。完整来源与许可说明见仓库 THIRD_PARTY_NOTICES.md
        和 docs/LICENSE_REVIEW.md。
      </p>
      <p>
        本版界面与 AI 提示词另行编写，AI
        只读取结构化命盘。未把《天纪》原话、ni_quote
        或原站未开源的商业解读数据库接入
        AI。《天纪》资料有非商用及其他权利限制，不能把仓库整体视作全部资料均可商用。
      </p>
    </main>
  );
}
