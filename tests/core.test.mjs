import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SkillService, defaults } from "../core/service.mjs";

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "skilldock-test-")));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = defaults(root, {});
  config.cloud = path.join(root, "cloud");
  const service = new SkillService(path.join(root, "app"), config);
  await service.init();
  const skill = async (base, name = "demo", body = "original") => {
    const dir = path.join(base, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: 测试技能\n---\n# Demo\n${body}\n`,
    );
    return dir;
  };
  await skill(config.library);
  return { root, config, service, skill, tool: config.tools[0] };
}

test("check is read-only; linking is real, idempotent, and preserves extras", async (t) => {
  const { service, tool, config, skill } = await fixture(t);
  await skill(tool.path, "extra");
  await fs.mkdir(path.join(tool.path, ".system"));
  const before = await fs.readdir(tool.path);
  await service.snapshot();
  assert.deepEqual(await fs.readdir(tool.path), before);
  const plan = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  assert.equal(plan.items[0].action, "link");
  const result = await service.execute(plan.id);
  assert.equal(result.failed, 0);
  const link = path.join(tool.path, "demo");
  assert.ok((await fs.lstat(link)).isSymbolicLink());
  assert.equal(
    await fs.realpath(link),
    await fs.realpath(path.join(config.library, "demo")),
  );
  const next = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  assert.equal(next.items[0].action, "keep");
  assert.ok((await fs.stat(path.join(tool.path, "extra"))).isDirectory());
  assert.ok((await fs.stat(path.join(tool.path, ".system"))).isDirectory());
});

test("ordinary runtime directory is backed up before replacement", async (t) => {
  const { service, tool, skill } = await fixture(t);
  await skill(tool.path, "demo", "runtime copy");
  const p = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  const r = await service.execute(p.id);
  assert.equal(r.failed, 0);
  assert.match(
    await fs.readFile(path.join(r.items[0].backup, "SKILL.md"), "utf8"),
    /runtime copy/,
  );
});

test("a changed source invalidates preview before any mutation", async (t) => {
  const { service, config, tool } = await fixture(t);
  const p = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  await fs.appendFile(path.join(config.library, "demo", "SKILL.md"), "changed");
  await assert.rejects(service.execute(p.id), /变化|重新预览/);
  await assert.rejects(fs.lstat(path.join(tool.path, "demo")), {
    code: "ENOENT",
  });
});

test("rejects traversal, protected entries, and overlapping roots", async (t) => {
  const { service, config, tool } = await fixture(t);
  for (const name of ["../oops", ".system", "CON", "a/b"])
    await assert.rejects(
      service.plan({ kind: "link", names: [name], toolIds: [tool.id] }),
    );
  await assert.rejects(
    service.saveConfig({
      ...config,
      tools: [{ ...tool, path: path.join(config.library, "nested") }],
    }),
    /重叠/,
  );
});

test("cloud copy preserves categories and replaces with a recoverable backup", async (t) => {
  const { service, config, skill } = await fixture(t);
  await skill(path.join(config.cloud, "01-核心与方法"), "demo", "cloud");
  const p = await service.plan({
    kind: "sync",
    source: "cloud",
    names: ["demo"],
    resolutions: { demo: "source" },
    toolIds: [],
  });
  const r = await service.execute(p.id);
  assert.equal(r.failed, 0);
  assert.match(
    await fs.readFile(path.join(config.library, "demo", "SKILL.md"), "utf8"),
    /cloud/,
  );
  assert.match(
    await fs.readFile(path.join(r.items[0].backup, "SKILL.md"), "utf8"),
    /original/,
  );
  await fs.appendFile(
    path.join(config.library, "demo", "SKILL.md"),
    "local change",
  );
  const reverse = await service.plan({
    kind: "sync",
    source: "library",
    names: ["demo"],
    toolIds: [],
  });
  assert.equal(
    reverse.items[0].dest,
    path.join(config.cloud, "01-核心与方法", "demo"),
  );
});

test("unlink leaves central contents intact and refuses unmanaged copies", async (t) => {
  const { service, config, tool, skill } = await fixture(t);
  await skill(tool.path);
  await assert.rejects(
    service.plan({ kind: "unlink", names: ["demo"], toolIds: [tool.id] }),
    /受管软链接/,
  );
  const p = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  await service.execute(p.id);
  const u = await service.plan({
    kind: "unlink",
    names: ["demo"],
    toolIds: [tool.id],
  });
  await service.execute(u.id);
  assert.ok(
    (await fs.stat(path.join(config.library, "demo", "SKILL.md"))).isFile(),
  );
});

