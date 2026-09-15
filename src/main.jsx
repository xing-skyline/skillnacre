import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Blocks,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Folder,
  FolderOpen,
  Link2,
  Unlink,
  Settings2,
  RefreshCw,
  LayoutGrid,
  List,
  Check,
  CheckCircle2,
  X,
  ChevronRight,
  Star,
  FileText,
  Code2,
  Cloud,
  Download,
  History,
  Monitor,
  AlertCircle,
  Loader2,
  Copy,
  GitBranch as Github,
  Trash2,
  Pencil,
  Save,
  SlidersHorizontal,
  ShieldCheck,
  BookOpen,
  Sparkles,
} from "lucide-react";
import {
  Btn,
  Badge,
  Empty,
  Logo,
  ToolMark,
  Modal,
  Markdown,
  cn,
} from "./ui.jsx";
import {
  PresetsPage,
  PresetEditor,
  OriginsPage,
  DiffView,
  PlanDiff,
  DiscoveryView,
  UpdateView,
} from "./workspace-ui.jsx";
import "./styles.css";
import "./workspace.css";
import { DetectionModal } from "./detection-ui.jsx";

const api = (method, args) => window.skilldock.call(method, args);
const stateNames = {
  linked: "已连接",
  source: "主源文件",
  missing: "未连接",
  copy: "独立副本",
  broken: "链接失效",
  wrong: "链接到其他位置",
};
const kindNames = {
  check: "只读健康检查",
  link: "连接 AI 工具",
  unlink: "断开链接",
  sync: "同步备份",
  delete: "删除技能",
  import: "导入技能",
  edit: "编辑技能",
  restore: "恢复备份",
  recovery: "中断操作恢复",
};

