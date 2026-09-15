import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SkillService, defaults } from "../core/service.mjs";
import { fingerprint } from "../core/files.mjs";

async function fixture(t, env = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "nacre-detection-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = defaults(root, env);
  config.cloud = path.join(root, "cloud");
  const service = new SkillService(path.join(root, "data"), config, {
    home: root,
    env,
  });
  await service.init();
  const skill = async (root, name = "sample") => {
    const p = path.join(root, name);
    await fs.mkdir(p, { recursive: true });
    await fs.writeFile(
      path.join(p, "SKILL.md"),
      `---\nname: ${name}\ndescription: 自动路径识别测试\n---\n# Skill\n`,
    );
    return p;
  };
  return { root, config, service, skill };
}

test("detects standard skill roots and broken configured paths without writing, applies selected paths only", async (t) => {
  const { root, config, service, skill } = await fixture(t);
  const claude = config.tools.find((t) => t.id === "claude").path;
  await skill(claude);
  await service.saveConfig({
    ...config,
    tools: config.tools.map((t) =>
      t.id === "claude"
        ? { ...t, path: path.join(root, "not-installed", "skills") }
        : t,
    ),
  });
  const before = await fingerprint(root),
    report = await service.detectPaths();
  assert.equal(await fingerprint(root), before);
  const found = report.tools.find((t) => t.id === "claude");
  assert.equal(found.recommended, claude);
  assert.equal(found.candidates[0].count, 1);
  assert.equal(report.tools.find((t) => t.id === "windsurf").recommended, null);
  const updated = await service.applyDetectedPaths({
    id: report.id,
    paths: { claude },
  });
  assert.equal(
    updated.config.tools.find((t) => t.id === "claude").path,
    claude,
  );
  assert.equal(updated.config.library, config.library);
  assert.equal(updated.config.cloud, config.cloud);
});

test("detects environment roots, Hermes profiles and OpenClaw JSON5 workspace without exposing secrets", async (t) => {
  const { root, config, service, skill } = await fixture(t);
  const alternate = path.join(root, "custom-opencode");
  service.runtime.env.OPENCODE_CONFIG_DIR = alternate;
  await skill(path.join(alternate, "skills"));
  const profile = path.join(root, ".hermes", "profiles", "research", "skills");
  await skill(profile);
  const workspace = path.join(root, "my-agent");
  await skill(path.join(workspace, "skills"));
  await fs.mkdir(path.join(root, ".openclaw"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".openclaw", "openclaw.json"),
    `{ // local configuration\n agents: { defaults: { workspace: ${JSON.stringify(workspace)} } }, apiKey: 'private-value-never-returned', }`,
  );
  const report = await service.detectPaths();
  assert.ok(
    report.tools
      .find((t) => t.id === "opencode")
      .candidates.some((p) => p.path === path.join(alternate, "skills")),
  );
  assert.ok(
    report.tools
      .find((t) => t.id === "hermes")
      .candidates.some((p) => p.path === profile && p.scope === "profile"),
  );
  assert.ok(
    report.tools
      .find((t) => t.id === "openclaw")
      .candidates.some((p) => p.path === path.join(workspace, "skills")),
  );
  assert.ok(!JSON.stringify(report).includes("private-value-never-returned"));
});

test("detection does not claim shared directories prove installation and rejects unscanned or changed selections", async (t) => {
  const { root, config, service, skill } = await fixture(t);
  await skill(path.join(root, ".agents", "skills"));
  let report = await service.detectPaths();
  const codex = report.tools.find((t) => t.id === "codex");
  assert.equal(codex.commandPath, null);
  assert.ok(codex.candidates.some((c) => c.shared));
  await assert.rejects(
    service.applyDetectedPaths({
      id: report.id,
      paths: { codex: path.join(root, "unknown") },
    }),
    /候选/,
  );
  const actual = path.join(root, "moved-agents");
  await fs.rename(path.join(root, ".agents", "skills"), actual);
  await fs.symlink(actual, path.join(root, ".agents", "skills"), "dir");
  await assert.rejects(
    service.applyDetectedPaths({
      id: report.id,
      paths: { codex: path.join(root, ".agents", "skills") },
    }),
    /变化/,
  );
});

test("detects a PATH command without executing it and can propose an uncreated skills folder", async (t) => {
  const { root, config, service } = await fixture(t);
  const bin = path.join(root, "bin");
  await fs.mkdir(bin);
  await fs.writeFile(
    path.join(bin, process.platform === "win32" ? "claude.cmd" : "claude"),
    "THIS MUST NEVER EXECUTE",
  );
  service.runtime.env.PATH = bin;
  const parent = path.dirname(config.tools.find((t) => t.id === "claude").path);
  await fs.mkdir(parent, { recursive: true });
  await fs.writeFile(path.join(parent, "settings.json"), "{}");
  const report = await service.detectPaths(),
    claude = report.tools.find((t) => t.id === "claude");
  assert.ok(claude.commandPath);
  assert.ok(claude.candidates.some((c) => !c.exists && c.configTrace));
  await assert.rejects(fs.stat(path.join(parent, "skills")), /ENOENT/);
});
