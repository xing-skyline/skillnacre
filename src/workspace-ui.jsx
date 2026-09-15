import React, { useEffect, useState } from "react";
import {
  Plus,
  Layers,
  RefreshCw,
  GitBranch,
  Link2,
  Check,
  Pencil,
  Trash2,
  FileDiff,
  ArrowRight,
} from "lucide-react";
import { Btn, Badge, Empty, ToolMark, Modal, cn } from "./ui.jsx";
const api = (method, args) => window.skilldock.call(method, args);
const toggle = (items, id) =>
  items.includes(id) ? items.filter((n) => n !== id) : [...items, id];

export function PresetEditor({ data, preset = {}, onClose, task, refresh }) {
  const [name, setName] = useState(preset.name || ""),
    [names, setNames] = useState(preset.names || []),
    [tools, setTools] = useState(preset.toolIds || []),
    [search, setSearch] = useState("");
  return (
    <Modal
      title={preset.id ? "编辑技能组合" : "保存技能组合"}
      subtitle="为一组技能命名，之后可一次连接到常用工具。"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted">
            已选 {names.length} 个技能 · {tools.length} 个默认工具
          </span>
          <Btn
            variant="primary"
            disabled={!name.trim() || !names.length}
            onClick={async () => {
              const p = await task("保存技能组合", () =>
                api("savePreset", {
                  id: preset.id,
                  name,
                  names,
                  toolIds: tools,
                }),
              );
              if (p) {
                await task("刷新组合", refresh);
                onClose();
              }
            }}
          >
            保存组合
          </Btn>
        </>
      }
    >
      <label className="field-label">
        组合名称
        <input
          autoFocus
          aria-label="组合名称"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：科研写作、日常处务、开发"
        />
      </label>
      <label className="field-label">
        默认连接工具<span className="muted">可以稍后再选</span>
      </label>
      <div className="preset-tools">
        {data.tools
          .filter((t) => !t.isSource)
          .map((t) => (
            <button
              key={t.id}
              className={cn("tool-chip", tools.includes(t.id) && "active")}
              onClick={() => setTools(toggle(tools, t.id))}
            >
              <ToolMark tool={t} />
              {t.name}
              {tools.includes(t.id) && <Check size={14} />}
            </button>
          ))}
      </div>
      <label className="field-label">
        选择技能
        <input
          aria-label="搜索组合技能"
          placeholder="搜索名称或功能"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="preset-skills">
        {data.skills
          .filter((s) =>
            (s.id + s.description).toLowerCase().includes(search.toLowerCase()),
          )
          .map((s) => (
            <label
              key={s.id}
              className={cn("preset-skill", names.includes(s.id) && "selected")}
            >
              <input
                aria-label={`组合选择 ${s.id}`}
                type="checkbox"
                checked={names.includes(s.id)}
                onChange={() => setNames(toggle(names, s.id))}
              />
              <span>
                <strong>{s.id}</strong>
                <small>{s.description}</small>
              </span>
            </label>
          ))}
      </div>
    </Modal>
  );
}

