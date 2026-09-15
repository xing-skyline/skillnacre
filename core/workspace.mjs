import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  stat,
  same,
  inside,
  canonical,
  fingerprint,
  hash,
  atomicWrite,
  discover,
  readSkill,
} from "./files.mjs";
import { validName } from "./catalog.mjs";
import { entrySignature, treeDiff, lineDiff } from "./compare.mjs";

export class WorkspaceFeatures {
  async workspaceKey() {
    return hash((await canonical(this.config.library)).toLowerCase());
  }
  async readState() {
    const p = path.join(this.dataDir, "workspace.json");
    return (await stat(p))
      ? JSON.parse(await fs.readFile(p, "utf8"))
      : { version: 1, libraries: {}, sync: {} };
  }
  async stateForLibrary() {
    const state = await this.readState();
    return (
      state.libraries[await this.workspaceKey()] || {
        presets: [],
        origins: {},
        intent: {},
      }
    );
  }
  async mutateState(fn) {
    const state = await this.readState(),
      key = await this.workspaceKey();
    state.libraries[key] ||= { presets: [], origins: {}, intent: {} };
    await fn(state.libraries[key], state);
    await atomicWrite(
      path.join(this.dataDir, "workspace.json"),
      JSON.stringify(state, null, 2),
    );
  }
  async savePreset({ id, name, names, toolIds = [] }) {
    return this.exclusive(async () => {
      if (typeof name !== "string" || !name.trim() || name.length > 60)
        throw new Error("组合名称须为 1–60 个字");
      if (!Array.isArray(names) || !names.length)
        throw new Error("至少选择一个技能");
      names = [...new Set(names)].map(validName);
      const available = new Set(
        (await discover(this.config.library, true)).map((s) => s.id),
      );
      if (names.some((n) => !available.has(n)))
        throw new Error("部分技能已不存在，请刷新");
      if (
        !Array.isArray(toolIds) ||
        toolIds.some((id) => !this.config.tools.some((t) => t.id === id))
      )
        throw new Error("未知工具");
      const preset = {
        id: id || randomUUID(),
        name: name.trim(),
        names,
        toolIds: [...new Set(toolIds)],
      };
      await this.mutateState((s) => {
        if (id && !s.presets.some((p) => p.id === id))
          throw new Error("组合不存在");
        if (s.presets.some((p) => p.name === preset.name && p.id !== preset.id))
          throw new Error("组合名称已存在");
        s.presets = s.presets.filter((p) => p.id !== preset.id);
        s.presets.push(preset);
      });
      return preset;
    });
  }
  async deletePreset(id) {
    return this.exclusive(() =>
      this.mutateState((s) => {
        s.presets = s.presets.filter((p) => p.id !== id);
      }),
    );
  }
  async planPreset({ id, toolIds }) {
    const p = (await this.stateForLibrary()).presets.find((p) => p.id === id);
    if (!p) throw new Error("组合不存在");
    return this.plan({
      kind: "link",
      names: p.names,
      toolIds: toolIds || p.toolIds,
    });
  }
  async discovery(toolId) {
    const tool = this.config.tools.find((t) => t.id === toolId);
    if (!tool) throw new Error("未知工具");
    const roots = [
      { path: tool.path, label: "当前连接目标" },
      ...(tool.discoveryPaths || []).map((p) => ({
        path: p,
        label: "工具的全局发现路径",
      })),
    ];
    const paths = [],
      grouped = new Map();
    for (const root of roots) {
      if (paths.some((p) => same(p.path, root.path))) continue;
      let skills = [],
        error;
      try {
        skills = await discover(root.path, false);
      } catch (e) {
        error = e.message;
      }
      paths.push({
        ...root,
        exists: !!(await stat(root.path)),
        count: skills.length,
        error,
      });
      for (const skill of skills) {
        const item = grouped.get(skill.id) || { name: skill.id, locations: [] };
        item.locations.push({
          path: skill.path,
          realPath: skill.realPath,
          warning: skill.warning,
        });
        grouped.set(skill.id, item);
      }
    }
    const skills = [...grouped.values()].map((s) => ({
      ...s,
      conflict:
        new Set(s.locations.map((l) => l.realPath?.toLowerCase())).size > 1,
    }));
    return {
      tool,
      paths,
      skills,
      note:
        tool.id === "opencode"
          ? "OpenCode 还可沿项目目录发现 .opencode/skills、.claude/skills、.agents/skills；运行选项和项目环境会影响最终加载。断开一个目录的链接后，其他位置的同名技能仍可能可见。"
          : "此处检查文件系统中的全局目录。项目技能、插件、配置开关和工具实际运行结果不在本次扫描范围内。连接状态不等于实际加载状态。",
    };
  }
  async planDiff({ id, index }) {
    const plan = this.plans.get(id),
      item = plan?.items[index];
    if (!plan || Date.now() - plan.created > 600000 || !item)
      throw new Error("预览已过期，请重新预览");
    if (!item.source) throw new Error("此操作没有可比较的来源");
    if (item.action === "manifest") {
      const skill = await readSkill(item.source);
      let before = "";
      try {
        before = await fs.readFile(item.dest, "utf8");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const after =
        JSON.stringify(
          {
            name: item.name,
            version: "0.1.0",
            description: skill.description,
            skills: ["./"],
          },
          null,
          2,
        ) + "\n";
      return {
        before: item.dest,
        after: "生成的 Claude 清单",
        unchanged: 0,
        files: [
          {
            name: ".claude-plugin/plugin.json",
            status: before ? "modified" : "added",
            ...lineDiff(before, after),
          },
        ],
      };
    }
    return treeDiff(item.dest, item.source);
  }
  async planRestore({ historyId, index, copyTo }) {
    if (this.busy) throw new Error("操作进行中");
    if (
      !/^[a-zA-Z0-9-]+$/.test(historyId) ||
      !Number.isInteger(index) ||
      index < 0
    )
      throw new Error("无效备份记录");
    const history = JSON.parse(
      await fs.readFile(
        path.join(this.dataDir, "history", historyId + ".json"),
        "utf8",
      ),
    );
    const old = history.items[index];
    if (!old?.backup || old.status !== "ok" || !(await stat(old.backup)))
      throw new Error("没有可恢复的备份");
    const backupRoot = await canonical(path.join(this.dataDir, "backups"));
    if (!inside(await canonical(path.dirname(old.backup)), backupRoot))
      throw new Error("备份目录指向异常");
    let dest = old.dest;
    if (copyTo) {
      if (!path.isAbsolute(copyTo)) throw new Error("请选择完整的导出文件夹");
      dest = path.join(copyTo, path.basename(old.dest));
      const parent = await canonical(copyTo);
      if (inside(parent, await canonical(this.dataDir)))
        throw new Error("恢复位置不能与数据目录重叠");
      if (await stat(dest))
        throw new Error("恢复位置已存在同名项目，请选择空文件夹");
      if (inside(parent, await canonical(old.backup)))
        throw new Error("恢复位置与备份重叠");
    } else {
      if (!old.postEntry)
        throw new Error("旧版备份缺少恢复基线，请使用“恢复到其他文件夹”");
      if (
        !same(await canonical(path.dirname(dest)), old.parentReal) ||
        (await entrySignature(dest)) !== old.postEntry
      )
        throw new Error(
          "当前内容或目录发生变化；请使用“恢复到其他文件夹”保留当前版本",
        );
    }
    const item = {
      name: old.name,
      action: "restore",
      label: copyTo ? "恢复为副本" : "恢复备份",
      source: old.backup,
      dest,
      target: copyTo ? "所选文件夹" : old.target || "原位置",
    };
    const id = randomUUID(),
      plan = {
        id,
        kind: "restore",
        names: [old.name],
        items: [item],
        changes: 1,
        created: Date.now(),
        configHash: hash(JSON.stringify(this.config)),
        checks: [],
        entryChecks: [
          [dest, await entrySignature(dest)],
          [old.backup, await entrySignature(old.backup)],
        ],
        rootChecks: [
          [path.dirname(dest), await canonical(path.dirname(dest))],
          [path.dirname(old.backup), await canonical(path.dirname(old.backup))],
        ],
      };
    this.plans.set(id, plan);
    return plan;
  }
  async syncKey(a, b) {
    return hash(
      [await canonical(a), await canonical(b)]
        .map((p) => p.toLowerCase())
        .sort()
        .join("|"),
    );
  }
  async enrichPlan(plan, request) {
    plan.conflicts = [];
    const state = await this.readState(),
      discoveryCache = new Map();
    for (const item of plan.items) {
      if (item.action === "unlink" && item.toolId) {
        if (!discoveryCache.has(item.toolId))
          discoveryCache.set(item.toolId, await this.discovery(item.toolId));
        item.remainingPaths =
          discoveryCache
            .get(item.toolId)
            .skills.find((s) => s.name === item.name)
            ?.locations.filter((l) => !same(l.path, item.dest))
            .map((l) => l.path) || [];
      }
      if (
        plan.kind === "sync" &&
        item.source &&
        ["copy", "replace", "keep"].includes(item.action)
      ) {
        const key = await this.syncKey(item.source, item.dest),
          baseline = state.sync[key];
        const sourceHash = await fingerprint(item.source, true),
          destHash = await fingerprint(item.dest, true);
        item.syncKey = key;
        const conflict =
          item.action === "replace" &&
          (!baseline || (sourceHash !== baseline && destHash !== baseline));
        if (conflict) {
          item.conflict = baseline
            ? "主源与备份均有修改"
            : "首次比较，尚无共同同步基线";
          const choice = request.resolutions?.[item.name];
          if (choice === "skip") {
            item.action = "keep";
            item.label = "跳过冲突";
            item.skippedConflict = true;
          } else if (choice !== "source") plan.conflicts.push(item.name);
          else item.label = "采用来源并备份目标";
        }
      }
      if (
        plan.kind === "import" &&
        item.source &&
        item.target === "主技能库" &&
        ["copy", "replace", "keep"].includes(item.action)
      ) {
        const entry = this.imports.get(request.importId);
        item.origin = entry.origins?.[item.name] || {
          kind: "local",
          path: item.source,
          importedAt: new Date().toISOString(),
        };
        const known =
          state.libraries[await this.workspaceKey()]?.origins[item.name];
        if (
          item.action === "keep" &&
          (!known ||
            ["kind", "path", "repo", "ref", "subdir", "commit"].some(
              (key) => known[key] !== item.origin[key],
            ) ||
            known.baseline !== (await fingerprint(item.dest, true)))
        ) {
          item.action = "track";
          item.label = "记录导入来源";
        }
      }
    }
    const skipped = new Set(
      plan.items.filter((i) => i.skippedConflict).map((i) => i.name),
    );
    for (const item of plan.items)
      if (skipped.has(item.name)) {
        item.action = "keep";
        item.label = "跳过此技能";
        item.skippedConflict = true;
      }
    plan.resolutions = request.resolutions || {};
    plan.request = request;
    plan.changes = plan.items.filter((i) => i.action !== "keep").length;
    return plan;
  }
  async afterExecution(plan, result) {
    await this.mutateState(async (s, state) => {
      for (const item of result.items) {
        if (item.status !== "ok" || item.skippedConflict) continue;
        if (item.toolId && ["link", "unlink", "keep"].includes(item.action)) {
          s.intent[item.toolId] ||= {};
          s.intent[item.toolId][item.name] =
            item.action === "unlink" ? "unlinked" : "linked";
        }
        if (item.syncKey && !item.skippedConflict) {
          const a = await fingerprint(item.source, true),
            b = await fingerprint(item.dest, true);
          if (a === b) state.sync[item.syncKey] = a;
        }
        if (item.origin) {
          s.origins[item.name] = {
            ...item.origin,
            baseline: await fingerprint(item.dest, true),
            installedAt: new Date().toISOString(),
          };
        }
      }
    });
  }
  async origins() {
    const state = await this.stateForLibrary(),
      skills = await discover(this.config.library, true),
      rows = [];
    for (const skill of skills) {
      const origin = state.origins[skill.id];
      rows.push({
        name: skill.id,
        ...(origin || { kind: "original" }),
        localModified: origin
          ? (await fingerprint(skill.realPath, true)) !== origin.baseline
          : false,
      });
    }
    return rows;
  }
  async checkUpdate(name) {
    validName(name);
    const origin = (await this.stateForLibrary()).origins[name];
    if (!origin) throw new Error("此技能没有记录导入来源");
    const local = await this.detail(name);
    let imported;
    if (origin.kind === "github")
      imported = await this.github({
        repo: origin.repo,
        ref: origin.ref,
        subdir: origin.subdir,
      });
    else imported = await this.inspectImport(origin.path);
    const entry = this.imports.get(imported.id),
      candidate = entry.skills.find((s) => s.id === name);
    if (!candidate || candidate.warning)
      throw new Error(candidate?.warning || "来源中已没有同名技能");
    const localHash = await fingerprint(local.realPath, true),
      upstreamHash = await fingerprint(candidate.realPath, true);
    const localChanged = localHash !== origin.baseline,
      upstreamChanged = upstreamHash !== origin.baseline;
    const status =
      localHash === upstreamHash
        ? "current"
        : localChanged && upstreamChanged
          ? "conflict"
          : upstreamChanged
            ? "update"
            : "local";
    this.updates ||= new Map();
    const id = randomUUID(),
      record = {
        id,
        name,
        status,
        localHash,
        upstreamHash,
        importId: imported.id,
        created: Date.now(),
        libraryKey: await this.workspaceKey(),
        commit: entry.origins?.[name]?.commit,
        needsBaseline:
          localHash !== origin.baseline ||
          (entry.origins?.[name]?.commit &&
            entry.origins[name].commit !== origin.commit),
      };
    this.updates.set(id, record);
    if (this.updates.size > 100)
      this.updates.delete(this.updates.keys().next().value);
    return {
      ...record,
      diff: await treeDiff(local.realPath, candidate.realPath),
    };
  }
  async planUpdate({ id, resolution }) {
    const update = this.updates?.get(id);
    if (
      !update ||
      Date.now() - update.created > 600000 ||
      update.libraryKey !== (await this.workspaceKey())
    )
      throw new Error("更新检查已过期，请重新检查");
    const local = await this.detail(update.name);
    if ((await fingerprint(local.realPath, true)) !== update.localHash)
      throw new Error("本地内容发生变化，请重新检查更新");
    const candidate = this.imports
      .get(update.importId)
      ?.skills.find((s) => s.id === update.name);
    if (
      !candidate ||
      (await fingerprint(candidate.realPath, true)) !== update.upstreamHash
    )
      throw new Error("来源内容发生变化，请重新检查更新");
    if (
      ["conflict", "local"].includes(update.status) &&
      resolution !== "source"
    )
      throw new Error("存在本地修改冲突，请明确选择采用来源版本");
    return this.plan({
      kind: "import",
      names: [update.name],
      importId: update.importId,
    });
  }
}