function App() {
  const [data, setData] = useState(null),
    [page, setPage] = useState("library"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("全部分类"),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("grid"),
    [selected, setSelected] = useState([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [detail, setDetail] = useState(null),
    [detailTab, setDetailTab] = useState("preview"),
    [draft, setDraft] = useState(""),
    [editing, setEditing] = useState(false),
    [filePreview, setFilePreview] = useState(null);
  async function task(label, fn) {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy("");
    }
  }
  async function refresh() {
    const d = await api("snapshot");
    setData(d);
    setSelected((s) => s.filter((id) => d.skills.some((x) => x.id === id)));
    return d;
  }
  useEffect(() => {
    task("正在读取技能库", refresh);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const notify = (text) => setToast(text);
  const toggle = (id) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  const navigate = (p) => {
    setPage(p);
    setSearch("");
    setFilter("all");
  };
  async function openSkill(s) {
    const d = await task("读取技能内容", () => api("detail", { name: s.id }));
    if (d) {
      setDetail(d);
      setDraft(d.content);
      setDetailTab("preview");
      setEditing(false);
      setFilePreview(null);
    }
  }
  async function preview(request) {
    const p = await task("正在核对目录与内容", () => api("plan", request));
    if (p) setModal({ type: "plan", plan: p });
  }
  async function execute() {
    const r = await task("正在执行并验证，请保持窗口打开", () =>
      api("execute", { id: modal.plan.id }),
    );
    if (r) {
      setModal({ type: "result", result: r });
      await task("刷新技能库", refresh);
      setSelected([]);
    }
  }
  async function saveConfig(config) {
    const d = await task("保存设置", () => api("saveConfig", config));
    if (d) {
      setData(d);
      setModal(null);
      notify("设置已保存，已重新加载主技能库");
    }
  }
  const changeSource = () =>
    setModal({ type: "source", path: data.config.library });
  async function autoDetect() {
    const report = await task("正在自动识别 AI 工具路径", () =>
      api("detectPaths"),
    );
    if (report) setModal({ type: "detection", report });
  }
  if (!data)
    return (
      <div className="loading-screen">
        <Logo />
        <h2>SkillNacre</h2>
        <p>{error || busy || "正在启动…"}</p>
        {error && <Btn onClick={() => task("重新读取", refresh)}>重试</Btn>}
      </div>
    );
  const connectedTools = data.tools.filter((t) => !t.isSource && t.linked > 0);
  const availableTools = data.tools.filter((t) => !t.isSource);
  const categories = [...new Set(data.skills.map((s) => s.category))].sort();
  const visible = data.skills.filter(
    (s) =>
      `${s.name} ${s.description} ${s.tags?.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (category === "全部分类" || s.category === category) &&
      (filter !== "favorites" || data.config.favorites.includes(s.id)) &&
      (filter !== "issues" ||
        s.warning ||
        data.tools.some((t) =>
          ["copy", "broken", "wrong"].includes(t.states[s.id]),
        )),
  );
  const selectedNames = selected.length
    ? selected
    : data.skills.map((s) => s.id);
  const changeModal = (key, value) => setModal((m) => ({ ...m, [key]: value }));
  return (
    <>
      <div className="titlebar">
        <span>SkillNacre</span>
        <span className="titlebar-note">YOUR SKILLS, EVERYWHERE.</span>
      </div>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <Logo />
            <div>
              <strong>SkillNacre</strong>
              <span>技能匣 · 统一技能管理</span>
            </div>
          </div>
          <div className="nav-label">工作空间</div>
          <nav>
            {[
              ["library", LayoutGrid, "技能库", data.skills.length],
              ["tools", Monitor, "AI 工具", connectedTools.length],
              ["presets", Blocks, "技能组合", data.presets.length],
              ["origins", Github, "来源与更新"],
              ["sync", Cloud, "同步与备份"],
              ["history", History, "操作记录"],
            ].map(([key, Icon, label, count]) => (
              <button
                key={key}
                className={cn("nav-item", page === key && "active")}
                onClick={() => navigate(key)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {count !== undefined && <em>{count}</em>}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="note-symbol">
              <Link2 size={20} />
            </span>
            <strong>一份技能，多处使用</strong>
            <p>连接主技能库，让熟悉的能力随你切换工具。</p>
            <span className="local-dot">本地运行 · 数据由你掌握</span>
          </div>
          <div className="sidebar-bottom">
            <button
              className={cn("nav-item", page === "settings" && "active")}
              onClick={() => navigate("settings")}
            >
              <Settings2 size={18} />
              <span>设置</span>
            </button>
            <div className="version">
              <span>SkillNacre</span>
              <span>v1.1.0</span>
            </div>
          </div>
        </aside>
        <main>
          <div className="topline">
            <span>
              工作空间 <ChevronRight size={13} />{" "}
              {
                {
                  library: "技能库",
                  tools: "AI 工具",
                  presets: "技能组合",
                  origins: "来源与更新",
                  sync: "同步与备份",
                  history: "操作记录",
                  settings: "设置",
                }[page]
              }
            </span>
            <div>
              <span className="local-dot">本地工作空间</span>
              <button
                className="icon-btn"
                title="刷新"
                aria-label="刷新"
                onClick={() => task("正在重新检查", refresh)}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
          <div className="content">
            {(data.recovery?.lock || data.recovery?.pending > 0) && (
              <div className="notice">
                <AlertCircle size={17} />
                <div>
                  {data.recovery.lock?.message ||
                    `发现 ${data.recovery.pending} 条未完成操作记录。`}
                  <p>整理后可在操作记录中查看备份并预览恢复。</p>
                </div>
                <Btn
                  disabled={
                    data.recovery.lock && data.recovery.lock.state !== "stale"
                  }
                  onClick={() =>
                    task("整理中断记录", async () => {
                      const r = await api("recoverInterrupted");
                      await refresh();
                      notify(`已整理 ${r.recovered} 条恢复记录`);
                      navigate("history");
                    })
                  }
                >
                  整理恢复记录
                </Btn>
              </div>
            )}
            {data.warnings?.map((warning, i) => (
              <div className="notice" key={i}>
                <AlertCircle size={17} />
                {warning}。可到设置中更换目录。
              </div>
            ))}
            <header className="page-head">
              <div>
                <div className="eyebrow">
                  {page === "library"
                    ? "SKILL LIBRARY"
                    : page === "tools"
                      ? "CONNECTIONS"
                      : page === "sync"
                        ? "SYNC & BACKUP"
                        : page === "presets"
                          ? "SKILL COLLECTIONS"
                          : page === "origins"
                            ? "SOURCES & UPDATES"
                            : page === "history"
                              ? "ACTIVITY"
                              : "PREFERENCES"}
                </div>
                <h1>
                  {
                    {
                      library: "让技能，有条不紊。",
                      tools: "连接你常用的 AI 工具",
                      presets: "把技能，组成你的工作方式。",
                      origins: "看清来源，安心更新。",
                      sync: "让每一份修改，都有去处。",
                      history: "每一次操作，都看得见。",
                      settings: "按照你的习惯设置",
                    }[page]
                  }
                </h1>
                <p>
                  {
                    {
                      library:
                        "集中浏览、整理与连接，把你的经验带到每一个 AI 工具。",
                      tools:
                        "选择技能和工具，建立软链接；修改主源后，连接的工具共享更新。",
                      presets: "保存常用技能组合，查看每个工具的连接情况。",
                      origins:
                        "追溯导入位置，识别本地修改，按需获取来源的新版本。",
                      sync: "明确同步方向，预览内容变化，保留可找回的副本。",
                      history: "查看操作结果、文件路径和覆盖前的备份。",
                      settings: "自由选择技能来源，自定义各工具的连接目录。",
                    }[page]
                  }
                </p>
              </div>
              {page === "library" && (
                <Btn
                  icon={Plus}
                  variant="primary"
                  onClick={() =>
                    setModal({
                      type: "import",
                      mode: "local",
                      repo: "",
                      ref: "",
                      subdir: "",
                      loaded: null,
                      names: [],
                    })
                  }
                >
                  导入技能
                </Btn>
              )}
              {page === "sync" && (
                <Btn
                  icon={ShieldCheck}
                  onClick={async () => {
                    const result = await task("正在检查主库、备份与连接", () =>
                      api("health"),
                    );
                    if (result) setModal({ type: "result", result });
                  }}
                >
                  检查一致性
                </Btn>
              )}
              {page === "tools" && (
                <div className="header-actions">
                  <Btn icon={Search} onClick={autoDetect}>
                    自动识别路径
                  </Btn>
                  <Btn
                    icon={Plus}
                    onClick={() =>
                      setModal({ type: "custom", name: "", path: "" })
                    }
                  >
                    添加工具
                  </Btn>
                </div>
              )}
            </header>
            {page === "library" && (
              <>
                <div className="stats">
                  <div className="stat">
                    <span className="stat-icon purple">
                      <Blocks />
                    </span>
                    <div>
                      <span>主库技能</span>
                      <strong>
                        {data.skills.length}
                        <small> 个</small>
                      </strong>
                    </div>
                    <i>随时取用的能力</i>
                  </div>
                  <div className="stat">
                    <span className="stat-icon green">
                      <Link2 />
                    </span>
                    <div>
                      <span>已连接工具</span>
                      <strong>
                        {connectedTools.length}
                        <small> / {availableTools.length}</small>
                      </strong>
                    </div>
                    <i>一处更新，多处共享</i>
                  </div>
                  <div className="stat">
                    <span className="stat-icon peach">
                      <Folder />
                    </span>
                    <div>
                      <span>技能分类</span>
                      <strong>
                        {categories.filter((c) => c !== "未分类").length}
                        <small> 类</small>
                      </strong>
                    </div>
                    <i>沿用备份目录分类</i>
                  </div>
                </div>
                <div className="source-banner">
                  <div className="source-icon">
                    <FolderOpen size={21} />
                  </div>
                  <div>
                    <strong>
                      当前主技能库 <Badge tone="green">主源</Badge>
                    </strong>
                    <code>{data.config.library}</code>
                  </div>
                  <div className="source-actions">
                    <button
                      onClick={() =>
                        task("打开文件夹", () =>
                          api("openPath", { path: data.config.library }),
                        )
                      }
                    >
                      打开文件夹 <ArrowUpRight size={14} />
                    </button>
                    <button onClick={changeSource}>
                      切换来源 <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                {!data.libraryExists && (
                  <div className="notice">
                    <AlertCircle size={17} />
                    当前目录不存在。切换到已有技能文件夹，或通过导入创建主技能库。
                  </div>
                )}
                <div className="library-toolbar">
                  <div className="tabs">
                    <button
                      className={filter === "all" ? "active" : ""}
                      onClick={() => setFilter("all")}
                    >
                      全部技能 <b>{data.skills.length}</b>
                    </button>
                    <button
                      className={filter === "favorites" ? "active" : ""}
                      onClick={() => setFilter("favorites")}
                    >
                      <Star size={14} />
                      收藏
                    </button>
                    <button
                      className={filter === "issues" ? "active" : ""}
                      onClick={() => setFilter("issues")}
                    >
                      需要关注
                    </button>
                  </div>
                  <div className="toolbar-controls">
                    <label className="search">
                      <Search size={16} />
                      <input
                        placeholder="搜索名称、功能或关键词…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <button
                          aria-label="清除搜索"
                          onClick={() => setSearch("")}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </label>
                    <select
                      aria-label="技能分类"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option>全部分类</option>
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <div className="segmented">
                      <button
                        className={view === "grid" ? "active" : ""}
                        aria-label="卡片视图"
                        onClick={() => setView("grid")}
                      >
                        <LayoutGrid size={16} />
                      </button>
                      <button
                        className={view === "list" ? "active" : ""}
                        aria-label="列表视图"
                        onClick={() => setView("list")}
                      >
                        <List size={17} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="list-meta">
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        visible.length > 0 &&
                        visible.every((s) => selected.includes(s.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [
                                ...new Set([
                                  ...selected,
                                  ...visible.map((s) => s.id),
                                ]),
                              ]
                            : selected.filter(
                                (id) => !visible.some((s) => s.id === id),
                              ),
                        )
                      }
                    />
                    选择本页
                  </label>
                  <span>
                    显示 {visible.length} 个技能{" "}
                    <span className="muted">· 点击卡片查看内容</span>
                  </span>
                </div>
                <div
                  className={cn("skill-grid", view === "list" && "list-view")}
                >
                  {visible.map((s, index) => {
                    const linked = availableTools.filter((t) =>
                      ["linked", "source"].includes(t.states[s.id]),
                    );
                    const favored = data.config.favorites.includes(s.id);
                    return (
                      <article
                        key={s.id}
                        className={cn(
                          "skill-card",
                          selected.includes(s.id) && "selected",
                        )}
                        onClick={() => openSkill(s)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.target === e.currentTarget && e.key === "Enter")
                            openSkill(s);
                        }}
                      >
                        <div className="card-top">
                          <div
                            className={cn(
                              "skill-symbol",
                              ["lavender", "mint", "rose", "sand"][index % 4],
                            )}
                          >
                            {index % 3 === 0 ? (
                              <Sparkles size={21} />
                            ) : index % 3 === 1 ? (
                              <BookOpen size={21} />
                            ) : (
                              <Code2 size={21} />
                            )}
                          </div>
                          <div className="card-top-actions">
                            <button
                              className={cn(
                                "favorite",
                                favored && "is-favorite",
                              )}
                              title="收藏"
                              aria-label={`收藏 ${s.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                task("保存收藏", async () => {
                                  const favorites = favored
                                    ? data.config.favorites.filter(
                                        (x) => x !== s.id,
                                      )
                                    : [...data.config.favorites, s.id];
                                  setData(
                                    await api("saveConfig", {
                                      ...data.config,
                                      favorites,
                                    }),
                                  );
                                });
                              }}
                            >
                              <Star
                                size={16}
                                fill={favored ? "currentColor" : "none"}
                              />
                            </button>
                            <input
                              type="checkbox"
                              aria-label={`选择 ${s.name}`}
                              checked={selected.includes(s.id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggle(s.id)}
                            />
                          </div>
                        </div>
                        <div className="card-copy">
                          <h3 title={s.name}>{s.name}</h3>
                          <p>{s.description}</p>
                        </div>
                        <div className="card-footer">
                          <span className="category">
                            {s.category.replace(/^\d+-/, "")}
                          </span>
                          {s.warning ? (
                            <Badge tone="amber">元数据异常</Badge>
                          ) : linked.length ? (
                            <span className="connection-count">
                              <span className="mini-marks">
                                {linked.slice(0, 3).map((t) => (
                                  <i
                                    key={t.id}
                                    style={{
                                      color: t.color,
                                      background: t.color + "18",
                                    }}
                                  >
                                    {t.initials}
                                  </i>
                                ))}
                              </span>
                              <span>{linked.length} 个连接</span>
                            </span>
                          ) : (
                            <span className="muted">尚未连接</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!visible.length && (
                  <Empty
                    title={
                      data.skills.length
                        ? "没有匹配的技能"
                        : "从你的第一份技能开始"
                    }
                  >
                    {data.skills.length
                      ? "试试其他关键词，或切换筛选条件。"
                      : "选择已有技能目录作为主源，或导入包含 SKILL.md 的文件夹。"}
                  </Empty>
                )}
                <div className="end-note">
                  <ShieldCheck size={14} />
                  技能内容保存在本机，软链接让各工具读取同一份文件。
                </div>
              </>
            )}
            {page === "tools" && (
              <>
                <div className="source-banner">
                  <div className="source-icon">
                    <FolderOpen size={21} />
                  </div>
                  <div>
                    <strong>连接来源</strong>
                    <code>{data.config.library}</code>
                  </div>
                  <div className="source-actions">
                    <button onClick={changeSource}>
                      切换来源 <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                <div className="tools-grid">
                  {data.tools.map((t) => (
                    <article
                      className={cn("tool-card", t.isSource && "is-source")}
                      key={t.id}
                    >
                      <div className="tool-card-head">
                        <ToolMark tool={t} />
                        <div>
                          <h3>{t.name}</h3>
                          <span className={t.detected ? "local-dot" : "muted"}>
                            {t.isSource
                              ? "当前主源"
                              : t.detected
                                ? "检测到工具目录"
                                : "可手动连接"}
                          </span>
                        </div>
                        <button
                          className="icon-btn"
                          title="修改目录"
                          aria-label={`修改 ${t.name} 目录`}
                          onClick={() =>
                            setModal({
                              type: "toolpath",
                              tool: t,
                              path: t.path,
                            })
                          }
                        >
                          <Settings2 size={16} />
                        </button>
                      </div>
                      <code className="tool-path">{t.path}</code>
                      <div className="tool-progress">
                        <div
                          style={{
                            width: `${data.skills.length ? (t.linked / data.skills.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="tool-count">
                        <span>
                          <b>{t.linked}</b> / {data.skills.length} 个技能
                          {t.isSource ? "作为来源" : "已连接"}
                        </span>
                        {t.issues > 0 && (
                          <Badge tone="amber">{t.issues} 项需检查</Badge>
                        )}
                      </div>
                      {t.extras.length > 0 && (
                        <div className="tool-extra" title={t.extras.join("、")}>
                          另有 {t.extras.length} 个目录项，保留现状
                        </div>
                      )}
                      <div className="tool-card-actions">
                        <Btn
                          disabled={t.isSource || !data.skills.length}
                          icon={Link2}
                          onClick={() =>
                            preview({
                              kind: "link",
                              names: data.skills.map((s) => s.id),
                              toolIds: [t.id],
                            })
                          }
                        >
                          {t.isSource
                            ? "正在作为主源"
                            : t.linked === data.skills.length &&
                                data.skills.length
                              ? "检查连接"
                              : "连接全部技能"}
                        </Btn>
                        <button
                          className="text-button"
                          onClick={async () => {
                            const d = await task("检查发现路径", () =>
                              api("discovery", { toolId: t.id }),
                            );
                            if (d) setModal({ type: "discovery", data: d });
                          }}
                        >
                          发现路径 <ChevronRight size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <p className="help-line">
                  “检测到工具目录”仅表示发现配置痕迹。Hermes
                  的不同配置档案、OpenClaw 的状态目录和 WSL
                  环境可通过“修改目录”单独指定。
                </p>
              </>
            )}
            {page === "sync" && (
              <SyncPage data={data} preview={preview} setModal={setModal} />
            )}
            {page === "presets" && (
              <PresetsPage
                data={data}
                task={task}
                refresh={refresh}
                setModal={setModal}
              />
            )}
            {page === "origins" && (
              <OriginsPage data={data} task={task} setModal={setModal} />
            )}
            {page === "history" && (
              <>
                <div className="history-list">
                  {data.history.map((h) => (
                    <button
                      className="history-row"
                      key={h.id}
                      onClick={() => setModal({ type: "result", result: h })}
                    >
                      <span
                        className={cn("history-symbol", h.failed && "warning")}
                      >
                        {h.failed ? (
                          <AlertCircle size={21} />
                        ) : (
                          <CheckCircle2 size={21} />
                        )}
                      </span>
                      <div>
                        <strong>{kindNames[h.kind] || h.kind}</strong>
                        <p>
                          {new Date(h.date).toLocaleString("zh-CN")} ·{" "}
                          {h.items.length} 项记录
                        </p>
                      </div>
                      <Badge tone={h.failed ? "amber" : "green"}>
                        {h.failed ? `${h.failed} 项失败` : "已完成"}
                      </Badge>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
                {!data.history.length && (
                  <Empty title="还没有操作记录">
                    完成第一次连接、导入或编辑后，记录会显示在这里。
                  </Empty>
                )}
                <div className="notice">
                  <History size={17} />
                  点击记录可预览并恢复备份。恢复前会检查后续修改，恢复时再次备份当前版本。
                </div>
              </>
            )}
            {page === "settings" && (
              <>
                <section className="settings-section">
                  <h2>技能与备份目录</h2>
                  <div className="setting-row">
                    <div>
                      <strong>主技能库</strong>
                      <p>可选择任意 AI 工具的技能目录，或自定义文件夹。</p>
                      <code>{data.config.library}</code>
                    </div>
                    <Btn onClick={changeSource}>切换来源</Btn>
                  </div>
                  <div className="setting-row">
                    <div>
                      <strong>云端备份目录</strong>
                      <p>选择坚果云等同步盘的本地文件夹，沿用子目录分类。</p>
                      <code>{data.config.cloud || "尚未设置"}</code>
                    </div>
                    <Btn
                      onClick={async () => {
                        const p = await api("chooseFolder");
                        if (p) saveConfig({ ...data.config, cloud: p });
                      }}
                    >
                      选择文件夹
                    </Btn>
                  </div>
                </section>
                <section className="settings-section">
                  <div className="section-heading">
                    <h2>AI 工具路径</h2>
                    <div className="header-actions">
                      <Btn icon={Search} onClick={autoDetect}>
                        自动识别路径
                      </Btn>
                      <Btn
                        icon={Plus}
                        onClick={() =>
                          setModal({ type: "custom", name: "", path: "" })
                        }
                      >
                        添加工具
                      </Btn>
                    </div>
                  </div>
                  {data.tools.map((t) => (
                    <div className="setting-row" key={t.id}>
                      <ToolMark tool={t} />
                      <div className="grow">
                        <strong>{t.name}</strong>
                        <code>{t.path}</code>
                      </div>
                      {t.docs && (
                        <button
                          className="text-button"
                          onClick={() => api("openExternal", { url: t.docs })}
                        >
                          官方说明 <ArrowUpRight size={13} />
                        </button>
                      )}
                      <Btn
                        onClick={() =>
                          setModal({ type: "toolpath", tool: t, path: t.path })
                        }
                      >
                        修改
                      </Btn>
                      {t.id.startsWith("custom-") && (
                        <button
                          className="icon-btn"
                          aria-label={`移除工具 ${t.name}`}
                          onClick={() =>
                            saveConfig({
                              ...data.config,
                              tools: data.config.tools.filter(
                                (x) => x.id !== t.id,
                              ),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </section>
                <section className="settings-section">
                  <h2>本机数据</h2>
                  <div className="setting-row">
                    <div>
                      <strong>设置、操作记录与恢复备份</strong>
                      <code>{data.dataDir}</code>
                    </div>
                    <Btn
                      icon={FolderOpen}
                      onClick={() => api("openPath", { path: data.dataDir })}
                    >
                      打开目录
                    </Btn>
                  </div>
                  <p className="help-line">
                    Windows
                    创建软链接需要系统允许：可在系统设置中开启“开发者模式”。软件不会用复制目录代替软链接。CC
                    Switch 的注册与云同步仍由 CC Switch 管理。
                  </p>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
      {selected.length > 0 && page === "library" && (
        <div className="selection-bar">
          <span className="selection-check">
            <Check size={15} />
          </span>
          <strong>已选 {selected.length} 个技能</strong>
          <button className="text-button" onClick={() => setSelected([])}>
            取消选择
          </button>
          <div className="selection-divider" />
          <Btn
            icon={Blocks}
            onClick={() =>
              setModal({ type: "preset", preset: { names: selected } })
            }
          >
            存为组合
          </Btn>
          <Btn
            icon={Unlink}
            onClick={() =>
              setModal({
                type: "connect",
                kind: "unlink",
                names: selected,
                tools: [],
              })
            }
          >
            断开连接
          </Btn>
          <Btn
            icon={Link2}
            variant="primary"
            onClick={() =>
              setModal({
                type: "connect",
                kind: "link",
                names: selected,
                tools: [],
              })
            }
          >
            连接到 AI 工具 <ArrowRight size={15} />
          </Btn>
        </div>
      )}
      {detail && (
        <Modal
          title={detail.name}
          subtitle={detail.description}
          wide
          onClose={() => {
            if (!busy) {
              setDetail(null);
              setEditing(false);
            }
          }}
          footer={
            <>
              <span className="muted">
                {editing
                  ? "保存后，已连接工具会共享这一修改。"
                  : "实际位置：" + detail.realPath}
              </span>
              <div className="footer-actions">
                <Btn
                  icon={FolderOpen}
                  onClick={() => api("openPath", { path: detail.realPath })}
                >
                  打开文件夹
                </Btn>
                {editing ? (
                  <Btn
                    icon={Save}
                    variant="primary"
                    onClick={async () => {
                      const d = await task("保存并备份原文件", () =>
                        api("saveSkill", {
                          name: detail.id,
                          content: draft,
                          hash: detail.hash,
                        }),
                      );
                      if (d) {
                        setDetail(d);
                        setEditing(false);
                        notify("已保存，原文件已备份");
                        await refresh();
                      }
                    }}
                  >
                    保存修改
                  </Btn>
                ) : (
                  <Btn
                    icon={Link2}
                    variant="primary"
                    onClick={() => {
                      setSelected([detail.id]);
                      setDetail(null);
                      setModal({
                        type: "connect",
                        kind: "link",
                        names: [detail.id],
                        tools: [],
                      });
                    }}
                  >
                    连接工具
                  </Btn>
                )}
              </div>
            </>
          }
        >
          {detail.warning && <div className="notice">{detail.warning}</div>}
          <div className="detail-tabs">
            <div className="tabs">
              {[
                ["preview", "阅读"],
                ["source", "源文件"],
                ["files", `文件 (${detail.files.length})`],
                ["connections", "连接状态"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  className={detailTab === k ? "active" : ""}
                  onClick={() => setDetailTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            {!editing && (
              <button
                className="text-button"
                onClick={() => {
                  setEditing(true);
                  setDetailTab("source");
                }}
              >
                <Pencil size={14} />
                编辑正文
              </button>
            )}
          </div>
          {detailTab === "preview" && <Markdown text={detail.body} />}
          {detailTab === "source" &&
            (editing ? (
              <textarea
                className="editor"
                aria-label="技能源文件"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              <pre className="code-preview">{detail.content}</pre>
            ))}
          {detailTab === "files" && (
            <div className="files-panel">
              <div className="files-list">
                {detail.files.map((f) => (
                  <button
                    key={f.name}
                    disabled={f.directory || f.link}
                    onClick={async () => {
                      const text = await task("读取文件", () =>
                        api("readFile", { name: detail.id, file: f.name }),
                      );
                      if (text !== null) setFilePreview({ name: f.name, text });
                    }}
                  >
                    {f.directory ? (
                      <Folder size={15} />
                    ) : (
                      <FileText size={15} />
                    )}{" "}
                    {f.name}
                    {f.link && "（链接）"}
                  </button>
                ))}
              </div>
              {filePreview && (
                <>
                  <h4>{filePreview.name}</h4>
                  <pre className="code-preview">{filePreview.text}</pre>
                </>
              )}
            </div>
          )}
          {detailTab === "connections" && (
            <div className="connection-list">
              {data.tools.map((t) => (
                <div key={t.id}>
                  <ToolMark tool={t} />
                  <strong>{t.name}</strong>
                  <Badge
                    tone={
                      ["linked", "source"].includes(t.states[detail.id])
                        ? "green"
                        : ""
                    }
                  >
                    {stateNames[t.states[detail.id]]}
                  </Badge>
                </div>
              ))}
              <Btn
                icon={Trash2}
                variant="danger subtle"
                onClick={() => {
                  setDetail(null);
                  setModal({
                    type: "delete",
                    names: [detail.id],
                    deleteCloud: false,
                  });
                }}
              >
                删除这个技能
              </Btn>
            </div>
          )}
        </Modal>
      )}
      {modal?.type === "source" && (
        <Modal
          title="选择主技能库"
          subtitle="其他工具会链接到这里的技能。切换来源只更新配置。"
          onClose={() => setModal(null)}
          footer={
            <>
              <span className="muted">建议选择存放完整技能文件的目录。</span>
              <Btn
                variant="primary"
                onClick={() =>
                  saveConfig({ ...data.config, library: modal.path })
                }
              >
                使用此来源
              </Btn>
            </>
          }
        >
          <div className="source-options">
            {data.tools.map((t) => (
              <button
                aria-label={t.name}
                className={cn(
                  "source-option",
                  modal.path === t.path && "active",
                )}
                key={t.id}
                onClick={() => changeModal("path", t.path)}
              >
                <ToolMark tool={t} />
                <span>{t.name}</span>
                {modal.path === t.path && <CheckCircle2 size={18} />}
              </button>
            ))}
          </div>
          <label className="field">
            主源文件夹
            <div className="path-input">
              <input
                value={modal.path}
                onChange={(e) => changeModal("path", e.target.value)}
              />
              <Btn
                icon={FolderOpen}
                onClick={async () => {
                  const p = await api("chooseFolder");
                  if (p) changeModal("path", p);
                }}
              >
                浏览
              </Btn>
            </div>
          </label>
          <p className="help-line">
            如果源技能本身是软链接，阅读和编辑会使用它的实际文件位置。连接到源目录的操作将自动跳过。
          </p>
        </Modal>
      )}
      {(modal?.type === "custom" || modal?.type === "toolpath") && (
        <Modal
          title={
            modal.type === "custom"
              ? "添加自定义 AI 工具"
              : `配置 ${modal.tool.name}`
          }
          subtitle="选择该工具用于发现个人 Skill 的目录。"
          onClose={() => setModal(null)}
          footer={
            <Btn
              variant="primary"
              onClick={() => {
                const tools =
                  modal.type === "custom"
                    ? [
                        ...data.config.tools,
                        {
                          id: "custom-" + Date.now(),
                          name: modal.name,
                          initials: modal.name.slice(0, 2).toUpperCase(),
                          path: modal.path,
                          color: "#8880bc",
                          docs: "",
                        },
                      ]
                    : data.config.tools.map((t) =>
                        t.id === modal.tool.id ? { ...t, path: modal.path } : t,
                      );
                saveConfig({ ...data.config, tools });
              }}
            >
              保存配置
            </Btn>
          }
        >
          {modal.type === "custom" && (
            <label className="field">
              工具名称
              <input
                value={modal.name}
                placeholder="例如：我的 WSL Claude"
                onChange={(e) => changeModal("name", e.target.value)}
              />
            </label>
          )}
          <label className="field">
            技能目录
            <div className="path-input">
              <input
                value={modal.path}
                placeholder="D:\AI\skills"
                onChange={(e) => changeModal("path", e.target.value)}
              />
              <Btn
                icon={FolderOpen}
                onClick={async () => {
                  const p = await api("chooseFolder");
                  if (p) changeModal("path", p);
                }}
              >
                浏览
              </Btn>
            </div>
          </label>
          <p className="help-line">
            保存配置后，可在“AI
            工具”页面连接技能。移除自定义工具配置不会删除已有文件或链接。
          </p>
        </Modal>
      )}
      {modal?.type === "connect" && (
        <Modal
          title={
            modal.kind === "unlink" ? "断开工具连接" : "把技能连接到 AI 工具"
          }
          subtitle={`已选择 ${modal.names.length} 个技能，选择需要${modal.kind === "unlink" ? "断开" : "连接"}的目标工具。`}
          onClose={() => setModal(null)}
          footer={
            <>
              <span className="muted">已选择 {modal.tools.length} 个工具</span>
              <Btn
                variant="primary"
                disabled={!modal.tools.length}
                onClick={() =>
                  preview({
                    kind: modal.kind,
                    names: modal.names,
                    toolIds: modal.tools,
                  })
                }
              >
                预览操作 <ArrowRight size={15} />
              </Btn>
            </>
          }
        >
          <div className="tool-picker">
            {availableTools.map((t) => (
              <button
                aria-label={t.name}
                key={t.id}
                className={cn(
                  "pick-tool",
                  modal.tools.includes(t.id) && "active",
                )}
                onClick={() =>
                  changeModal(
                    "tools",
                    modal.tools.includes(t.id)
                      ? modal.tools.filter((x) => x !== t.id)
                      : [...modal.tools, t.id],
                  )
                }
              >
                <ToolMark tool={t} />
                <div>
                  <strong>{t.name}</strong>
                  <small>{t.path}</small>
                </div>
                <span className="check-box">
                  {modal.tools.includes(t.id) && <Check size={14} />}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal?.type === "plan" && (
        <Modal
          title="操作预览"
          wide
          subtitle={`${modal.plan.names.length} 个技能 · ${modal.plan.changes} 项变化 · ${modal.plan.items.length - modal.plan.changes} 项保持不动`}
          onClose={() => setModal(null)}
          footer={
            <>
              <span className="muted">
                覆盖前会备份现有内容，执行时再次核对文件。
              </span>
              <Btn
                variant="primary"
                onClick={execute}
                disabled={!modal.plan.changes || !!modal.plan.conflicts?.length}
              >
                确认执行 {modal.plan.changes} 项变化
              </Btn>
            </>
          }
        >
          <div className="plan-list">
            {modal.plan.items.map((item, i) => (
              <div className="plan-row" key={i}>
                <Badge
                  tone={
                    item.action === "keep"
                      ? ""
                      : item.action === "remove"
                        ? "amber"
                        : "purple"
                  }
                >
                  {item.label}
                </Badge>
                <div>
                  <strong>
                    {item.name} <small>→ {item.target}</small>
                  </strong>
                  {item.source && <code>来源：{item.source}</code>}
                  <code>目标：{item.dest}</code>
                  {!!item.remainingPaths?.length && (
                    <p className="error-text">
                      断开后仍可能被发现：{item.remainingPaths.join("、")}
                    </p>
                  )}
                  {item.source && (
                    <PlanDiff
                      key={modal.plan.id + ":" + i}
                      id={modal.plan.id}
                      index={i}
                      task={task}
                    />
                  )}
                  {item.conflict && (
                    <div className="conflict-choice">
                      <Badge tone="amber">{item.conflict}</Badge>
                      <label>
                        处理方式
                        <select
                          aria-label={`处理冲突 ${item.name}`}
                          value={
                            modal.plan.request?.resolutions?.[item.name] || ""
                          }
                          onChange={(e) =>
                            preview({
                              ...modal.plan.request,
                              resolutions: {
                                ...modal.plan.request?.resolutions,
                                [item.name]: e.target.value,
                              },
                            })
                          }
                        >
                          <option value="">请选择…</option>
                          <option value="source">采用来源版本</option>
                          <option value="skip">跳过此技能</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!modal.plan.changes && (
            <div className="success-note">
              <CheckCircle2 size={19} />
              检查通过，所选连接或内容已经一致。
            </div>
          )}
        </Modal>
      )}
      {modal?.type === "result" && (
        <Modal
          title={
            modal.result.kind === "check"
              ? "只读健康检查"
              : modal.result.failed
                ? "操作结束，部分项目需要处理"
                : "操作记录"
          }
          subtitle={`${new Date(modal.result.date).toLocaleString("zh-CN")} · ${modal.result.items.length} 项`}
          wide
          onClose={() => setModal(null)}
          footer={
            <>
              <span className="muted">
                {modal.result.kind === "check"
                  ? "检查只读取数据，不会改变文件或连接。"
                  : "可以恢复原位置，或恢复到其他文件夹进行比较。"}
              </span>
              <Btn
                variant="primary"
                onClick={() => {
                  setModal(null);
                  navigate("history");
                }}
              >
                完成
              </Btn>
            </>
          }
        >
          <div className="plan-list">
            {modal.result.metadataError && (
              <div className="notice">{modal.result.metadataError}</div>
            )}
            {modal.result.items.map((item, i) => (
              <div className="plan-row" key={i}>
                <Badge tone={item.status === "ok" ? "green" : "amber"}>
                  {item.status === "ok"
                    ? "正常"
                    : item.status === "skipped"
                      ? "提示"
                      : "需处理"}
                </Badge>
                <div>
                  <strong>
                    {item.name}{" "}
                    <small>
                      · {item.label || item.action} · {item.target}
                    </small>
                  </strong>
                  <code>{item.dest}</code>
                  {!!item.remainingPaths?.length && (
                    <p className="error-text">
                      其他可能的发现位置：{item.remainingPaths.join("、")}
                    </p>
                  )}
                  {item.error && <p className="error-text">{item.error}</p>}
                  {item.backup && (
                    <button
                      className="text-button"
                      onClick={() =>
                        task("打开备份", () =>
                          api("openPath", {
                            path:
                              item.action === "edit"
                                ? item.backup.replace(/[\\/][^\\/]+$/, "")
                                : item.backup.replace(/[\\/][^\\/]+$/, ""),
                          }),
                        )
                      }
                    >
                      <FolderOpen size={13} />
                      打开备份
                    </button>
                  )}
                  {item.backup && item.status === "ok" && (
                    <div className="recovery-actions">
                      <Btn
                        onClick={async () => {
                          const p = await task("检查恢复条件", () =>
                            api("planRestore", {
                              historyId: modal.result.id,
                              index: i,
                            }),
                          );
                          if (p) setModal({ type: "plan", plan: p });
                        }}
                      >
                        预览恢复
                      </Btn>
                      <Btn
                        onClick={async () => {
                          const copyTo = await api("chooseFolder");
                          if (!copyTo) return;
                          const p = await task("准备恢复副本", () =>
                            api("planRestore", {
                              historyId: modal.result.id,
                              index: i,
                              copyTo,
                            }),
                          );
                          if (p) setModal({ type: "plan", plan: p });
                        }}
                      >
                        恢复到其他文件夹
                      </Btn>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal?.type === "preset" && (
        <PresetEditor
          data={data}
          preset={modal.preset}
          task={task}
          refresh={refresh}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "detection" && (
        <DetectionModal
          key={modal.report.id}
          report={modal.report}
          task={task}
          onClose={() => setModal(null)}
          onRescan={autoDetect}
          onApplied={(d) => {
            setData(d);
            setModal(null);
            notify("已应用识别到的工具路径");
          }}
        />
      )}
      {modal?.type === "discovery" && (
        <Modal
          title={`${modal.data.tool.name} · 发现路径`}
          wide
          onClose={() => setModal(null)}
        >
          <DiscoveryView data={modal.data} />
        </Modal>
      )}
      {modal?.type === "update" && (
        <Modal
          title={`${modal.update.name} · 来源更新`}
          wide
          onClose={() => setModal(null)}
        >
          <UpdateView
            update={modal.update}
            task={task}
            onPlan={(plan) => setModal({ type: "plan", plan })}
          />
        </Modal>
      )}
      {modal?.type === "delete" && (
        <Modal
          title="删除所选技能"
          subtitle={`${modal.names.join("、")} 将移入恢复备份，关联的受管链接会断开。`}
          onClose={() => setModal(null)}
          footer={
            <Btn
              variant="danger"
              onClick={() =>
                preview({
                  kind: "delete",
                  names: modal.names,
                  deleteCloud: modal.deleteCloud,
                })
              }
            >
              预览删除范围
            </Btn>
          }
        >
          <label className="check-label">
            <input
              type="checkbox"
              checked={modal.deleteCloud}
              onChange={(e) => changeModal("deleteCloud", e.target.checked)}
            />
            同时移走云端备份中的同名技能
          </label>
          <p className="help-line">
            默认保留云端副本。软件会先展示全部受影响路径。
          </p>
        </Modal>
      )}
      {modal?.type === "import" && (
        <Modal
          title="导入新的技能"
          subtitle="读取包含 SKILL.md 的目录，选择技能，再导入主库。"
          wide
          onClose={() => setModal(null)}
          footer={
            <>
              <span className="muted">
                只导入文件，技能中的脚本不会在导入时执行。
              </span>
              <Btn
                variant="primary"
                disabled={!modal.loaded || !modal.names.length}
                onClick={() =>
                  preview({
                    kind: "import",
                    importId: modal.loaded.id,
                    names: modal.names,
                    toolIds: [],
                  })
                }
              >
                预览导入 {modal.names.length} 个技能
              </Btn>
            </>
          }
        >
          <div className="tabs import-tabs">
            <button
              className={modal.mode === "local" ? "active" : ""}
              onClick={() => changeModal("mode", "local")}
            >
              <Folder size={16} />
              本地文件夹
            </button>
            <button
              className={modal.mode === "github" ? "active" : ""}
              onClick={() => changeModal("mode", "github")}
            >
              <Github size={16} />
              GitHub 仓库
            </button>
          </div>
          {modal.mode === "local" ? (
            <div className="import-drop">
              <FolderOpen size={30} />
              <h3>选择一个技能，或一整组技能</h3>
              <p>支持单个技能文件夹，以及包含分类子目录的技能库。</p>
              <Btn
                onClick={async () => {
                  const p = await api("chooseFolder");
                  if (p) {
                    const loaded = await task("扫描导入目录", () =>
                      api("inspectImport", { folder: p }),
                    );
                    if (loaded)
                      setModal((m) => ({
                        ...m,
                        loaded,
                        names: loaded.skills
                          .filter((s) => !s.warning)
                          .map((s) => s.id),
                      }));
                  }
                }}
              >
                选择文件夹
              </Btn>
            </div>
          ) : (
            <div>
              <label className="field">
                GitHub 仓库
                <input
                  placeholder="owner/repo 或 https://github.com/owner/repo"
                  value={modal.repo}
                  onChange={(e) => changeModal("repo", e.target.value)}
                />
              </label>
              <div className="field-pair">
                <label className="field">
                  分支 / 标签（可选）
                  <input
                    value={modal.ref}
                    placeholder="默认分支"
                    onChange={(e) => changeModal("ref", e.target.value)}
                  />
                </label>
                <label className="field">
                  仓库内子目录（可选）
                  <input
                    value={modal.subdir}
                    placeholder="例如 skills/my-skill"
                    onChange={(e) => changeModal("subdir", e.target.value)}
                  />
                </label>
              </div>
              <Btn
                icon={Download}
                onClick={async () => {
                  const loaded = await task("正在下载仓库并读取技能", () =>
                    api("github", {
                      repo: modal.repo,
                      ref: modal.ref,
                      subdir: modal.subdir,
                    }),
                  );
                  if (loaded)
                    setModal((m) => ({
                      ...m,
                      loaded,
                      names: loaded.skills
                        .filter((s) => !s.warning)
                        .map((s) => s.id),
                    }));
                }}
              >
                加载仓库
              </Btn>
              <p className="help-line">
                GitHub 导入使用本机
                Git，仅支持公开仓库；网络不可用时可下载后从本地导入。
              </p>
            </div>
          )}
          {modal.loaded && (
            <div className="import-results">
              <div className="section-heading">
                <strong>发现 {modal.loaded.skills.length} 个技能</strong>
                <button
                  className="text-button"
                  onClick={() =>
                    changeModal(
                      "names",
                      modal.names.length
                        ? []
                        : modal.loaded.skills
                            .filter((s) => !s.warning)
                            .map((s) => s.id),
                    )
                  }
                >
                  {modal.names.length ? "取消全选" : "全选"}
                </button>
              </div>
              {modal.loaded.skills.map((s) => (
                <label className="import-skill" key={s.id}>
                  <input
                    type="checkbox"
                    disabled={!!s.warning}
                    checked={modal.names.includes(s.id)}
                    onChange={() =>
                      changeModal(
                        "names",
                        modal.names.includes(s.id)
                          ? modal.names.filter((x) => x !== s.id)
                          : [...modal.names, s.id],
                      )
                    }
                  />
                  <div>
                    <strong>{s.name}</strong>
                    <p>{s.warning || s.description}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <AlertCircle size={19} />
          <div>
            <strong>操作未完成</strong>
            <p>{error}</p>
          </div>
          <button
            className="icon-btn"
            aria-label="关闭错误提示"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-overlay" role="status">
          <div>
            <Loader2 size={20} className="spin" />
            {busy}
          </div>
        </div>
      )}
    </>
  );
}

function SyncPage({ data, preview, setModal }) {
  const [source, setSource] = useState("cloud"),
    [tools, setTools] = useState([]),
    [prune, setPrune] = useState(false),
    [names, setNames] = useState(null);
  const list = source === "cloud" ? data.cloud : data.skills;
  const chosen = names === null ? list.map((s) => s.id) : names;
  return (
    <>
      <section className="sync-panel">
        <div className="section-heading">
          <h2>同步方向</h2>
          <Badge>手动同步</Badge>
        </div>
        <div className="direction-options">
          <button
            className={source === "cloud" ? "active" : ""}
            onClick={() => {
              setSource("cloud");
              setNames(null);
              setPrune(false);
            }}
          >
            <Cloud size={23} />
            <strong>
              云端备份 <ArrowRight size={17} /> 主技能库
            </strong>
            <p>以备份目录为准，更新本机技能。</p>
          </button>
          <button
            className={source === "library" ? "active" : ""}
            onClick={() => {
              setSource("library");
              setNames(null);
              setPrune(false);
            }}
          >
            <FolderOpen size={23} />
            <strong>
              主技能库 <ArrowRight size={17} /> 云端备份
            </strong>
            <p>以本机当前修改为准，保存到备份目录。</p>
          </button>
        </div>
        <div className="sync-route">
          <div>
            <small>来源</small>
            <code>
              {source === "cloud"
                ? data.config.cloud || "尚未设置"
                : data.config.library}
            </code>
          </div>
          <ArrowRight size={20} />
          <div>
            <small>目标</small>
            <code>
              {source === "cloud"
                ? data.config.library
                : data.config.cloud || "尚未设置"}
            </code>
          </div>
        </div>
        <div className="section-heading">
          <h3>
            选择同步的技能{" "}
            <span className="muted">
              ({chosen.length} / {list.length})
            </span>
          </h3>
          <button
            className="text-button"
            onClick={() => setNames(chosen.length ? [] : null)}
          >
            {chosen.length ? "取消全选" : "全选"}
          </button>
        </div>
        <div className="sync-skill-list">
          {list.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={chosen.includes(s.id)}
                onChange={() =>
                  setNames(
                    chosen.includes(s.id)
                      ? chosen.filter((x) => x !== s.id)
                      : [...chosen, s.id],
                  )
                }
              />
              {s.name}
            </label>
          ))}
          {!list.length && (
            <p className="muted">来源目录中没有可同步的技能。</p>
          )}
        </div>
        <h3>
          同步后连接到工具 <span className="muted">（可选）</span>
        </h3>
        <div className="chip-options">
          {data.tools
            .filter((t) => !t.isSource)
            .map((t) => (
              <button
                className={tools.includes(t.id) ? "active" : ""}
                key={t.id}
                onClick={() =>
                  setTools(
                    tools.includes(t.id)
                      ? tools.filter((x) => x !== t.id)
                      : [...tools, t.id],
                  )
                }
              >
                {tools.includes(t.id) && <Check size={13} />} {t.name}
              </button>
            ))}
        </div>
        {source === "cloud" && (
          <label className="check-label advanced">
            <input
              type="checkbox"
              checked={prune}
              onChange={(e) => setPrune(e.target.checked)}
            />
            严格镜像：将主库中来源已不存在的技能移入备份（仅完整同步可用）
          </label>
        )}
        <div className="sync-bottom">
          <span>
            <ShieldCheck size={16} />
            预览后执行，替换前保留备份。
          </span>
          <Btn
            variant="primary"
            disabled={!chosen.length || !data.config.cloud}
            onClick={() =>
              preview({
                kind: "sync",
                source,
                names: chosen,
                toolIds: tools,
                prune,
              })
            }
          >
            预览同步 <ArrowRight size={16} />
          </Btn>
        </div>
      </section>
      <div className="notice">
        <Cloud size={18} />
        <div>
          同步盘由它自己的客户端上传和下载。SkillNacre
          负责本机文件同步，不直接操作 CC Switch 数据库或 WebDAV。
          <button
            className="text-button"
            onClick={() =>
              setModal({ type: "source", path: data.config.library })
            }
          >
            更换主源
          </button>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
