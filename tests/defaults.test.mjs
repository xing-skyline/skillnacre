import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SkillService, defaults } from "../core/service.mjs";

test("fresh installs leave backup selection to the user and respect an explicit environment path", () => {
  const home = path.join(os.tmpdir(), "skillnacre-example-home");
  assert.equal(defaults(home, {}).cloud, "");
  const cloud = path.join(home, "my-backup");
  assert.equal(
    defaults(home, { SKILL_SYNC_NUTSTORE_ROOT: cloud }).cloud,
    cloud,
  );
});

test("new defaults retain an existing user's saved source, backup and tool paths", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "nacre-defaults-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const initial = defaults(root, {});
  const data = path.join(root, "data");
  const service = new SkillService(data, initial, { home: root, env: {} });
  await service.init();
  const saved = {
    ...initial,
    library: path.join(root, "my-skills"),
    cloud: path.join(root, "my-backup"),
    tools: initial.tools.map((tool) => ({
      ...tool,
      path: path.join(root, "custom-tools", tool.id, "skills"),
    })),
  };
  await service.saveConfig(saved);
  const reopened = new SkillService(data, defaults(root, {}), {
    home: root,
    env: {},
  });
  await reopened.init();
  assert.equal(reopened.config.library, saved.library);
  assert.equal(reopened.config.cloud, saved.cloud);
  assert.deepEqual(
    reopened.config.tools.map((tool) => tool.path),
    saved.tools.map((tool) => tool.path),
  );
});