export function PresetsPage({ data, task, refresh, setModal }) {
  const [showMatrix, setShowMatrix] = useState(false),
    [query, setQuery] = useState("");
  return (
    <>
      <div className="section-heading">
        <div className="workspace-intro">
          <Layers size={20} />
          <span>按工作场景组织技能，组合随当前主技能库保存。</span>
        </div>
        <Btn
          icon={Plus}
          variant="primary"
          onClick={() => setModal({ type: "preset" })}
        >
          新建组合
        </Btn>
      </div>
      <div className="preset-grid">
        {data.presets.map((p) => (
          <article className="preset-card" key={p.id}>
            <div className="preset-card-heading">
              <span className="preset-symbol">
                <Layers size={24} />
              </span>
              <div>
                <h3>{p.name}</h3>
                <span className="muted">
                  {p.names.length} 个技能 · {p.toolIds.length} 个默认工具
                </span>
              </div>
            </div>
            <div className="name-chips">
              {p.names.slice(0, 6).map((n) => (
                <span
                  key={n}
                  className={
                    data.skills.some((s) => s.id === n) ? "" : "missing-chip"
                  }
                >
                  {n}
                </span>
              ))}
              {p.names.length > 6 && <span>+{p.names.length - 6}</span>}
            </div>
            <div className="preset-actions">
              <Btn
                icon={Link2}
                onClick={() =>
                  setModal({
                    type: "connect",
                    kind: "link",
                    names: p.names,
                    tools: p.toolIds.filter((id) =>
                      data.tools.some((t) => t.id === id && !t.isSource),
                    ),
                  })
                }
              >
                应用组合
              </Btn>
              <button
                className="icon-btn"
                aria-label={`编辑组合 ${p.name}`}
                onClick={() => setModal({ type: "preset", preset: p })}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-btn"
                aria-label={`删除组合 ${p.name}`}
                onClick={async () => {
                  await task("移除组合", async () => {
                    await api("deletePreset", { id: p.id });
                    await refresh();
                  });
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!data.presets.length && (
        <Empty title="把常用技能放进一个组合">
          可以从这里新建，也可以在技能库勾选后点击“存为组合”。
        </Empty>
      )}
      <section className="matrix-section">
        <div className="section-heading">
          <div>
            <h2>技能 × AI 工具</h2>
            <p className="muted">
              格内显示当前连接；小圆点表示本软件记录的上一次连接选择。
            </p>
          </div>
          <Btn onClick={() => setShowMatrix(!showMatrix)}>
            {showMatrix ? "收起矩阵" : "查看连接矩阵"}
          </Btn>
        </div>
        {showMatrix && (
          <>
            <input
              aria-label="搜索矩阵技能"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="筛选技能…"
            />
            <div className="matrix-scroll">
              <table className="skill-matrix">
                <thead>
                  <tr>
                    <th>技能</th>
                    {data.tools.map((t) => (
                      <th key={t.id} title={t.path}>
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.skills
                    .filter((s) =>
                      (s.id + s.description)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((s) => (
                      <tr key={s.id}>
                        <th title={s.description}>{s.id}</th>
                        {data.tools.map((t) => {
                          const state = t.states[s.id];
                          return (
                            <td
                              key={t.id}
                              title={`${t.name} · ${t.path}\n记录选择：${t.intent?.[s.id] === "linked" ? "连接" : t.intent?.[s.id] === "unlinked" ? "断开" : "未记录"}`}
                            >
                              <span
                                className={cn(
                                  "matrix-state",
                                  ["linked", "source"].includes(state)
                                    ? "good"
                                    : state === "missing"
                                      ? ""
                                      : "issue",
                                )}
                              >
                                {state === "linked"
                                  ? "✓"
                                  : state === "source"
                                    ? "主源"
                                    : state === "missing"
                                      ? "—"
                                      : "!"}
                              </span>
                              {t.intent?.[s.id] && (
                                <i
                                  className={cn(
                                    "intent-dot",
                                    t.intent[s.id] === "linked" && "on",
                                  )}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="matrix-legend">
              ✓ 已连接　— 未连接　! 副本或异常　●
              记录选择：绿色为连接，灰色为断开
            </div>
          </>
        )}
      </section>
    </>
  );
}

export function DiffView({ diff }) {
  return (
    <div className="diff-view">
      <div className="diff-summary">
        <FileDiff size={17} />
        {diff.files.length} 个文件有变化 · {diff.unchanged} 个文件相同
        <span className="muted">当前目标 → 来源版本</span>
      </div>
      {!diff.files.length && (
        <p className="success-note">可比较的技能内容一致。</p>
      )}
      {diff.files.map((f, i) => (
        <details className="diff-file" key={i} open={diff.files.length < 4}>
          <summary>
            <Badge tone={f.status === "deleted" ? "amber" : "green"}>
              {{ added: "新增", deleted: "删除", modified: "修改" }[f.status]}
            </Badge>
            <code>{f.name}</code>
            {f.lines && (
              <span className="diff-count">
                +{f.lines.filter((l) => l.type === "add").length} / −
                {f.lines.filter((l) => l.type === "remove").length}
              </span>
            )}
          </summary>
          {f.note ? (
            <p className="muted">{f.note}</p>
          ) : (
            <>
              {f.coarse && <p className="muted">长文以完整前后内容显示。</p>}
              <pre className="diff-lines">
                {f.lines.map((l, j) => (
                  <div className={l.type} key={j}>
                    <span className="line-number">{l.old || ""}</span>
                    <span className="line-number">{l.new || ""}</span>
                    <span className="line-sign">
                      {l.type === "add" ? "+" : l.type === "remove" ? "−" : " "}
                    </span>
                    <code>{l.text || " "}</code>
                  </div>
                ))}
              </pre>
            </>
          )}
        </details>
      ))}
    </div>
  );
}

export function PlanDiff({ id, index, task }) {
  const [diff, setDiff] = useState(null),
    [open, setOpen] = useState(false);
  return (
    <div className="inline-diff">
      <button
        className="text-button"
        onClick={async () => {
          if (!diff) {
            const d = await task("读取文件差异", () =>
              api("planDiff", { id, index }),
            );
            if (d) {
              setDiff(d);
              setOpen(true);
            }
          } else setOpen(!open);
        }}
      >
        <FileDiff size={14} />
        {open ? "收起差异" : "查看文件差异"}
      </button>
      {open && diff && <DiffView diff={diff} />}
    </div>
  );
}

export function DiscoveryView({ data }) {
  return (
    <>
      <div className="notice">{data.note}</div>
      <div className="discovery-paths">
        {data.paths.map((p) => (
          <div key={p.path}>
            <div>
              <Badge tone={p.exists ? "green" : ""}>
                {p.exists ? `${p.count} 个技能` : "目录不存在"}
              </Badge>
              <strong>{p.label}</strong>
            </div>
            <code>{p.path}</code>
            {p.error && <p className="error-text">{p.error}</p>}
          </div>
        ))}
      </div>
      <h3>
        发现的技能 <Badge>{data.skills.length}</Badge>
      </h3>
      <div className="discovery-skills">
        {data.skills.map((s) => (
          <details key={s.name}>
            <summary>
              {s.name}
              <Badge tone={s.conflict ? "amber" : ""}>
                {s.conflict
                  ? "同名内容来自不同位置"
                  : s.locations.length > 1
                    ? "多个入口指向同一份"
                    : "单一位置"}
              </Badge>
            </summary>
            {s.locations.map((l) => (
              <div key={l.path}>
                <code>{l.path}</code>
                {l.realPath !== l.path && (
                  <code className="muted">→ {l.realPath}</code>
                )}
                {l.warning && <p className="error-text">{l.warning}</p>}
              </div>
            ))}
          </details>
        ))}
      </div>
    </>
  );
}

export function OriginsPage({ data, task, setModal }) {
  const [rows, setRows] = useState(null),
    [query, setQuery] = useState("");
  const load = async () => {
    const r = await task("核对来源和本地修改", () => api("origins"));
    if (r) setRows(r);
  };
  useEffect(() => {
    load();
  }, [data.config.library]);
  return (
    <>
      <div className="source-banner">
        <span className="preset-symbol">
          <GitBranch size={25} />
        </span>
        <div>
          <strong>每份技能，都能找到来处</strong>
          <p>导入时记录来源和内容基线；检查更新后，先看差异再决定。</p>
        </div>
        <Btn icon={RefreshCw} onClick={load}>
          刷新来源
        </Btn>
      </div>
      <div className="origins-toolbar">
        <input
          aria-label="搜索技能来源"
          placeholder="搜索技能或来源仓库…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted">
          已记录来源 {rows?.filter((r) => r.kind !== "original").length || 0} /{" "}
          {rows?.length || 0}
        </span>
      </div>
      <div className="origin-list">
        {rows
          ?.filter((r) =>
            (r.name + (r.repo || "") + (r.path || ""))
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((r) => (
            <article className="origin-row" key={r.name}>
              <span className="origin-symbol">
                <GitBranch size={19} />
              </span>
              <div className="origin-content">
                <div>
                  <strong>{r.name}</strong>
                  <Badge tone={r.kind === "github" ? "purple" : ""}>
                    {
                      {
                        github: "GitHub",
                        local: "本地导入",
                        original: "已有技能",
                      }[r.kind]
                    }
                  </Badge>
                  {r.localModified && <Badge tone="amber">本地已修改</Badge>}
                </div>
                <code>
                  {r.kind === "github"
                    ? `${r.repo} · ${r.ref || "默认分支"} · ${r.subdir || "仓库根目录"}`
                    : r.path || "未记录导入来源，可重新导入以建立更新基线"}
                </code>
                {r.commit && (
                  <small className="muted">
                    导入提交 {r.commit.slice(0, 10)} ·{" "}
                    {new Date(r.installedAt).toLocaleDateString("zh-CN")}
                  </small>
                )}
              </div>
              <Btn
                disabled={r.kind === "original"}
                icon={RefreshCw}
                onClick={async () => {
                  const update = await task(`检查 ${r.name} 的来源更新`, () =>
                    api("checkUpdate", { name: r.name }),
                  );
                  if (update) setModal({ type: "update", update });
                }}
              >
                检查更新
              </Btn>
            </article>
          ))}
      </div>
    </>
  );
}

export function UpdateView({ update, task, onPlan }) {
  const [adopt, setAdopt] = useState(false);
  const conflict = ["conflict", "local"].includes(update.status);
  return (
    <>
      <div
        className={cn("notice", update.status === "current" && "success-note")}
      >
        {
          {
            current: "本地内容与来源一致。",
            update: "来源有新内容，本地没有偏离导入基线。",
            local: "本地有修改，来源仍是导入时的版本。",
            conflict: "本地与来源都已修改，请比较差异后选择。",
          }[update.status]
        }
        {update.commit && <span>来源提交 {update.commit.slice(0, 10)}</span>}
      </div>
      <DiffView diff={update.diff} />
      {conflict && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={adopt}
            onChange={(e) => setAdopt(e.target.checked)}
          />
          采用来源版本；当前本地版本将先备份
        </label>
      )}
      <div className="update-actions">
        <Btn
          variant="primary"
          disabled={
            (update.status === "current" && !update.needsBaseline) ||
            (conflict && !adopt)
          }
          icon={ArrowRight}
          onClick={async () => {
            const plan = await task("准备更新预览", () =>
              api("planUpdate", {
                id: update.id,
                resolution: adopt ? "source" : undefined,
              }),
            );
            if (plan) onPlan(plan);
          }}
        >
          {update.status === "current" ? "确认当前版本基线" : "预览更新"}
        </Btn>
      </div>
    </>
  );
}
