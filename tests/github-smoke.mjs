import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { SkillService, defaults } from "../core/service.mjs";

const base = path.resolve(".test-work");
await fs.mkdir(base, { recursive: true });
const root = await fs.mkdtemp(path.join(base, "github-"));
try {
  const config = defaults(root, {});
  config.cloud = path.join(root, "cloud");
  const service = new SkillService(path.join(root, "data"), config);
  await service.init();
  const input = await service.github({
    repo: "obra/superpowers",
    ref: "main",
    subdir: "skills/systematic-debugging",
  });
  assert.equal(input.skills.length, 1);
  const plan = await service.plan({
    kind: "import",
    importId: input.id,
    names: ["systematic-debugging"],
  });
  assert.equal((await service.execute(plan.id)).failed, 0);
  const reopened = new SkillService(path.join(root, "data"), config);
  await reopened.init();
  const origin = (await reopened.origins())[0];
  assert.equal(origin.kind, "github");
  assert.equal(origin.subdir, "skills/systematic-debugging");
  assert.match(origin.commit, /^[a-f0-9]{40}$/);
  const update = await reopened.checkUpdate("systematic-debugging");
  assert.equal(update.status, "current");
  assert.equal(update.diff.files.length, 0);
  const report = {
    passed: true,
    date: new Date().toISOString(),
    repo: origin.repo,
    commit: origin.commit,
    checks: [
      "GitHub shallow clone",
      "subdirectory import",
      "origin persistence after restart",
      "commit recorded",
      "upstream recheck without local writes",
    ],
  };
  await fs.writeFile(
    path.join(base, "github-validation.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  assert.ok(root.startsWith(base + path.sep));
  await fs.rm(root, { recursive: true, force: true });
}
