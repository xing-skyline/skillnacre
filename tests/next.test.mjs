import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SkillService, defaults } from "../core/service.mjs";
import { treeDiff } from "../core/compare.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skillnacre-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = defaults(root, {});
  config.cloud = path.join(root, "cloud");
  const service = new SkillService(path.join(root, "app"), config);
  await service.init();
  const skill = async (base, body = "original", name = "demo") => {
    const dir = path.join(base, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: A test skill\n---\n# Test\n${body}\n`,
    );
    return dir;
  };
  await skill(config.library);
  return { root, config, service, skill };
}

test("restore previews and restores an edit, preserves current version and blocks later changes", async (t) => {
  const { service, config } = await fixture(t);
  const before = await service.detail("demo");
  await service.saveSkill("demo", before.content + "new\n", before.hash);
  const h = (await service.history())[0];
  const p = await service.planRestore({ historyId: h.id, index: 0 });
  assert.equal(p.kind, "restore");
  const diff = await service.planDiff({ id: p.id, index: 0 });
  assert.ok(
    diff.files.some((f) =>
      f.lines?.some((l) => l.type === "remove" && l.text === "new"),
    ),
  );
  const r = await service.execute(p.id);
  assert.equal(r.failed, 0);
  assert.equal((await service.detail("demo")).content, before.content);
  assert.match(await fs.readFile(r.items[0].backup, "utf8"), /new/);
  await assert.rejects(
    service.planRestore({ historyId: h.id, index: 0 }),
    /变化/,
  );
  await assert.rejects(
    service.planRestore({
      historyId: h.id,
      index: 0,
      copyTo: path.join(config.library, "demo"),
    }),
    /已存在|重叠/,
  );
});

test("restore rechecks backup, destination and parent at execution; directory and link backups survive", async (t) => {
  const { service, config, skill } = await fixture(t);
  const tool = config.tools.find((t) => t.id === "cursor");
  await skill(tool.path, "old copy");
  const p = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  const r = await service.execute(p.id);
  const restore = await service.planRestore({ historyId: r.id, index: 0 });
  await fs.appendFile(path.join(r.items[0].backup, "SKILL.md"), "changed");
  await assert.rejects(service.execute(restore.id), /变化/);
  assert.ok((await fs.lstat(path.join(tool.path, "demo"))).isSymbolicLink());
  const fresh = await service.planRestore({ historyId: r.id, index: 0 });
  const done = await service.execute(fresh.id);
  assert.equal(done.failed, 0);
  assert.match(
    await fs.readFile(path.join(tool.path, "demo", "SKILL.md"), "utf8"),
    /old copy/,
  );
  assert.ok((await fs.lstat(done.items[0].backup)).isSymbolicLink());
});

test("sync baselines identify two-sided changes and require a conflict choice", async (t) => {
  const { service, config, skill } = await fixture(t);
  let p = await service.plan({
    kind: "sync",
    source: "library",
    names: ["demo"],
  });
  await service.execute(p.id);
  await skill(config.library, "local edit");
  await skill(path.join(config.cloud, "00-待分类"), "remote edit");
  p = await service.plan({ kind: "sync", source: "cloud", names: ["demo"] });
  assert.equal(p.conflicts.length, 1);
  await assert.rejects(service.execute(p.id), /冲突/);
  const chosen = await service.plan({
    kind: "sync",
    source: "cloud",
    names: ["demo"],
    resolutions: { demo: "source" },
  });
  assert.equal((await service.execute(chosen.id)).failed, 0);
  assert.match((await service.detail("demo")).content, /remote edit/);
});

test("presets persist per library; intended connections survive restart and source changes", async (t) => {
  const { service, config, root } = await fixture(t);
  const preset = await service.savePreset({
    name: "Writing",
    names: ["demo"],
    toolIds: ["cursor"],
  });
  await service.execute((await service.planPreset({ id: preset.id })).id);
  const reopened = new SkillService(path.join(root, "app"), config);
  await reopened.init();
  const snap = await reopened.snapshot();
  assert.equal(snap.presets[0].name, "Writing");
  assert.equal(snap.tools.find((t) => t.id === "cursor").intent.demo, "linked");
  await reopened.saveConfig({ ...config, library: path.join(root, "another") });
  assert.equal((await reopened.snapshot()).presets.length, 0);
});

test("OpenCode discovery distinguishes shared copies and deduplicates links", async (t) => {
  const { service, config, skill } = await fixture(t);
  await skill(config.tools.find((t) => t.id === "claude").path, "alternate");
  const d = await service.discovery("opencode");
  assert.ok(
    d.paths.some(
      (p) => p.path === config.tools.find((t) => t.id === "claude").path,
    ),
  );
  assert.ok(d.skills.find((s) => s.name === "demo"));
  assert.match(d.note, /运行|加载/);
});

