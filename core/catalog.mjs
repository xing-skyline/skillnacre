import os from "node:os";
import path from "node:path";

export function defaults(home = os.homedir(), env = process.env) {
  const at = (...parts) => path.join(home, ...parts);
  const tools = [
    [
      "claude",
      "Claude Code",
      "CL",
      env.CLAUDE_CONFIG_DIR || at(".claude"),
      "#be7858",
      "https://code.claude.com/docs/en/skills",
    ],
    [
      "codex",
      "Codex",
      "CX",
      env.CODEX_HOME || at(".codex"),
      "#5e71d3",
      "https://developers.openai.com/codex/skills/",
    ],
    ["grok", "Grok Build", "GK", env.GROK_HOME || at(".grok"), "#636575", ""],
    [
      "opencode",
      "OpenCode",
      "OC",
      at(".config", "opencode"),
      "#61967b",
      "https://opencode.ai/docs/skills/",
    ],
    [
      "cursor",
      "Cursor",
      "CU",
      at(".cursor"),
      "#6b748d",
      "https://cursor.com/docs/context/skills",
    ],
    [
      "hermes",
      "Hermes Agent",
      "HE",
      env.HERMES_HOME || at(".hermes"),
      "#b19556",
      "https://hermes-agent.nousresearch.com/docs/user-guide/features/skills",
    ],
    [
      "openclaw",
      "OpenClaw",
      "OW",
      env.OPENCLAW_STATE_DIR || at(".openclaw"),
      "#c67770",
      "https://docs.openclaw.ai/tools/skills",
    ],
    [
      "dsh",
      "DSH / 通用 Agents",
      "DS",
      env.DSH_AGENTS_HOME || at(".agents"),
      "#8b7db5",
      "",
    ],
    [
      "copilot",
      "GitHub Copilot",
      "GH",
      at(".copilot"),
      "#777c91",
      "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference",
    ],
    [
      "windsurf",
      "Windsurf",
      "WS",
      at(".codeium", "windsurf"),
      "#4d9c9b",
      "https://docs.windsurf.com/windsurf/cascade/skills",
    ],
    ["ccswitch", "CC Switch", "CC", at(".cc-switch"), "#9775cb", ""],
  ].map(([id, name, initials, root, color, docs]) => ({
    id,
    name,
    initials,
    path: path.join(root, "skills"),
    color,
    docs,
    discoveryPaths:
      id === "opencode"
        ? [
            at(".config", "opencode", "skills"),
            at(".claude", "skills"),
            at(".agents", "skills"),
          ]
        : id === "codex"
          ? [at(".agents", "skills")]
          : [],
  }));
  return {
    library: at(".cc-switch", "skills"),
    cloud: env.SKILL_SYNC_NUTSTORE_ROOT || "",
    tools,
    favorites: [],
  };
}

export const ignored = (name) =>
  [".git", "__pycache__", ".DS_Store", "node_modules"].includes(name) ||
  /\.pyc$|\.bak\./.test(name);
export const protectedName = (name) =>
  name.startsWith(".") ||
  ["_archived", "bundled", "plugins", "skills-cursor"].includes(name);
export function validName(name) {
  if (
    typeof name !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name) ||
    protectedName(name)
  )
    throw new Error(`无效或受保护的技能名称：${name}`);
  return name;
}
