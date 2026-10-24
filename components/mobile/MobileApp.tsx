"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Solar } from "lunar-javascript";
import {
  createMobileChart,
  type MobileRequest,
  type MobileChart,
} from "@/lib/mobile/chart";
import type { Interpretation } from "@/lib/mobile/interpretation";
import {
  HISTORY_KEY,
  readHistory,
  saveHistory,
  type SavedChart,
} from "@/lib/mobile/history";
import { BRANCHES, STEMS } from "@/lib/ziwei/constants";
import type { Palace } from "@/lib/ziwei/types";
import { AI_PROVIDER_NAMES, type AIProvider } from "@/lib/mobile/ai-config";

const HOURS = [
  "子时 · 00:00–00:59",
  "丑时 · 01:00–02:59",
  "寅时 · 03:00–04:59",
  "卯时 · 05:00–06:59",
  "辰时 · 07:00–08:59",
  "巳时 · 09:00–10:59",
  "午时 · 11:00–12:59",
  "未时 · 13:00–14:59",
  "申时 · 15:00–16:59",
  "酉时 · 17:00–18:59",
  "戌时 · 19:00–20:59",
  "亥时 · 21:00–22:59",
  "晚子时 · 23:00–23:59",
];
const POSITIONS: Record<number, [number, number]> = {
  5: [1, 1],
  6: [1, 2],
  7: [1, 3],
  8: [1, 4],
  4: [2, 1],
  9: [2, 4],
  3: [3, 1],
  10: [3, 4],
  2: [4, 1],
  1: [4, 2],
  0: [4, 3],
  11: [4, 4],
};
function Icon({
  kind,
  className = "",
}: {
  kind: "star" | "chart" | "book" | "history" | "arrow" | "save";
  className?: string;
}) {
  const paths = {
    star: "M12 2l2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z",
    chart: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
    book: "M4 4h6a3 3 0 0 1 3 3v14a5 5 0 0 0-4-2H4V4Zm9 3a3 3 0 0 1 3-3h5v15h-4a5 5 0 0 0-4 2",
    history: "M4 8a9 9 0 1 1-1 7M4 3v5h5M12 7v6l4 2",
    arrow: "M5 12h14m-5-5 5 5-5 5",
    save: "M5 3h14v18l-7-4-7 4V3Z",
  };
  return (
    <svg
      className={"icon " + className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
function Orrery() {
  return (
    <svg
      className="orrery"
      viewBox="0 0 420 420"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="210" cy="210" r="180" stroke="currentColor" opacity=".22" />
      <circle
        cx="210"
        cy="210"
        r="160"
        stroke="currentColor"
        strokeDasharray="1 9"
      />
      <circle cx="210" cy="210" r="128" stroke="currentColor" opacity=".4" />
      <circle cx="210" cy="210" r="81" stroke="currentColor" opacity=".2" />
      <path
        d="M210 18v384M18 210h384M74 74l272 272M74 346 346 74"
        stroke="currentColor"
        opacity=".15"
      />
      <path
        d="m210 114 22 74 74 22-74 22-22 74-22-74-74-22 74-22 22-74Z"
        stroke="currentColor"
      />
      <circle cx="210" cy="210" r="19" stroke="currentColor" />
      <circle cx="210" cy="50" r="5" fill="currentColor" />
      <circle cx="321" cy="304" r="4" fill="currentColor" />
      <circle cx="104" cy="138" r="3" fill="currentColor" />
      {[
        "子",
        "丑",
        "寅",
        "卯",
        "辰",
        "巳",
        "午",
        "未",
        "申",
        "酉",
        "戌",
        "亥",
      ].map((b, i) => {
        const a = ((i * 30 - 90) * Math.PI) / 180;
        return (
          <text
            key={b}
            x={Number((210 + 145 * Math.cos(a)).toFixed(3))}
            y={Number((215 + 145 * Math.sin(a)).toFixed(3))}
            fill="currentColor"
            textAnchor="middle"
            fontSize="13"
            fontFamily="serif"
          >
            {b}
          </text>
        );
      })}
    </svg>
  );
}
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "操作未完成，请重试。";
function currentLunarYear() {
  const d = new Date();
  return Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate())
    .getLunar()
    .getYear();
}
function dateToday() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function MobileApp({
  aiProvider,
}: {
  aiProvider: AIProvider | null;
}) {
  const [maxDate, setMaxDate] = useState<string>();
  const [date, setDate] = useState("1996-06-15");
  const [hour, setHour] = useState("4");
  const [gender, setGender] = useState<"male" | "female">("female");
  const [year, setYear] = useState(2026);
  const [result, setResult] = useState<MobileChart | null>(null);
  const [isDemo, setDemo] = useState(true);
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<"natal" | "annual" | "decade">("natal");
  const [history, setHistory] = useState<SavedChart[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState("");
  const [analysis, setAnalysis] = useState<Interpretation | null>(null);
  const [aiError, setAiError] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  const clearAI = () => {
    revision.current++;
    abortRef.current?.abort();
    setBusy(false);
    setAnalysis(null);
    setAiError("");
    setConsent(false);
  };
  function display(request: MobileRequest, demo = false) {
    const next = createMobileChart(request);
    clearAI();
    setResult(next);
    setSelected(next.chart.mingGongBranch);
    setYear(request.year);
    setDemo(demo);
    setError("");
    setFeedback("");
  }
  useEffect(() => {
    setMaxDate(dateToday());
    try {
      const y = currentLunarYear();
      display(
        {
          birth: {
            date: "1996-06-15",
            hour: 4,
            gender: "female",
            lateZi: false,
          },
          year: y,
        },
        true,
      );
    } catch (e) {
      setError(messageOf(e));
    }
    try {
      setHistory(readHistory(localStorage.getItem(HISTORY_KEY)));
    } catch {
      setStorageError(true);
      setFeedback(
        "无法读取本地历史；可以继续排盘。清除损坏的历史后可重新保存。",
      );
    }
    return () => abortRef.current?.abort();
    // Initial example is generated only on this device after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      display({
        birth: {
          date,
          hour: Number(hour) === 12 ? 0 : Number(hour),
          gender,
          lateZi: Number(hour) === 12,
        },
        year,
      });
      jump("chart");
    } catch (e) {
      setError(messageOf(e));
    }
  }
  function changeYear(value: number) {
    if (!result || !Number.isInteger(value)) return;
    try {
      display({ ...result.input, year: value }, isDemo);
    } catch (e) {
      setError(messageOf(e));
    }
  }
  function persist(entries: SavedChart[]) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
      setHistory(entries);
      setStorageError(false);
      return true;
    } catch {
      setFeedback("保存失败：浏览器存储不可用或空间不足。");
      return false;
    }
  }
  function save() {
    if (!result) return;
    if (storageError) {
      setHistoryOpen(true);
      setFeedback("本地历史读取异常。请先在历史区确认清除，避免覆盖原记录。");
      setTimeout(() => jump("history"), 0);
      return;
    }
    try {
      if (
        persist(
          saveHistory(
            history,
            result.input,
            crypto.randomUUID(),
            new Date().toISOString(),
          ),
        )
      )
        setFeedback("命盘已保存到当前设备。");
    } catch (e) {
      setFeedback(messageOf(e));
    }
  }
  function restore(entry: SavedChart) {
    try {
      display(entry.request);
      setDate(entry.request.birth.date);
      setGender(entry.request.birth.gender);
      setHour(
        String(entry.request.birth.lateZi ? 12 : entry.request.birth.hour),
      );
      jump("chart");
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function interpret() {
    if (!result || busy) return;
    setBusy(true);
    setAiError("");
    setAnalysis(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const rev = revision.current;
    const timer = window.setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          ...result.input,
          consent,
          provider: aiProvider,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "AI 暂时不可用，请稍后再试。",
        );
      if (rev === revision.current) setAnalysis(data);
    } catch (e) {
      if (rev === revision.current)
        setAiError(
          e instanceof Error && e.name === "AbortError"
            ? "等待超时，稍后可以重试。"
            : messageOf(e),
        );
    } finally {
      window.clearTimeout(timer);
      if (rev === revision.current) setBusy(false);
    }
  }
  const chart = result?.chart;
  const palace = chart?.palaces.find((p) => p.branch === selected);
  const decade =
    result && chart ? chart.daXians[result.annual.daXianIndex] : undefined;
  const transforms =
    view === "annual"
      ? result?.annual.siHua
      : view === "decade"
        ? decade?.siHua
        : undefined;
  const transformation = (name: string) =>
    transforms
      ? (
          [
            ["lu", "禄"],
            ["quan", "权"],
            ["ke", "科"],
            ["ji", "忌"],
          ] as const
        )
          .filter(([key]) => transforms[key] === name)
          .map(([, label]) => label)
      : [];
  const palaceName = (p: Palace) => (p.name === "仆役" ? "交友" : p.name);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#birth">
        跳到出生信息
      </a>
      <header className="site-header">
        <a href="#" className="brand">
          <span className="brand-seal">紫</span>
          <span>
            紫微 <span className="brand-dot">·</span> 观星
            <small>ZIWEI GUANXING</small>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="主导航">
          <a href="#birth">开始排盘</a>
          <a href="#chart">我的命盘</a>
          <a href="#ai">AI 解读</a>
          <button
            onClick={() => {
              setHistoryOpen(true);
              setTimeout(() => jump("history"), 0);
            }}
          >
            命盘历史
          </button>
        </nav>
        <button
          className="install-button"
          onClick={() => setInstallOpen(!installOpen)}
        >
          <span>＋</span> 添加到主屏幕
        </button>
      </header>
      {installOpen && (
        <aside className="install-guide" role="status">
          <strong>把观星放进口袋</strong>
          <p>
            iPhone Safari 打开部署后的 HTTPS 网址 →
            点底部「分享」→「添加到主屏幕」。首次安装需联网，AI 解读需联网。
          </p>
          <button className="text-button" onClick={() => setInstallOpen(false)}>
            知道了
          </button>
        </aside>
      )}
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> 东方星图 · 自我探索
            </p>
            <h1>
              观星知己，
              <br />
              从容<span>而行。</span>
            </h1>
            <p className="hero-description">
              十二宫里，看见人生的不同侧面。
              <br />
              以传统文化为镜，和 AI 一起探索自己。
            </p>
            <div className="hero-tags">
              <span>十二宫排盘</span>
              <i />
              <span>大限流年</span>
              <i />
              <span>AI 解读</span>
            </div>
          </div>
          <div className="hero-art">
            <Orrery />
            <span className="art-note">观天之道 · 知己之途</span>
            <span className="art-corner">
              星有所引
              <br />
              行由自己
            </span>
          </div>
        </section>
        <div className="workspace">
          <section className="panel birth-panel" id="birth">
            <div className="section-heading">
              <span className="section-index">01</span>
              <div>
                <p className="overline">BEGIN YOUR JOURNEY</p>
                <h2>起一张命盘</h2>
              </div>
            </div>
            <p className="panel-intro">从你的出生信息开始。</p>
            <form onSubmit={submit}>
              <label className="field-label" htmlFor="birth-date">
                公历出生日期 <span>阳历</span>
              </label>
              <input
                id="birth-date"
                name="birthDate"
                type="date"
                value={date}
                min="1900-01-01"
                max={maxDate}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              <label className="field-label" htmlFor="birth-hour">
                出生时辰
              </label>
              <select
                id="birth-hour"
                value={hour}
                onChange={(e) => setHour(e.target.value)}
              >
                {HOURS.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="field-hint">按出生当地钟表时间，晚子时归次日。</p>
              <fieldset className="gender-group">
                <legend className="field-label">排盘性别</legend>
                <div className="segmented gender-options">
                  {(["male", "female"] as const).map((g) => (
                    <label key={g} className={gender === g ? "active" : ""}>
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={gender === g}
                        onChange={() => setGender(g)}
                      />
                      {g === "male" ? "男 · 乾造" : "女 · 坤造"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="primary-button generate-button" type="submit">
                <Icon kind="star" /> 开始排盘 <Icon kind="arrow" />
              </button>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </form>
            <div className="privacy-note">
              <span>◈</span>
              <p>
                排盘在当前设备完成。
                <br />
                无需姓名，不会自动上传出生信息。
              </p>
            </div>
            <details className="rules">
              <summary>排盘口径与使用说明</summary>
              <p>
                公历输入 · 农历正月初一换年 · 闰月分半 ·
                默认全书亮度表。本版不做真太阳时及夏令时校正。
                <Link href="/terms">查看说明 ↗</Link>
              </p>
            </details>
          </section>
          <div className="reading-column">
            <section className="panel chart-panel" id="chart">
              <div className="chart-header">
                <div className="section-heading">
                  <span className="section-index">02</span>
                  <div>
                    <p className="overline">YOUR CELESTIAL MAP</p>
                    <h2>
                      十二宫命盘{" "}
                      {isDemo && <span className="demo-label">示例</span>}
                    </h2>
                  </div>
                </div>
                <button
                  className="outline-button"
                  onClick={save}
                  disabled={!result}
                >
                  <Icon kind="save" /> 保存命盘
                </button>
              </div>
              <div className="chart-toolbar">
                <div
                  className="segmented chart-tabs"
                  role="group"
                  aria-label="命盘视图"
                >
                  {(
                    [
                      ["natal", "本命"],
                      ["decade", "大限"],
                      ["annual", "流年"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                      className={view === v ? "active" : ""}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="year-control">
                  <button
                    aria-label="上一流年"
                    onClick={() => changeYear(year - 1)}
                  >
                    ‹
                  </button>
                  <label>
                    <span className="sr-only">农历流年</span>
                    <select
                      value={year}
                      onChange={(e) => changeYear(Number(e.target.value))}
                    >
                      {Array.from({ length: 201 }, (_, i) => 1900 + i).map(
                        (y) => (
                          <option key={y} value={y}>
                            {y} 年
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <button
                    aria-label="下一流年"
                    onClick={() => changeYear(year + 1)}
                  >
                    ›
                  </button>
                </div>
              </div>
              <p className="chart-caption">
                {view === "natal"
                  ? "本命星曜与生年四化"
                  : view === "annual"
                    ? "高亮流年命宫 · 金色标签为流年四化"
                    : "高亮所选流年对应大限 · 金色标签为大限四化"}
                <span>点击宫位查看详情</span>
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {chart && result ? (
                <>
                  <div className="chart-board" aria-label="十二宫星曜排盘">
                    <div className="chart-center">
                      <span className="center-star">✧</span>
                      <p className="center-overline">
                        紫微斗数 · {isDemo ? "示例命盘" : "本命星图"}
                      </p>
                      <h3>{chart.wuxingJuName}</h3>
                      <p>{result.input.birth.date.replaceAll("-", " · ")}</p>
                      <p>
                        {BRANCHES[result.input.birth.hour]}时 ·{" "}
                        {result.input.birth.gender === "male" ? "男" : "女"}
                        {result.input.birth.lateZi ? " · 晚子" : ""}
                      </p>
                      <div className="center-divider" />
                      <p className="center-lunar">
                        农历 {chart.lunarInfo.lunarYear} 年<br />
                        {chart.lunarInfo.isLeapMonth ? "闰" : ""}
                        {Math.abs(chart.lunarInfo.lunarMonth)} 月{" "}
                        {chart.lunarInfo.lunarDay} 日
                      </p>
                      <span className="center-age">
                        {year} 流年 · 虚岁 {result.annual.age}
                      </span>
                    </div>
                    {chart.palaces.map((p) => {
                      const active =
                        view === "annual"
                          ? p.branch === result.annual.branch
                          : view === "decade"
                            ? p.branch === decade?.palaceBranch
                            : false;
                      return (
                        <button
                          key={p.branch}
                          className={
                            "palace-cell " +
                            (p.branch === selected ? "selected " : "") +
                            (active ? "timing-active" : "")
                          }
                          style={{
                            gridRow: POSITIONS[p.branch][0],
                            gridColumn: POSITIONS[p.branch][1],
                          }}
                          onClick={() => setSelected(p.branch)}
                          aria-pressed={p.branch === selected}
                          aria-label={
                            palaceName(p) +
                            (p.name === "命宫" ? "" : "宫") +
                            "，" +
                            p.stars
                              .filter((s) => s.type === "major")
                              .map((s) => s.name)
                              .join("、") +
                            (active ? "，当前运限" : "")
                          }
                        >
                          <span className="palace-top">
                            <span>
                              {STEMS[p.stem]}
                              {BRANCHES[p.branch]}
                            </span>
                            {p.isShenGong && <b>身</b>}
                          </span>
                          <span className="major-stars">
                            {p.stars
                              .filter((s) => s.type === "major")
                              .map((s) => (
                                <span key={s.name}>
                                  {s.name}
                                  {s.siHua && (
                                    <i
                                      className={"hua natal-hua hua-" + s.siHua}
                                    >
                                      {s.siHua}
                                    </i>
                                  )}
                                  {transformation(s.name).map((h) => (
                                    <i key={h} className="hua timing-hua">
                                      {h}
                                    </i>
                                  ))}
                                </span>
                              ))}
                            {!p.stars.some((s) => s.type === "major") && (
                              <span className="empty-palace">空宫</span>
                            )}
                          </span>
                          <span className="minor-stars">
                            {p.stars
                              .filter(
                                (s) =>
                                  s.type !== "major" &&
                                  (s.type === "lucky" ||
                                    s.type === "sha" ||
                                    s.siHua ||
                                    transformation(s.name).length),
                              )
                              .sort(
                                (a, b) =>
                                  Number(
                                    Boolean(b.siHua) ||
                                      transformation(b.name).length > 0,
                                  ) -
                                  Number(
                                    Boolean(a.siHua) ||
                                      transformation(a.name).length > 0,
                                  ),
                              )
                              .slice(0, 3)
                              .map((s) => (
                                <span key={s.name}>
                                  {s.name}
                                  {s.siHua && (
                                    <i className="hua natal-hua">{s.siHua}</i>
                                  )}
                                  {transformation(s.name).map((h) => (
                                    <i key={h} className="hua timing-hua">
                                      {h}
                                    </i>
                                  ))}
                                </span>
                              ))}
                          </span>
                          <span className="palace-bottom">
                            <strong>{palaceName(p)}</strong>
                            <small>{p.daXianAge?.join("–")}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-dot" /> 已选宫位
                    </span>
                    <span>
                      <i className="legend-dot timing-dot" /> 运限宫位
                    </span>
                    <span>朱红：生年四化 · 金色：运限四化</span>
                  </div>
                  {palace && (
                    <div className="palace-detail" aria-live="polite">
                      <div className="detail-title">
                        <h3>
                          {palaceName(palace)}
                          {palace.name === "命宫" ? "" : "宫"}
                        </h3>
                        <span>
                          {STEMS[palace.stem]}
                          {BRANCHES[palace.branch]} · 大限{" "}
                          {palace.daXianAge?.join("–")} 虚岁
                        </span>
                      </div>
                      <div className="detail-stars">
                        {palace.stars.map((s, i) => (
                          <span
                            key={s.name + i}
                            className={
                              "star-chip " +
                              (s.type === "major" ? "major-chip" : "")
                            }
                          >
                            {s.name}
                            {s.brightnessRaw && (
                              <small>{s.brightnessRaw}</small>
                            )}
                            {s.siHua && (
                              <b className="natal-hua">化{s.siHua}</b>
                            )}
                            {transformation(s.name).map((h) => (
                              <b key={h} className="timing-text">
                                运化{h}
                              </b>
                            ))}
                          </span>
                        ))}
                      </div>
                      {palace.isEmpty && (
                        <p className="field-hint">
                          本宫无主星，对宫主星：
                          {palace.borrowedStars?.join("、") || "请查看对宫"}
                          。空宫不代表这个领域没有内容。
                        </p>
                      )}
                    </div>
                  )}
                  <details className="decade-list">
                    <summary>
                      大限与流年 ·{" "}
                      {decade
                        ? decade.startAge +
                          "–" +
                          decade.endAge +
                          " 虚岁 · " +
                          decade.palaceName +
                          "宫"
                        : "当前流年未进入十年大限"}
                    </summary>
                    <p className="field-hint">
                      所选年份指农历年，以正月初一为界。虚岁 = 流年 − 农历出生年
                      + 1。
                    </p>
                    <div className="decade-items">
                      {chart.daXians.map((d, i) => (
                        <button
                          key={i}
                          disabled={
                            chart.lunarInfo.lunarYear + d.startAge - 1 > 2100
                          }
                          title={
                            chart.lunarInfo.lunarYear + d.startAge - 1 > 2100
                              ? "超出流年支持范围（2100 年）"
                              : undefined
                          }
                          className={
                            i === result.annual.daXianIndex ? "current" : ""
                          }
                          onClick={() => {
                            setView("decade");
                            changeYear(
                              chart.lunarInfo.lunarYear + d.startAge - 1,
                            );
                          }}
                        >
                          {d.startAge}–{d.endAge} 岁 <span>{d.palaceName}</span>
                        </button>
                      ))}
                    </div>
                    <p className="field-hint">
                      超出 2100 年的大限仅展示年龄，不支持切换流年。
                    </p>
                    <p className="annual-transforms">
                      {year} · {result.annual.stemName}
                      {BRANCHES[result.annual.branch]}年：
                      {Object.entries(result.annual.siHua)
                        .map(
                          ([k, v]) =>
                            v +
                            "化" +
                            { lu: "禄", quan: "权", ke: "科", ji: "忌" }[k],
                        )
                        .join(" · ")}
                    </p>
                  </details>
                </>
              ) : (
                <div className="chart-loading">正在本机绘制星图…</div>
              )}
            </section>
            <section className="panel ai-panel" id="ai">
              <div className="ai-title">
                <div className="section-heading">
                  <span className="section-index">03</span>
                  <div>
                    <p className="overline">A NEW PERSPECTIVE</p>
                    <h2>让星图，更好懂</h2>
                  </div>
                </div>
                <span className="ai-badge">✧ AI 解读</span>
              </div>
              <p className="panel-intro">
                把宫位和星曜，转成能理解、可思考的生活提示。
              </p>
              <div className="topic-row">
                {["性格", "事业", "财运", "婚姻", "流年"].map((t, i) => (
                  <span key={t}>
                    <i>{["◈", "◇", "◉", "♡", "✧"][i]}</i>
                    {t}
                  </span>
                ))}
              </div>
              {!analysis && (
                <div className="ai-empty">
                  <Icon kind="book" />
                  <div>
                    <strong>星曜是线索，选择在你手中</strong>
                    <p>
                      生成五个维度的命盘观察与行动建议。
                      <br />
                      AI 可能理解有误，请结合实际经历判断。
                    </p>
                  </div>
                </div>
              )}
              <label className="field-label" htmlFor="ai-token">
                AI 访问口令 <span>由部署者提供</span>
              </label>
              <input
                id="ai-token"
                type="password"
                autoComplete="off"
                placeholder="输入访问口令，不是模型 API Key"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <label className="consent-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  同意将出生信息及所选流年发送到本站服务端，并将结构化命盘发送给
                  {aiProvider
                    ? AI_PROVIDER_NAMES[aiProvider]
                    : "尚未配置的 AI 服务商"}
                  ，用于本次解读。
                  <Link href="/privacy">了解数据使用</Link>
                </span>
              </label>
              <button
                className="primary-button ai-button"
                disabled={!result || !consent || !token.trim() || busy}
                onClick={interpret}
              >
                <Icon kind="star" />
                {busy ? "正在解读星图…" : "生成 AI 解读"}
                <Icon kind="arrow" />
              </button>
              <p className="field-hint">
                需要联网及服务端配置。未配置时，排盘与本地历史仍可使用。
              </p>
              {aiError && (
                <p className="error" role="alert">
                  {aiError}
                </p>
              )}
              <div aria-live="polite">
                {busy && (
                  <p className="ai-progress">
                    正在核对十二宫、四化与流年，通常需要几十秒…
                  </p>
                )}
                {analysis && (
                  <div className="analysis-results">
                    {analysis.sections.map((s) => (
                      <article key={s.topic}>
                        <span className="overline">{s.topic}观察</span>
                        <h3>{s.summary}</h3>
                        <h4>命盘线索</h4>
                        <ul>
                          {s.observations.map((o, i) => (
                            <li key={i}>{o}</li>
                          ))}
                        </ul>
                        <h4>可以尝试</h4>
                        <ul>
                          {s.suggestions.map((o, i) => (
                            <li key={i}>{o}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                    <p className="analysis-notice">{analysis.notice}</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
        <section className="panel history-panel" id="history">
          <button
            className="history-toggle"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-expanded={historyOpen}
          >
            <span>
              <Icon kind="history" /> 我的命盘历史{" "}
              <small>{history.length} / 20</small>
            </span>
            <span>{historyOpen ? "收起 −" : "展开 ＋"}</span>
          </button>
          {historyOpen && (
            <div className="history-content">
              <p className="field-hint">
                仅保存在当前浏览器，点击记录可以恢复。AI
                解读和访问口令不会存入历史。
              </p>
              {history.length === 0 ? (
                <p className="history-empty">
                  还没有保存的命盘。排盘后点击「保存命盘」。
                </p>
              ) : (
                history.map((entry) => (
                  <div className="history-entry" key={entry.id}>
                    <button onClick={() => restore(entry)}>
                      <strong>
                        {entry.request.birth.date} ·{" "}
                        {BRANCHES[entry.request.birth.hour]}时
                        {entry.request.birth.lateZi ? "（晚子）" : ""} ·{" "}
                        {entry.request.birth.gender === "male" ? "男" : "女"}
                      </strong>
                      <span>
                        {entry.request.year} 流年 ·{" "}
                        {new Date(entry.savedAt).toLocaleDateString("zh-CN")}{" "}
                        保存
                      </span>
                    </button>
                    {deleteId === entry.id ? (
                      <div className="delete-actions">
                        <button
                          onClick={() => {
                            if (
                              persist(history.filter((h) => h.id !== entry.id))
                            ) {
                              setDeleteId("");
                              setFeedback("记录已删除。");
                            }
                          }}
                        >
                          确认删除
                        </button>
                        <button onClick={() => setDeleteId("")}>取消</button>
                      </div>
                    ) : (
                      <button
                        className="text-button"
                        onClick={() => setDeleteId(entry.id)}
                      >
                        删除
                      </button>
                    )}
                  </div>
                ))
              )}
              {storageError && (
                <button
                  className="outline-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "清除当前观星应用的损坏历史？这会删除本地命盘记录。",
                      )
                    ) {
                      if (persist([])) setFeedback("本地历史已重置。");
                    }
                  }}
                >
                  清除损坏历史
                </button>
              )}
            </div>
          )}
        </section>
        {feedback && (
          <p className="feedback" role="status">
            {feedback}
            <button onClick={() => setFeedback("")} aria-label="关闭提示">
              ×
            </button>
          </p>
        )}
      </main>
      <footer className="site-footer">
        <div className="footer-brand">
          紫微 · 观星 <span>以星为镜，以己为舟。</span>
        </div>
        <p>传统文化探索与娱乐参考 · 非科学预测 · 不作为重大决策依据</p>
        <div>
          <Link href="/privacy">隐私说明</Link>
          <Link href="/terms">使用说明</Link>
          <Link href="/licenses">开源许可</Link>
        </div>
      </footer>
      <nav className="mobile-nav" aria-label="手机快捷导航">
        <a href="#birth">
          <Icon kind="star" />
          起盘
        </a>
        <a href="#chart">
          <Icon kind="chart" />
          命盘
        </a>
        <a href="#ai">
          <Icon kind="book" />
          AI 解读
        </a>
        <button
          onClick={() => {
            setHistoryOpen(true);
            setTimeout(() => jump("history"), 0);
          }}
        >
          <Icon kind="history" />
          历史
        </button>
      </nav>
    </div>
  );
}