test("local import origin detects source and local changes and updates only after preview", async (t) => {
  const { service, config, skill, root } = await fixture(t);
  const input = path.join(root, "incoming");
  await skill(input, "upstream v1", "imported");
  const inspected = await service.inspectImport(input);
  await service.execute(
    (
      await service.plan({
        kind: "import",
        names: ["imported"],
        importId: inspected.id,
      })
    ).id,
  );
  let origins = await service.origins();
  assert.equal(origins.find((o) => o.name === "imported").kind, "local");
  await skill(input, "upstream v2", "imported");
  const check = await service.checkUpdate("imported");
  assert.equal(check.status, "update");
  await skill(config.library, "local custom", "imported");
  await assert.rejects(service.planUpdate({ id: check.id }), /变化|冲突/);
  const conflict = await service.checkUpdate("imported");
  assert.equal(conflict.status, "conflict");
  const plan = await service.planUpdate({
    id: conflict.id,
    resolution: "source",
  });
  assert.equal((await service.execute(plan.id)).failed, 0);
  assert.match((await service.detail("imported")).content, /upstream v2/);
});

test("skipping a sync conflict also skips its dependent links and manifest", async (t) => {
  const { service, config, skill } = await fixture(t);
  await skill(config.cloud, "different");
  const p = await service.plan({
    kind: "sync",
    source: "cloud",
    names: ["demo"],
    toolIds: ["claude"],
    resolutions: { demo: "skip" },
  });
  assert.equal(p.changes, 0);
  assert.ok(p.items.every((i) => i.action === "keep"));
  await service.execute(p.id);
  assert.match((await service.detail("demo")).content, /original/);
  await assert.rejects(
    fs.lstat(path.join(config.tools[0].path, "demo")),
    /ENOENT/,
  );
});

test("interrupted journal recovery preserves newer data and exports uncertain backups", async (t) => {
  const { service, config, root } = await fixture(t);
  const id = "interrupted-test",
    dest = path.join(config.library, "demo");
  const backup = path.join(root, "app", "backups", id, "0", "demo");
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.cp(dest, backup, { recursive: true });
  await fs.writeFile(
    path.join(root, "app", "backups", id, "0.json"),
    JSON.stringify({
      name: "demo",
      dest,
      backup,
      phase: "prepared",
      parentReal: config.library,
    }),
  );
  await fs.writeFile(
    path.join(root, "app", "operation.lock"),
    JSON.stringify({ pid: 99999999, token: "dead-test" }),
  );
  assert.equal((await service.snapshot()).recovery.lock.state, "stale");
  assert.equal((await service.recoverInterrupted()).recovered, 1);
  await assert.rejects(
    service.planRestore({ historyId: id, index: 0 }),
    /基线/,
  );
  const plan = await service.planRestore({
    historyId: id,
    index: 0,
    copyTo: path.join(root, "export"),
  });
  assert.equal((await service.execute(plan.id)).failed, 0);
  assert.equal(
    (await service.detail("demo")).content,
    await fs.readFile(path.join(root, "export", "demo", "SKILL.md"), "utf8"),
  );
});

test("restore rejects parent redirection and live operation locks cannot be cleared", async (t) => {
  const { service, config, root } = await fixture(t);
  const d = await service.detail("demo");
  await service.saveSkill("demo", d.content + "update", d.hash);
  const h = (await service.history())[0],
    p = await service.planRestore({ historyId: h.id, index: 0 });
  const moved = path.join(root, "moved-demo");
  await fs.rename(path.join(config.library, "demo"), moved);
  await fs.symlink(moved, path.join(config.library, "demo"), "dir");
  await assert.rejects(service.execute(p.id), /目录指向发生变化/);
  const lock = path.join(root, "app", "operation.lock");
  await fs.writeFile(lock, JSON.stringify({ pid: process.pid, token: "live" }));
  await assert.rejects(service.recoverInterrupted(), /仍在使用/);
  await fs.unlink(lock);
});

test("disconnect reports remaining discovery paths instead of implying disabled", async (t) => {
  const { service, config, skill } = await fixture(t);
  await skill(config.tools.find((t) => t.id === "claude").path, "shared");
  await service.execute(
    (
      await service.plan({
        kind: "link",
        names: ["demo"],
        toolIds: ["opencode"],
      })
    ).id,
  );
  const p = await service.plan({
    kind: "unlink",
    names: ["demo"],
    toolIds: ["opencode"],
  });
  assert.ok(p.items[0].remainingPaths.some((p) => p.includes(".claude")));
  await service.execute(p.id);
  assert.ok(
    (await service.discovery("opencode")).skills.some((s) => s.name === "demo"),
  );
});

