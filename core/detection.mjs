import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import JSON5 from "json5";
import { defaults } from "./catalog.mjs";
import { stat, same, canonical, discover, hash } from "./files.mjs";

const commands = {
  claude: ["claude"],
  codex: ["codex"],
  grok: ["grok"],
  opencode: ["opencode"],
  cursor: ["cursor"],
  hermes: ["hermes"],
  openclaw: ["openclaw"],
  dsh: ["dsh"],
  copilot: ["copilot"],
  windsurf: ["windsurf"],
  ccswitch: ["cc-switch", "CC-Switch"],
};
const variables = {
  claude: "CLAUDE_CONFIG_DIR",
  codex: "CODEX_HOME",
  grok: "GROK_HOME",
  opencode: "OPENCODE_CONFIG_DIR",
  hermes: "HERMES_HOME",
  openclaw: "OPENCLAW_STATE_DIR",
  dsh: "DSH_AGENTS_HOME",
};
const markers = {
  claude: ["settings.json", "projects", "plugins"],
  codex: ["config.toml", "auth.json", "sessions"],
  grok: ["settings.json", "config.json", "sessions"],
  opencode: ["opencode.json", "opencode.jsonc", "config.json"],
  cursor: ["mcp.json", "extensions"],
  hermes: ["config.yaml", "profiles", "SOUL.md"],
  openclaw: ["openclaw.json", "workspace"],
  dsh: ["AGENTS.md"],
  copilot: ["config.json"],
  windsurf: ["mcp_config.json"],
  ccswitch: ["cc-switch.db", "settings.json"],
};

function expand(value, home, env) {
  if (typeof value !== "string" || !value.trim()) return null;
  let p = value.trim().replace(/^~(?=[\\/]|$)/, home);
  p = p.replace(/\$\{(\w+)\}|%(\w+)%/g, (match, a, b) => env[a || b] || match);
  return path.isAbsolute(p) ? path.normalize(p) : null;
}
async function commandPath(id, env) {
  const dirs = (env.PATH || env.Path || "")
    .split(path.delimiter)
    .filter(Boolean)
    .slice(0, 150);
  const extensions =
    process.platform === "win32" ? [".exe", ".cmd", ".bat", ".com", ""] : [""];
  for (const dir of dirs) {
    if (!path.isAbsolute(dir)) continue;
    for (const command of commands[id] || [])
      for (const ext of extensions) {
        const p = path.join(dir, command + ext);
        try {
          if ((await stat(p))?.isFile()) return p;
        } catch {}
      }
  }
  return null;
}