test("editing validates metadata and detects concurrent edits", async (t) => {
  const { service } = await fixture(t);
  const detail = await service.detail("demo");
  await service.saveSkill("demo", detail.content + "edit", detail.hash);
  await assert.rejects(
    service.saveSkill("demo", detail.content, detail.hash),
    /变化/,
  );
  const latest = await service.detail("demo");
  await assert.rejects(
    service.saveSkill("demo", "---\nname: wrong\n---\n", latest.hash),
    /name|description/,
  );
});

test("failed symlink creation preserves the original runtime directory", async (t) => {
  const { service, tool, skill } = await fixture(t);
  await skill(tool.path, "demo", "keep me");
  service.makeSymlink = async () => {
    throw Object.assign(new Error("denied"), { code: "EPERM" });
  };
  const p = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  const r = await service.execute(p.id);
  assert.equal(r.failed, 1);
  assert.match(
    await fs.readFile(path.join(tool.path, "demo", "SKILL.md"), "utf8"),
    /keep me/,
  );
  assert.ok(!(await fs.lstat(path.join(tool.path, "demo"))).isSymbolicLink());
});

test("an AI tool can be the source, with existing symlinks resolved without cycles", async (t) => {
  const { service, config, tool } = await fixture(t);
  const p = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  await service.execute(p.id);
  await service.saveConfig({ ...config, library: tool.path });
  const codex = config.tools.find((t) => t.id === "codex"),
    cc = config.tools.find((t) => t.id === "ccswitch");
  const next = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [codex.id, cc.id, tool.id],
  });
  assert.equal(next.items.filter((i) => i.action === "link").length, 1);
  assert.equal((await service.execute(next.id)).failed, 0);
  assert.equal(
    await fs.realpath(path.join(codex.path, "demo")),
    path.join(config.library, "demo"),
  );
  assert.ok(
    !(await fs.lstat(path.join(config.library, "demo"))).isSymbolicLink(),
  );
  await assert.rejects(
    service.plan({ kind: "unlink", names: ["demo"], toolIds: [tool.id] }),
    /主源/,
  );
});

test("a categorized custom folder can be the source", async (t) => {
  const { service, config, root, skill, tool } = await fixture(t);
  const custom = path.join(root, "custom");
  await skill(path.join(custom, "01-writing"), "writer", "custom");
  await service.saveConfig({ ...config, library: custom });
  assert.equal((await service.snapshot()).skills[0].category, "01-writing");
  const p = await service.plan({
    kind: "link",
    names: ["writer"],
    toolIds: [tool.id],
  });
  assert.equal((await service.execute(p.id)).failed, 0);
  assert.equal(
    await fs.realpath(path.join(tool.path, "writer")),
    path.join(custom, "01-writing", "writer"),
  );
});

test("wrong and broken links are repaired while the unrelated target remains intact", async (t) => {
  const { service, root, tool, skill, config } = await fixture(t);
  const outside = await skill(
    path.join(root, "unrelated"),
    "demo",
    "keep outside",
  );
  await fs.mkdir(tool.path, { recursive: true });
  await fs.symlink(outside, path.join(tool.path, "demo"), "dir");
  const p = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  assert.equal((await service.execute(p.id)).failed, 0);
  assert.match(
    await fs.readFile(path.join(outside, "SKILL.md"), "utf8"),
    /keep outside/,
  );
  await fs.unlink(path.join(tool.path, "demo"));
  await fs.symlink(
    path.join(root, "missing"),
    path.join(tool.path, "demo"),
    "dir",
  );
  const q = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  assert.equal((await service.execute(q.id)).failed, 0);
  assert.equal(
    await fs.realpath(path.join(tool.path, "demo")),
    path.join(config.library, "demo"),
  );
});

test("import reads a folder, validates metadata and copies supporting files", async (t) => {
  const { service, config, root, skill } = await fixture(t);
  const imported = await skill(
    path.join(root, "import"),
    "new-skill",
    "new content",
  );
  await fs.mkdir(path.join(imported, "references"));
  await fs.writeFile(
    path.join(imported, "references", "guide.md"),
    "supporting file",
  );
  const found = await service.inspectImport(imported);
  const p = await service.plan({
    kind: "import",
    importId: found.id,
    names: ["new-skill"],
    toolIds: [],
  });
  assert.equal((await service.execute(p.id)).failed, 0);
  assert.equal(
    await fs.readFile(
      path.join(config.library, "new-skill", "references", "guide.md"),
      "utf8",
    ),
    "supporting file",
  );
});

