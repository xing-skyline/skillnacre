import React, { useState } from "react";
import { ScanSearch, Check, RefreshCw, FolderSearch } from "lucide-react";
import { Modal, Btn, Badge, ToolMark, cn } from "./ui.jsx";
const api = (method, args) => window.skilldock.call(method, args);

export function DetectionModal({ report, task, onClose, onRescan, onApplied }) {
  const [choices, setChoices] = useState(
    Object.fromEntries(report.tools.map((t) => [t.id, t.recommended || ""])),
  );
  const [enabled, setEnabled] = useState(
    report.tools
      .filter((t) => {
        const recommended = t.candidates.find((c) => c.path === t.recommended);
        return (
          recommended &&
          (!recommended.shared || t.commandPath) &&
          (t.status === "found" || recommended.path === t.path)
        );
      })
      .map((t) => t.id),
  );
  const found = report.tools.filter((t) =>
    t.candidates.some((c) => !c.error),
  ).length;
  return (
    <Modal
      title="自动识别 AI 工具路径"
      subtitle="从本机常见位置、环境变量、配置档案和启动命令中寻找技能目录。"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted">
            已选 {enabled.length} 个工具 · 仅更新路径设置
          </span>
          <Btn
            variant="primary"
            icon={Check}
            disabled={!enabled.length}
            onClick={async () => {
              const data = await task("应用识别到的路径", () =>
                api("applyDetectedPaths", {
                  id: report.id,
                  paths: Object.fromEntries(
                    enabled.map((id) => [id, choices[id]]),
                  ),
                }),
              );
              if (data) onApplied(data);
            }}
          >
            应用所选路径
          </Btn>
        </>
      }
    >
      <div className="detection-summary">
        <span className="preset-symbol">
          <ScanSearch size={26} />
        </span>
        <div>
          <strong>
            找到 {found} / {report.tools.length} 个工具的候选目录
          </strong>
          <p>多个位置时可切换候选。共享目录只说明技能文件存在。</p>
        </div>
        <Btn icon={RefreshCw} onClick={onRescan}>
          重新扫描
        </Btn>
      </div>
      <div className="detection-list">
        {report.tools.map((t) => {
          const selected = enabled.includes(t.id),
            candidate = t.candidates.find((c) => c.path === choices[t.id]);
          const usable = t.candidates.filter((c) => !c.error);
          return (
            <article
              className={cn("detection-row", selected && "selected")}
              key={t.id}
            >
              <div className="detection-row-head">
                <input
                  type="checkbox"
                  aria-label={`应用 ${t.name} 识别路径`}
                  disabled={!usable.length}
                  checked={selected}
                  onChange={() =>
                    setEnabled(
                      selected
                        ? enabled.filter((id) => id !== t.id)
                        : [...enabled, t.id],
                    )
                  }
                />
                <ToolMark tool={t} />
                <strong>{t.name}</strong>
                <Badge
                  tone={
                    t.status === "found"
                      ? "green"
                      : t.status === "multiple"
                        ? "purple"
                        : ""
                  }
                >
                  {t.status === "found"
                    ? "找到目录"
                    : t.status === "multiple"
                      ? `${usable.length} 个候选`
                      : "未发现目录"}
                </Badge>
                {t.commandPath && (
                  <span className="command-found" title={t.commandPath}>
                    发现启动命令
                  </span>
                )}
              </div>
              {usable.length ? (
                <div className="detection-choice">
                  <select
                    aria-label={`${t.name} 技能路径`}
                    value={choices[t.id]}
                    onChange={(e) => {
                      setChoices({ ...choices, [t.id]: e.target.value });
                      if (!selected) setEnabled([...enabled, t.id]);
                    }}
                  >
                    {usable.map((c) => (
                      <option key={c.path} value={c.path}>
                        {c.path} · {c.count} 个技能
                      </option>
                    ))}
                  </select>
                  <div className="detection-evidence">
                    <span>{candidate.reasons.join(" · ")}</span>
                    <Badge tone={candidate.exists ? "green" : "amber"}>
                      {candidate.exists
                        ? `${candidate.count} 个技能`
                        : "技能目录尚未创建"}
                    </Badge>
                    {candidate.shared && <Badge>共享位置</Badge>}
                    {candidate.scope === "profile" && <Badge>独立档案</Badge>}
                    {candidate.scope === "workspace" && <Badge>工作区</Badge>}
                    {candidate.path === t.path && <Badge>当前路径</Badge>}
                  </div>
                  {candidate.realPath !== candidate.path && (
                    <code className="detection-real">
                      实际位置 → {candidate.realPath}
                    </code>
                  )}
                </div>
              ) : (
                <div className="detection-empty">
                  <FolderSearch size={15} />
                  <span>未找到可用位置，可以在设置中手动指定。</span>
                </div>
              )}
              {t.warnings.map((w, i) => (
                <p className="detection-warning" key={i}>
                  {w}
                </p>
              ))}
              {t.candidates
                .filter((c) => c.error)
                .map((c) => (
                  <p className="detection-warning" key={c.path}>
                    {c.path} · {c.error}
                  </p>
                ))}
            </article>
          );
        })}
      </div>
      <p className="help-line">
        扫描只读取目录和路径配置。应用后，在技能库选择技能并连接，才会生成软链接。未扫描
        WSL 内部和整块磁盘。
      </p>
    </Modal>
  );
}