export async function detectPaths(service) {
  const { home, env } = service.runtime;
  const standard = defaults(home, {}).tools,
    environment = defaults(home, env).tools;
  const results = [];
  for (const tool of service.config.tools) {
    const proposed = [],
      warnings = [],
      launchPath = await commandPath(tool.id, env);
    const add = (
      value,
      reason,
      priority,
      { scope = "global", shared = false, knownRoot = false } = {},
    ) => {
      const p = expand(value, home, env);
      if (!p) return;
      const existing = proposed.find((c) => same(c.path, p));
      if (existing) {
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        existing.priority = Math.max(existing.priority, priority);
        existing.knownRoot ||= knownRoot;
        existing.shared ||= shared;
        if (scope !== "global") existing.scope = scope;
        return;
      }
      proposed.push({
        path: p,
        reasons: [reason],
        priority,
        scope,
        shared,
        knownRoot,
      });
    };
    add(tool.path, "当前配置", 140);
    const builtin = standard.find((t) => t.id === tool.id),
      byEnv = environment.find((t) => t.id === tool.id);
    if (builtin) add(builtin.path, "标准位置", 90, { knownRoot: true });
    if (byEnv && variables[tool.id] && env[variables[tool.id]])
      add(byEnv.path, "环境变量 " + variables[tool.id], 130, {
        knownRoot: true,
      });
    for (const p of builtin?.discoveryPaths || [])
      add(p, "兼容 / 共享发现目录", 55, {
        shared: !same(p, builtin.path),
        knownRoot: false,
      });
    if (tool.id === "opencode") {
      if (env.OPENCODE_CONFIG_DIR)
        add(
          path.join(env.OPENCODE_CONFIG_DIR, "skills"),
          "环境变量 OPENCODE_CONFIG_DIR",
          130,
          { knownRoot: true },
        );
      if (env.XDG_CONFIG_HOME)
        add(
          path.join(env.XDG_CONFIG_HOME, "opencode", "skills"),
          "环境变量 XDG_CONFIG_HOME",
          120,
          { knownRoot: true },
        );
    }
    if (tool.id === "hermes") {
      const roots = [
        path.join(home, ".hermes"),
        ...(env.HERMES_HOME ? [env.HERMES_HOME] : []),
      ];
      for (const root of roots) {
        const profiles = path.join(root, "profiles");
        try {
          for (const ent of (
            await fs.readdir(profiles, { withFileTypes: true })
          ).slice(0, 50))
            if (ent.isDirectory())
              add(
                path.join(profiles, ent.name, "skills"),
                "Hermes 档案 · " + ent.name,
                80,
                { scope: "profile", knownRoot: true },
              );
        } catch (e) {
          if (e.code !== "ENOENT")
            warnings.push("部分 Hermes 档案目录无法读取");
        }
      }
    }
    const readConfig = async (file) => {
      try {
        const s = await stat(file);
        if (!s) return null;
        if ((await fs.stat(file)).size > 1_000_000) {
          warnings.push("配置过大，已跳过路径读取：" + file);
          return null;
        }
        return JSON5.parse(await fs.readFile(file, "utf8"));
      } catch {
        warnings.push("无法解析配置中的路径：" + file);
        return null;
      }
    };
    if (tool.id === "openclaw") {
      const state =
        expand(env.OPENCLAW_STATE_DIR, home, env) ||
        path.join(home, ".openclaw");
      add(path.join(state, "workspace", "skills"), "默认 OpenClaw 工作区", 75, {
        scope: "workspace",
      });
      const file = expand(
        env.OPENCLAW_CONFIG_PATH || path.join(state, "openclaw.json"),
        home,
        env,
      );
      const cfg = file ? await readConfig(file) : null;
      const workspaces = [
        cfg?.agents?.defaults?.workspace,
        ...(Array.isArray(cfg?.agents?.list)
          ? cfg.agents.list.map((a) => a?.workspace)
          : []),
        ...Object.values(cfg?.agents?.entries || {}).map((a) => a?.workspace),
      ];
      for (const value of workspaces) {
        const p = expand(value, home, env);
        if (p) {
          add(path.join(p, "skills"), "OpenClaw 工作区配置", 85, {
            scope: "workspace",
          });
          add(path.join(p, ".agents", "skills"), "OpenClaw 工作区 Agents", 70, {
            scope: "workspace",
          });
        }
      }
      for (const value of Array.isArray(cfg?.skills?.load?.extraDirs)
        ? cfg.skills.load.extraDirs
        : [])
        add(value, "OpenClaw 额外技能目录", 70, { scope: "extra" });
    }
    if (tool.id === "opencode") {
      const configRoot =
        expand(
          env.OPENCODE_CONFIG_DIR ||
            path.join(
              env.XDG_CONFIG_HOME || path.join(home, ".config"),
              "opencode",
            ),
          home,
          env,
        ) || path.join(home, ".config", "opencode");
      const files = [
        path.join(configRoot, "opencode.json"),
        path.join(configRoot, "opencode.jsonc"),
      ];
      if (env.OPENCODE_CONFIG) {
        const p = expand(env.OPENCODE_CONFIG, home, env);
        if (p) files.push(p);
      }
      for (const file of [...new Set(files)]) {
        const cfg = await readConfig(file);
        for (const value of Array.isArray(cfg?.skills?.paths)
          ? cfg.skills.paths
          : [])
          add(value, "OpenCode 额外技能目录", 70, { scope: "extra" });
      }
    }
    const candidates = [];
    for (const p of proposed) {
      try {
        const s = await stat(p.path),
          exists = !!s;
        if (exists && !(await fs.stat(p.path)).isDirectory()) {
          warnings.push("路径不是文件夹：" + p.path);
          continue;
        }
        const parent = path.dirname(p.path);
        let configTrace = false;
        for (const marker of markers[tool.id] || [])
          if (await stat(path.join(parent, marker))) {
            configTrace = true;
            break;
          }
        if (
          !exists &&
          !configTrace &&
          !(launchPath && p.knownRoot && p.scope === "global")
        )
          continue;
        let skills = [],
          error;
        if (exists)
          try {
            skills = await discover(p.path, true);
          } catch (e) {
            error = e.message;
          }
        candidates.push({
          ...p,
          realPath: await canonical(p.path),
          exists,
          configTrace,
          count: skills.length,
          error,
          score: p.priority + (exists ? 100 : 0) + (skills.length ? 40 : 0),
        });
      } catch {
        warnings.push("目录无法读取或链接失效：" + p.path);
      }
    }
    candidates.sort(
      (a, b) => b.score - a.score || a.path.localeCompare(b.path),
    );
    const usable = candidates.filter((c) => !c.error),
      preferred = usable[0] || null;
    results.push({
      ...tool,
      commandPath: launchPath,
      candidates,
      recommended: preferred?.path || null,
      warnings,
      status: !usable.length
        ? "missing"
        : new Set(usable.map((c) => c.realPath.toLowerCase())).size > 1
          ? "multiple"
          : "found",
    });
  }
  const report = {
    id: randomUUID(),
    scannedAt: new Date().toISOString(),
    tools: results,
    configHash: hash(JSON.stringify(service.config)),
  };
  service.detections ||= new Map();
  service.detections.set(report.id, report);
  if (service.detections.size > 10)
    service.detections.delete(service.detections.keys().next().value);
  return report;
}

export async function applyDetectedPaths(service, { id, paths }) {
  const report = service.detections?.get(id);
  if (!report || Date.now() - Date.parse(report.scannedAt) > 600000)
    throw new Error("识别结果已过期，请重新扫描");
  if (report.configHash !== hash(JSON.stringify(service.config)))
    throw new Error("设置发生变化，请重新扫描");
  if (
    !paths ||
    typeof paths !== "object" ||
    Array.isArray(paths) ||
    !Object.keys(paths).length
  )
    throw new Error("请勾选要应用的工具");
  for (const [toolId, p] of Object.entries(paths)) {
    const candidate = report.tools
      .find((t) => t.id === toolId)
      ?.candidates.find((c) => same(c.path, p) && !c.error);
    if (!candidate) throw new Error("所选路径不是本次识别的有效候选");
    if (
      !same(await canonical(p), candidate.realPath) ||
      !!(await stat(p)) !== candidate.exists
    )
      throw new Error("候选目录发生变化，请重新扫描");
  }
  return service.saveConfig({
    ...service.config,
    tools: service.config.tools.map((t) => ({
      ...t,
      path: paths[t.id] || t.path,
    })),
  });
}