test("deletion preserves cloud copy and moves main source and links to backups", async (t) => {
  const { service, config, tool, skill } = await fixture(t);
  await skill(config.cloud);
  const link = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  await service.execute(link.id);
  const p = await service.plan({ kind: "delete", names: ["demo"] });
  const r = await service.execute(p.id);
  assert.equal(r.failed, 0);
  await assert.rejects(fs.lstat(path.join(config.library, "demo")));
  assert.ok(await fs.stat(path.join(config.cloud, "demo", "SKILL.md")));
  const original = r.items.find((i) => i.action === "remove");
  assert.ok(await fs.stat(path.join(original.backup, "SKILL.md")));
});

test("prune requires the whole cloud selection and preserves runtime extras", async (t) => {
  const { service, config, tool, skill } = await fixture(t);
  await skill(config.cloud);
  await skill(config.cloud, "second");
  await skill(config.library, "old");
  await skill(tool.path, "third-party");
  await assert.rejects(
    service.plan({
      kind: "sync",
      source: "cloud",
      names: ["demo"],
      prune: true,
    }),
    /完整/,
  );
  const p = await service.plan({
    kind: "sync",
    source: "cloud",
    names: ["demo", "second"],
    toolIds: [tool.id],
    prune: true,
  });
  const r = await service.execute(p.id);
  assert.equal(r.failed, 0);
  await assert.rejects(fs.lstat(path.join(config.library, "old")));
  assert.ok(await fs.stat(path.join(tool.path, "third-party", "SKILL.md")));
});

test("preview cannot be executed twice", async (t) => {
  const { service, tool } = await fixture(t);
  const p = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  await service.execute(p.id);
  await assert.rejects(service.execute(p.id), /过期/);
});

test("health check reports differences without writing a history or changing files", async (t) => {
  const { service, config, skill } = await fixture(t);
  await skill(config.cloud, "demo", "different backup");
  const before = await service.detail("demo");
  const r = await service.health();
  assert.ok(r.items.some((i) => i.name === "demo" && i.label === "内容不同"));
  assert.equal((await service.detail("demo")).hash, before.hash);
  assert.deepEqual(await service.history(), []);
});

test("duplicate backup names are surfaced while source selection remains available", async (t) => {
  const { service, config, skill, tool } = await fixture(t);
  await skill(path.join(config.cloud, "one"));
  await skill(path.join(config.cloud, "two"));
  const snapshot = await service.snapshot();
  assert.equal(snapshot.skills.length, 1);
  assert.ok(snapshot.warnings.some((w) => w.includes("重复")));
  const local = await service.plan({
    kind: "link",
    names: ["demo"],
    toolIds: [tool.id],
  });
  assert.equal((await service.execute(local.id)).failed, 0);
  await assert.rejects(
    service.plan({
      kind: "sync",
      source: "cloud",
      names: ["demo"],
      toolIds: [],
    }),
    /重复/,
  );
});

test("imports do not adopt package links escaping the selected folder", async (t) => {
  const { service, root, skill } = await fixture(t);
  const outside = await skill(path.join(root, "outside"), "external");
  const folder = path.join(root, "import");
  await fs.mkdir(folder);
  await fs.symlink(outside, path.join(folder, "external"), "dir");
  const loaded = await service.inspectImport(folder);
  assert.ok(loaded.skills[0].warning);
  await assert.rejects(
    service.plan({
      kind: "import",
      importId: loaded.id,
      names: ["external"],
      toolIds: [],
    }),
    /之外/,
  );
});

test(
  "cross-drive directory replacement retains a verified backup",
  { skip: process.platform !== "win32" },
  async (t) => {
    const { service, root, config, skill } = await fixture(t);
    const base = path.resolve(".test-work");
    await fs.mkdir(base, { recursive: true });
    const droot = await fs.mkdtemp(path.join(base, "crossdrive-"));
    t.after(async () => {
      assert.ok(path.resolve(droot).startsWith(base + path.sep));
      await fs.rm(droot, { recursive: true, force: true });
    });
    const target = path.join(droot, "skills");
    await skill(target, "demo", "D drive content");
    const tool = { id: "custom-cross", name: "跨盘工具", path: target };
    await service.saveConfig({ ...config, tools: [tool] });
    const p = await service.plan({
      kind: "link",
      names: ["demo"],
      toolIds: [tool.id],
    });
    const r = await service.execute(p.id);
    assert.equal(r.failed, 0);
    assert.match(
      await fs.readFile(path.join(r.items[0].backup, "SKILL.md"), "utf8"),
      /D drive content/,
    );
    assert.ok((await fs.lstat(path.join(target, "demo"))).isSymbolicLink());
  },
);
