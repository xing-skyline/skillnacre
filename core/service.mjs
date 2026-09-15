import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { detectPaths, applyDetectedPaths } from "./detection.mjs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defaults, protectedName, validName } from "./catalog.mjs";
import { WorkspaceFeatures } from "./workspace.mjs";
import { entrySignature } from "./compare.mjs";
import { lockStatus, recoverJournals, pendingJournals } from "./recovery.mjs";
import {
  stat,
  same,
  inside,
  canonical,
  metadata,
  readSkill,
  discover,
  fingerprint,
  atomicWrite,
  copyTree,
  movePreserving,
  linkStatus,
  hash,
} from "./files.mjs";
export { defaults };
const run = promisify(execFile);
const labels = {
  link: "建立链接",
  keep: "保持不动",
  replace: "备份并替换",
  copy: "复制技能",
  remove: "移入备份",
  unlink: "断开链接",
  manifest: "修复 Claude 清单",
};

export class SkillService extends WorkspaceFeatures {
  constructor(
    dataDir,
    initial = defaults(),
    runtime = { home: os.homedir(), env: process.env },
  ) {
    super();
    this.dataDir = dataDir;
    this.runtime = runtime;
    this.config = initial;
    this.plans = new Map();
    this.imports = new Map();
    this.busy = false;
    this.makeSymlink = (source, dest) => fs.symlink(source, dest, "dir");
  }
  async init() {
    const defaultTools = this.config.tools;
    await fs.mkdir(this.dataDir, { recursive: true });
    const p = path.join(this.dataDir, "settings.json");
    if (await stat(p))
      this.config = {
        ...this.config,
        ...JSON.parse(await fs.readFile(p, "utf8")),
      };
    this.config.tools = this.config.tools.map((t) => ({
      ...t,
      discoveryPaths:
        t.discoveryPaths ??
        defaultTools.find((d) => d.id === t.id)?.discoveryPaths ??
        [],
    }));
    await this.validateConfig(this.config);
  }
  async detectPaths() {
    return detectPaths(this);
  }
  async applyDetectedPaths(request) {
    return applyDetectedPaths(this, request);
  }
  async validateConfig(config) {
    if (
      !config ||
      !path.isAbsolute(config.library || "") ||
      !Array.isArray(config.tools)
    )
      throw new Error("请选择主技能库的绝对路径");
    if (config.cloud && !path.isAbsolute(config.cloud))
      throw new Error("备份目录必须使用绝对路径");
    const roots = [
      ["主技能库", config.library],
      ...(config.cloud ? [["云端备份", config.cloud]] : []),
      ...config.tools.map((t) => [t.name, t.path]),
    ];
    const ids = new Set();
    for (const t of config.tools) {
      validName(t.id);
      if (ids.has(t.id)) throw new Error("工具 ID 重复");
      ids.add(t.id);
      if (!t.name || !path.isAbsolute(t.path || ""))
        throw new Error("请填写工具名称和完整路径");
    }
    for (const [label, p] of roots) {
      if (same(p, path.parse(p).root))
        throw new Error(`${label}不能使用磁盘根目录`);
      if ((await stat(p)) && !(await fs.stat(p)).isDirectory())
        throw new Error(`${label}必须是文件夹`);
      if (
        inside(await canonical(this.dataDir), await canonical(p)) ||
        inside(await canonical(p), await canonical(this.dataDir))
      )
        throw new Error("技能目录不能与软件数据目录重叠");
    }
    for (let i = 0; i < roots.length; i++)
      for (let j = i + 1; j < roots.length; j++) {
        const a = await canonical(roots[i][1]),
          b = await canonical(roots[j][1]);
        // A tool may itself be the selected source. Two tools can share an identical root.
        if (
          same(a, b) &&
          roots[i][0] !== "云端备份" &&
          roots[j][0] !== "云端备份"
        )
          continue;
        if (inside(a, b) || inside(b, a))
          throw new Error(`目录重叠：${roots[i][0]} 与 ${roots[j][0]}`);
      }
  }
  async saveConfig(config) {
    if (this.busy) throw new Error("操作进行中，请稍后更改设置");
    await this.validateConfig(config);
    await atomicWrite(
      path.join(this.dataDir, "settings.json"),
      JSON.stringify(config, null, 2),
    );
    this.config = config;
    this.plans.clear();
    return this.snapshot();
  }
  async snapshot() {
    const workspace = await this.stateForLibrary();
    const warnings = [],
      tools = [];
    const scan = async (root, label) => {
      try {
        return await discover(root, true);
      } catch (e) {
        warnings.push(`${label}：${e.message}`);
        return [];
      }
    };
    const skills = await scan(this.config.library, "主技能库");
    for (const t of this.config.tools) {
      const states = {};
      for (const s of skills)
        states[s.id] = await linkStatus(path.join(t.path, s.id), s.path);
      let entries = [];
      if (await stat(t.path)) entries = await fs.readdir(t.path);
      const extras = entries.filter(
        (n) => !protectedName(n) && !skills.some((s) => s.id === n),
      );
      let markers = [];
      if (await stat(path.dirname(t.path)))
        markers = (await fs.readdir(path.dirname(t.path))).filter(
          (n) => !["skills", "runtime-backups"].includes(n),
        );
      tools.push({
        ...t,
        intent: workspace.intent[t.id] || {},
        states,
        extras,
        detected: markers.length > 0,
        exists: !!(await stat(t.path)),
        isSource: same(
          await canonical(t.path),
          await canonical(this.config.library),
        ),
        linked: Object.values(states).filter(
          (s) => s === "linked" || s === "source",
        ).length,
        issues: Object.values(states).filter((s) =>
          ["copy", "broken", "wrong"].includes(s),
        ).length,
      });
    }
    const cloud = await scan(this.config.cloud, "云端备份");
    const categories = new Map(cloud.map((s) => [s.id, s.category]));
    return {
      config: this.config,
      presets: workspace.presets,
      recovery: {
        lock: await lockStatus(this.dataDir),
        pending: await pendingJournals(this.dataDir),
      },
      warnings,
      skills: skills.map(({ content, body, ...s }) => ({
        ...s,
        category: s.category || categories.get(s.id) || "未分类",
      })),
      tools,
      cloud: cloud.map(({ content, body, ...s }) => s),
      libraryExists: !!(await stat(this.config.library)),
      dataDir: this.dataDir,
      history: await this.history(),
    };
  }
  async detail(name, source = "library") {
    validName(name);
    const list = await discover(
      source === "cloud" ? this.config.cloud : this.config.library,
      true,
    );
    const found = list.find((s) => s.id === name);
    if (!found) throw new Error("技能已不存在，请刷新");
    const files = [];
    const real = await fs.realpath(found.path);
    async function walk(p, prefix = "", depth = 0) {
      if (depth > 5 || files.length > 500) return;
      for (const e of await fs.readdir(p, { withFileTypes: true })) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        const r = prefix + e.name;
        files.push({
          name: r,
          directory: e.isDirectory(),
          link: e.isSymbolicLink(),
        });
        if (e.isDirectory())
          await walk(path.join(p, e.name), r + "/", depth + 1);
      }
    }
    await walk(real);
    return { ...(await readSkill(found.path, false)), files };
  }
  async saveSkill(name, content, expectedHash) {
    return this.exclusive(async () => {
      validName(name);
      if (typeof content !== "string" || content.length > 2_000_000)
        throw new Error("内容过大");
      const meta = metadata(content);
      if (meta.name !== name) throw new Error("name 必须与当前技能目录一致");
      const current = await this.detail(name);
      if (current.hash !== expectedHash)
        throw new Error("文件发生变化，请重新打开后编辑");
      const p = path.join(current.realPath, "SKILL.md");
      const id = randomUUID();
      const item = { name, dest: p, action: "edit", target: "主技能库" };
      const result = {
        id,
        kind: "edit",
        date: new Date().toISOString(),
        failed: 0,
        items: [],
        phase: "running",
      };
      await this.record(result);
      try {
        const applied = await this.applyItem({ ...item, content }, id, 0);
        result.items = [
          {
            ...item,
            ...applied,
            status: "ok",
            postEntry: await entrySignature(p),
            parentReal: await canonical(path.dirname(p)),
          },
        ];
      } catch (e) {
        result.failed = 1;
        result.items = [{ ...item, status: "failed", error: e.message }];
        throw e;
      } finally {
        result.phase = "complete";
        await this.record(result);
      }
      return this.detail(name);
    });
  }
  async plan(request) {
    if (this.busy) throw new Error("操作进行中");
    const {
      kind,
      source = "cloud",
      toolIds = [],
      deleteCloud = false,
      prune = false,
    } = request;
    if (!["link", "unlink", "sync", "delete", "import"].includes(kind))
      throw new Error("不支持的操作");
    if (!Array.isArray(toolIds) || !Array.isArray(request.names))
      throw new Error("请选择技能和工具");
    const names = [...new Set(request.names)].map(validName);
    if (!names.length) throw new Error("请至少选择一个技能");
    const tools = [...new Set(toolIds)].map((id) => {
      const t = this.config.tools.find((t) => t.id === id);
      if (!t) throw new Error("未知工具");
      return t;
    });
    if (["link", "unlink"].includes(kind) && !tools.length)
      throw new Error("请至少选择一个目标工具");
    if (kind === "sync" && !["cloud", "library"].includes(source))
      throw new Error("同步来源无效");
    if ((kind === "sync" || deleteCloud) && !this.config.cloud)
      throw new Error("请先设置云端备份目录");
    const library = new Map(
      (await discover(this.config.library, true)).map((s) => [s.id, s]),
    );
    const cloud = new Map(
      (kind === "sync" || deleteCloud || prune
        ? await discover(this.config.cloud, true)
        : []
      ).map((s) => [s.id, s]),
    );
    let imported = new Map();
    if (kind === "import") {
      const entry = this.imports.get(request.importId);
      if (!entry) throw new Error("请重新加载导入目录");
      imported = new Map(entry.skills.map((s) => [s.id, s]));
    }
    const items = [],
      checks = new Map();
    const check = async (p) => {
      if (p && !checks.has(p)) checks.set(p, await fingerprint(p));
    };
    const add = async (item) => {
      if (items.some((i) => same(i.dest, item.dest))) return;
      await check(item.dest);
      await check(item.source);
      items.push({ ...item, label: labels[item.action] });
    };
    for (const name of names) {
      let central =
        library.get(name)?.path || path.join(this.config.library, name);
      let sourcePath = central;
      if (kind === "sync" || kind === "import") {
        const from =
          kind === "import"
            ? imported.get(name)
            : source === "cloud"
              ? cloud.get(name)
              : library.get(name);
        if (!from) throw new Error(`来源中没有技能：${name}`);
        if (from.warning)
          throw new Error(`来源技能需要处理：${name} · ${from.warning}`);
        await readSkill(from.path);
        const dest =
          kind === "import" || source === "cloud"
            ? central
            : cloud.get(name)?.path ||
              path.join(this.config.cloud, "00-待分类", name);
        const realFrom = await fs.realpath(from.path),
          realDest = await canonical(dest);
        if (same(realFrom, realDest))
          throw new Error(`来源和目标指向同一目录：${name}`);
        if (inside(realFrom, realDest) || inside(realDest, realFrom))
          throw new Error(`来源与目标重叠：${name}`);
        if ((await stat(dest))?.isSymbolicLink())
          throw new Error(
            `复制目标 ${dest} 是软链接。请选择真实目录作为主技能库或备份目录后重试。`,
          );
        const action =
          (await fingerprint(realFrom, true)) ===
          (await fingerprint(dest, true))
            ? "keep"
            : (await stat(dest))
              ? "replace"
              : "copy";
        await add({
          name,
          source: realFrom,
          dest,
          action,
          target:
            kind === "import" || source === "cloud" ? "主技能库" : "云端备份",
        });
        if (kind === "import" || source === "cloud") sourcePath = realFrom;
      } else if (!library.has(name)) throw new Error(`主技能库中没有：${name}`);
      if (["link", "sync", "import"].includes(kind)) {
        await readSkill(sourcePath);
        for (const t of tools) {
          const dest = path.join(t.path, name);
          const status = await linkStatus(dest, central);
          if (
            same(
              await canonical(t.path),
              await canonical(this.config.library),
            ) ||
            status === "source"
          ) {
            await add({
              name,
              source: sourcePath,
              dest,
              action: "keep",
              target: t.name,
              toolId: t.id,
            });
            continue;
          }
          if (
            same(await canonical(dest), await canonical(sourcePath)) &&
            status !== "linked"
          )
            throw new Error(`操作将覆盖实际源文件：${dest}`);
          await add({
            name,
            source: sourcePath,
            linkSource: central,
            dest,
            action: status === "linked" ? "keep" : "link",
            target: t.name,
            toolId: t.id,
          });
        }
        if (tools.some((t) => t.id === "claude")) {
          let valid = false;
          try {
            const m = JSON.parse(
              await fs.readFile(
                path.join(sourcePath, ".claude-plugin", "plugin.json"),
                "utf8",
              ),
            );
            valid = m.name === name && JSON.stringify(m.skills) === '["./"]';
          } catch {}
          if (!valid)
            await add({
              name,
              source: sourcePath,
              dest: path.join(central, ".claude-plugin", "plugin.json"),
              action: "manifest",
              target: "Claude 清单",
            });
        }
      }
      if (kind === "unlink")
        for (const t of tools) {
          const dest = path.join(t.path, name),
            status = await linkStatus(dest, central);
          if (
            same(dest, central) ||
            same(await canonical(t.path), await canonical(this.config.library))
          )
            throw new Error("不能断开主源目录中的技能");
          if (status === "missing") continue;
          if (!["linked", "broken"].includes(status))
            throw new Error(`${t.name} / ${name} 不是受管软链接，不会断开`);
          if (status === "broken") {
            const target = path.resolve(
              path.dirname(dest),
              await fs.readlink(dest),
            );
            if (!same(target, central)) throw new Error("不是受管软链接");
          }
          await add({
            name,
            dest,
            action: "unlink",
            target: t.name,
            toolId: t.id,
          });
        }
      if (kind === "delete") {
        for (const t of this.config.tools) {
          const dest = path.join(t.path, name);
          if (same(dest, central)) continue;
          if ((await linkStatus(dest, central)) === "linked")
            await add({
              name,
              dest,
              action: "unlink",
              target: t.name,
              toolId: t.id,
            });
        }
        if ((await stat(central))?.isSymbolicLink())
          throw new Error(
            "主技能库中的此项是软链接；请切换到实际源目录后删除，或只断开工具链接",
          );
        await add({
          name,
          dest: central,
          action: "remove",
          target: "主技能库",
        });
        if (deleteCloud && cloud.has(name))
          await add({
            name,
            dest: cloud.get(name).path,
            action: "remove",
            target: "云端备份",
          });
      }
    }
    if (prune) {
      if (
        kind !== "sync" ||
        source !== "cloud" ||
        names.length !== cloud.size ||
        ![...cloud.keys()].every((n) => names.includes(n))
      )
        throw new Error("严格镜像仅支持完整云端目录同步");
      for (const [name, s] of library)
        if (!cloud.has(name)) {
          if ((await stat(s.path))?.isSymbolicLink())
            throw new Error("严格镜像不能删除源库中的软链接项");
          for (const t of this.config.tools) {
            const dest = path.join(t.path, name);
            if (
              !same(dest, s.path) &&
              (await linkStatus(dest, s.path)) === "linked"
            )
              await add({ name, dest, action: "unlink", target: t.name });
          }
          await add({
            name,
            dest: s.path,
            action: "remove",
            target: "主技能库（多余项）",
          });
        }
    }
    const roots = [
      this.config.library,
      this.config.cloud,
      ...tools.map((t) => t.path),
    ].filter(Boolean);
    const rootChecks = await Promise.all(
      roots.map(async (p) => [p, await canonical(p)]),
    );
    const id = randomUUID(),
      plan = {
        id,
        kind,
        source,
        names,
        items,
        created: Date.now(),
        configHash: hash(JSON.stringify(this.config)),
        checks: [...checks],
        rootChecks,
      };
    await this.enrichPlan(plan, request);
    this.plans.set(id, plan);
    if (this.plans.size > 10) this.plans.delete(this.plans.keys().next().value);
    return {
      id,
      kind,
      source,
      names,
      items,
      conflicts: plan.conflicts,
      request,
      changes: items.filter((i) => i.action !== "keep").length,
    };
  }
  async exclusive(work) {
    if (this.busy) throw new Error("另一个操作正在执行");
    this.busy = true;
    let lock;
    try {
      lock = await fs.open(path.join(this.dataDir, "operation.lock"), "wx");
      await lock.writeFile(
        JSON.stringify({
          pid: process.pid,
          token: randomUUID(),
          created: new Date().toISOString(),
        }),
      );
      return await work();
    } catch (e) {
      if (e.code === "EEXIST" && !lock)
        throw new Error(
          "操作锁已存在；请确认没有另一个 SkillNacre 实例正在写入。异常退出后可在设置中打开数据目录检查 operation.lock。",
        );
      throw e;
    } finally {
      if (lock) {
        await lock.close();
        await fs.unlink(path.join(this.dataDir, "operation.lock"));
      }
      this.busy = false;
    }
  }
  async execute(id) {
    return this.exclusive(async () => {
      const plan = this.plans.get(id);
      this.plans.delete(id);
      if (!plan || Date.now() - plan.created > 600000)
        throw new Error("预览已过期，请重新预览");
      if (plan.conflicts?.length)
        throw new Error("存在未处理冲突，请查看差异并选择采用来源或跳过");
      if (plan.configHash !== hash(JSON.stringify(this.config)))
        throw new Error("设置发生变化，请重新预览");
      for (const [p, real] of plan.rootChecks)
        if (!same(await canonical(p), real))
          throw new Error(`目录指向发生变化，请重新预览：${p}`);
      for (const [p, digest] of plan.checks)
        if ((await fingerprint(p)) !== digest)
          throw new Error(`文件发生变化，请重新预览：${p}`);
      for (const [p, digest] of plan.entryChecks || [])
        if ((await entrySignature(p)) !== digest)
          throw new Error(`文件发生变化，请重新预览：${p}`);
      const result = {
        id,
        kind: plan.kind,
        date: new Date().toISOString(),
        failed: 0,
        items: [],
        phase: "running",
      };
      await this.record(result);
      const failedNames = new Set();
      for (let n = 0; n < plan.items.length; n++) {
        const item = plan.items[n];
        if (failedNames.has(item.name)) {
          result.items.push({
            ...item,
            status: "skipped",
            error: "同一技能的前置操作失败",
          });
          continue;
        }
        try {
          result.items.push({
            ...item,
            ...(await this.applyItem(item, id, n)),
            status: "ok",
          });
        } catch (e) {
          result.failed++;
          failedNames.add(item.name);
          result.items.push({ ...item, status: "failed", error: e.message });
        }
        await this.record(result);
      }
      for (const item of result.items)
        if (item.status === "ok" && item.action !== "keep") {
          item.postEntry = await entrySignature(item.dest);
          item.parentReal = await canonical(path.dirname(item.dest));
        }
      result.phase = "complete";
      await this.record(result);
      try {
        await this.afterExecution(plan, result);
      } catch (e) {
        result.metadataError =
          "文件操作已完成，但管理记录未能保存：" + e.message;
        await this.record(result);
      }
      return result;
    });
  }
  async applyItem(item, id, index) {
    if (["keep", "track"].includes(item.action)) return {};
    const dest = item.dest,
      backup = path.join(
        this.dataDir,
        "backups",
        id,
        String(index),
        path.basename(dest),
      );
    const existed = await stat(dest);
    let moved = false;
    const stage = path.join(path.dirname(dest), `.skilldock-${randomUUID()}`);
    const journalPath = path.join(this.dataDir, "backups", id, `${index}.json`);
    const journal = {
      ...item,
      backup,
      stage,
      parentReal: await canonical(path.dirname(dest)),
      phase: "prepared",
    };
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const moveBackup = async () => {
      if (existed) {
        await fs.mkdir(path.dirname(backup), { recursive: true });
        await movePreserving(dest, backup);
        moved = true;
        journal.phase = "backed-up";
        await atomicWrite(journalPath, JSON.stringify(journal, null, 2));
      }
    };
    // Persist the recovery locations before the first change; the normal history records completion.
    await atomicWrite(journalPath, JSON.stringify(journal, null, 2));
    try {
      if (["unlink", "remove"].includes(item.action)) {
        await moveBackup();
        journal.phase = "installed";
        journal.postEntry = "missing";
        await atomicWrite(journalPath, JSON.stringify(journal, null, 2));
        return { backup: moved ? backup : undefined };
      }
      if (item.action === "link") {
        const actual = await fs.realpath(item.linkSource);
        try {
          await this.makeSymlink(actual, stage);
        } catch (e) {
          if (["EPERM", "EACCES"].includes(e.code))
            throw new Error(
              "无法创建真实软链接。请开启 Windows 开发者模式并确认系统提示后重试。",
            );
          throw e;
        }
      } else if (item.action === "edit") {
        await fs.writeFile(stage, item.content, { flag: "wx" });
      } else if (item.action === "restore") {
        await fs.cp(item.source, stage, {
          recursive: true,
          dereference: false,
          verbatimSymlinks: true,
          errorOnExist: true,
          force: false,
        });
        if (
          (await entrySignature(stage)) !== (await entrySignature(item.source))
        )
          throw new Error("恢复内容校验失败");
      } else if (item.action === "manifest") {
        // Resolve the selected source before writing, so edits share the same real package.
        if ((await stat(path.dirname(dest)))?.isSymbolicLink())
          throw new Error("Claude 清单目录为软链接，请先检查");
        const s = await readSkill(path.dirname(path.dirname(dest)));
        await fs.writeFile(
          stage,
          JSON.stringify(
            {
              name: item.name,
              version: "0.1.0",
              description: s.description,
              skills: ["./"],
            },
            null,
            2,
          ) + "\n",
        );
      } else {
        await copyTree(item.source, stage);
        const meta = metadata(
          await fs.readFile(path.join(stage, "SKILL.md"), "utf8"),
        );
        if (meta.name !== item.name) throw new Error("复制后的技能名称不匹配");
        if (
          (await fingerprint(stage, true)) !==
          (await fingerprint(item.source, true))
        )
          throw new Error("复制后的内容校验失败");
      }
      await moveBackup();
      await fs.rename(stage, dest);
      journal.phase = "installed";
      journal.postEntry = await entrySignature(dest);
      await atomicWrite(journalPath, JSON.stringify(journal, null, 2));
      if (
        item.action === "link" &&
        (await linkStatus(dest, item.linkSource)) !== "linked"
      )
        throw new Error("链接验证失败");
      return { backup: moved ? backup : undefined };
    } catch (e) {
      if (moved && !(await stat(dest))) await movePreserving(backup, dest);
      throw e;
    } finally {
      const s = await stat(stage);
      if (s) {
        if (s.isSymbolicLink() || s.isFile()) await fs.unlink(stage);
        else {
          if (
            !inside(stage, path.dirname(dest)) ||
            !path.basename(stage).startsWith(".skilldock-")
          )
            throw new Error("临时目录校验失败");
          await fs.rm(stage, { recursive: true, force: true });
        }
      }
    }
  }
  async record(result) {
    await atomicWrite(
      path.join(this.dataDir, "history", result.id + ".json"),
      JSON.stringify(result, null, 2),
    );
  }
  async recoverInterrupted() {
    return recoverJournals(this);
  }
  async history() {
    const p = path.join(this.dataDir, "history");
    if (!(await stat(p))) return [];
    const results = [];
    for (const f of await fs.readdir(p)) {
      if (!f.endsWith(".json")) continue;
      try {
        results.push(JSON.parse(await fs.readFile(path.join(p, f), "utf8")));
      } catch {}
    }
    return results.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
  }
  async health() {
    const snapshot = await this.snapshot(),
      items = [];
    for (const warning of snapshot.warnings)
      items.push({
        name: "目录扫描",
        target: "主库 / 备份",
        label: "读取失败",
        dest: "",
        status: "failed",
        error: warning,
      });
    const library = new Map(snapshot.skills.map((s) => [s.id, s])),
      cloud = new Map(snapshot.cloud.map((s) => [s.id, s]));
    for (const name of new Set([...library.keys(), ...cloud.keys()])) {
      const a = library.get(name),
        b = cloud.get(name);
      let state = !a ? "仅备份存在" : !b ? "仅主库存在" : "内容一致";
      if (
        a &&
        b &&
        (await fingerprint(a.realPath || a.path, true)) !==
          (await fingerprint(b.realPath || b.path, true))
      )
        state = "内容不同";
      items.push({
        name,
        target: "主库 ↔ 云端备份",
        dest: a?.path || b.path,
        label: state,
        status: state === "内容一致" ? "ok" : "skipped",
      });
      if (a?.warning)
        items.push({
          name,
          target: "元数据",
          dest: a.path,
          label: "格式异常",
          status: "failed",
          error: a.warning,
        });
    }
    for (const tool of snapshot.tools) {
      for (const s of snapshot.skills) {
        const state = tool.states[s.id];
        if (["wrong", "broken", "copy"].includes(state))
          items.push({
            name: s.id,
            target: tool.name,
            dest: path.join(tool.path, s.id),
            label: {
              wrong: "链接到其他位置",
              broken: "链接失效",
              copy: "独立副本",
            }[state],
            status: "failed",
          });
      }
      items.push({
        name: tool.name,
        target: "连接状态",
        dest: tool.path,
        label: `${tool.linked} 个连接 · ${tool.issues} 项异常 · ${tool.extras.length} 个外部目录项`,
        status: tool.issues ? "failed" : "ok",
      });
    }
    return {
      id: randomUUID(),
      kind: "check",
      date: new Date().toISOString(),
      failed: items.filter((i) => i.status === "failed").length,
      items,
    };
  }
  async inspectImport(folder) {
    if (!path.isAbsolute(folder)) throw new Error("请选择完整目录");
    const skills = (await stat(path.join(folder, "SKILL.md")))
      ? [await readSkill(folder, false)]
      : await discover(folder, true);
    if (!skills.length)
      throw new Error("没有找到 SKILL.md（支持单个技能或分类文件夹）");
    const root = await canonical(folder);
    for (const skill of skills) {
      if (skill.realPath && !inside(skill.realPath, root))
        skill.warning = "技能链接指向导入目录之外，请单独选择它的真实目录";
    }
    const id = randomUUID();
    this.imports.set(id, { folder, skills });
    if (this.imports.size > 100)
      this.imports.delete(this.imports.keys().next().value);
    return { id, folder, skills: skills.map(({ content, body, ...s }) => s) };
  }
  async github({ repo, ref = "", subdir = "" }) {
    const value = String(repo)
      .trim()
      .replace(/^https:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "");
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(value))
      throw new Error(
        "请填写 owner/repo 或 GitHub 仓库首页地址，分支与子目录单独填写",
      );
    if (ref && (!/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.startsWith("-")))
      throw new Error("分支名称无效");
    const target = path.join(this.dataDir, "downloads", randomUUID()),
      selected = path.resolve(target, subdir || ".");
    if (!inside(selected, target)) throw new Error("子目录不能超出仓库");
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      const args = [
        "-c",
        "core.hooksPath=/dev/null",
        "clone",
        "--depth",
        "1",
        ...(ref ? ["--branch", ref] : []),
        "--",
        "https://github.com/" + value + ".git",
        target,
      ];
      await run("git", args, {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 2_000_000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_LFS_SKIP_SMUDGE: "1",
        },
      });
      const actual = await canonical(selected);
      if (!inside(actual, target)) throw new Error("仓库子目录是外部链接");
      const imported = await this.inspectImport(selected);
      const { stdout } = await run("git", ["-C", target, "rev-parse", "HEAD"], {
        windowsHide: true,
        timeout: 10000,
      });
      const entry = this.imports.get(imported.id);
      entry.origins = Object.fromEntries(
        entry.skills.map((s) => [
          s.id,
          {
            kind: "github",
            repo: value,
            ref,
            subdir: path.relative(target, s.path).split(path.sep).join("/"),
            commit: stdout.trim(),
            importedAt: new Date().toISOString(),
          },
        ]),
      );
      return imported;
    } catch (e) {
      if (inside(target, path.join(this.dataDir, "downloads")))
        await fs.rm(target, { recursive: true, force: true });
      throw new Error(
        e.code === "ENOENT"
          ? "未找到 Git，请安装 Git for Windows 后重试"
          : `读取 GitHub 失败：${e.message}`,
      );
    }
  }
}