test("interrupted replacement with a missing destination can restore the original directory", async (t) => {
  const { service, config, root } = await fixture(t),
    id = "missing-destination";
  const dest = path.join(config.library, "demo"),
    backup = path.join(root, "app", "backups", id, "0", "demo");
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.rename(dest, backup);
  await fs.writeFile(
    path.join(root, "app", "backups", id, "0.json"),
    JSON.stringify({
      name: "demo",
      dest,
      backup,
      parentReal: config.library,
      phase: "backed-up",
    }),
  );
  await service.record({
    id,
    kind: "sync",
    date: new Date().toISOString(),
    phase: "running",
    items: [],
    failed: 0,
  });
  assert.equal((await service.snapshot()).recovery.pending, 1);
  await service.recoverInterrupted();
  const p = await service.planRestore({ historyId: id, index: 0 });
  assert.equal((await service.execute(p.id)).failed, 0);
  assert.match((await service.detail("demo")).content, /original/);
});

test("diff lists added/deleted files and binary changes, without following nested links", async (t) => {
  const { root, config, skill } = await fixture(t),
    a = path.join(config.library, "demo"),
    b = await skill(path.join(root, "other"), "modified");
  await fs.writeFile(path.join(a, "removed.txt"), "old");
  await fs.writeFile(path.join(b, "added.json"), "{}");
  await fs.writeFile(path.join(a, "image.bin"), Buffer.from([0, 1]));
  await fs.writeFile(path.join(b, "image.bin"), Buffer.from([0, 2]));
  const d = await treeDiff(a, b);
  assert.equal(d.files.find((f) => f.name === "removed.txt").status, "deleted");
  assert.equal(d.files.find((f) => f.name === "added.json").status, "added");
  assert.ok(d.files.find((f) => f.name === "image.bin").note);
  assert.ok(
    d.files
      .find((f) => f.name === "SKILL.md")
      .lines.some((l) => l.type === "add" && l.text === "modified"),
  );
  await fs.symlink(a, path.join(b, "external"), "dir");
  const linked = await treeDiff(a, b);
  assert.ok(linked.files.some((f) => f.name === "external"));
  assert.ok(!linked.files.some((f) => f.name === "external/SKILL.md"));
});

test("v1 settings and backup history remain accessible, with safe alternate restore", async (t) => {
  const { service, config, root } = await fixture(t),
    id = "legacy-record";
  const backup = path.join(root, "app", "backups", id, "demo");
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.cp(path.join(config.library, "demo"), backup, { recursive: true });
  await service.record({
    id,
    kind: "sync",
    date: new Date().toISOString(),
    failed: 0,
    items: [
      {
        name: "demo",
        status: "ok",
        dest: path.join(config.library, "demo"),
        backup,
        action: "replace",
      },
    ],
  });
  await fs.writeFile(
    path.join(root, "app", "settings.json"),
    JSON.stringify({
      ...config,
      tools: config.tools.map(({ discoveryPaths, ...t }) => t),
    }),
  );
  const reopened = new SkillService(path.join(root, "app"), defaults(root, {}));
  await reopened.init();
  assert.equal((await reopened.snapshot()).skills.length, 1);
  assert.equal((await reopened.discovery("opencode")).paths.length, 3);
  await assert.rejects(
    reopened.planRestore({ historyId: id, index: 0 }),
    /旧版/,
  );
  const p = await reopened.planRestore({
    historyId: id,
    index: 0,
    copyTo: path.join(root, "legacy-export"),
  });
  assert.equal((await reopened.execute(p.id)).failed, 0);
});

test("identical import can record origin without replacing files or making a backup", async (t) => {
  const { service, root, config } = await fixture(t);
  const source = path.join(root, "origin");
  await fs.mkdir(source);
  await fs.cp(path.join(config.library, "demo"), path.join(source, "demo"), {
    recursive: true,
  });
  const inspected = await service.inspectImport(source);
  const p = await service.plan({
    kind: "import",
    names: ["demo"],
    importId: inspected.id,
  });
  assert.equal(p.items[0].action, "track");
  assert.equal(p.changes, 1);
  const r = await service.execute(p.id);
  assert.equal(r.failed, 0);
  assert.equal(r.items[0].backup, undefined);
  assert.equal((await service.origins())[0].kind, "local");
  const again = await service.plan({
    kind: "import",
    names: ["demo"],
    importId: inspected.id,
  });
  assert.equal(again.changes, 0);
});

test("equal locally edited and upstream versions can explicitly renew their baseline", async (t) => {
  const { service, root, config, skill } = await fixture(t),
    source = path.join(root, "origin");
  await skill(source);
  const inspected = await service.inspectImport(source);
  await service.execute(
    (
      await service.plan({
        kind: "import",
        names: ["demo"],
        importId: inspected.id,
      })
    ).id,
  );
  await skill(source, "same new version");
  await skill(config.library, "same new version");
  const update = await service.checkUpdate("demo");
  assert.equal(update.status, "current");
  assert.equal(update.needsBaseline, true);
  const p = await service.planUpdate({ id: update.id });
  assert.equal(p.items[0].action, "track");
  await service.execute(p.id);
  assert.equal((await service.origins())[0].localModified, false);
});
