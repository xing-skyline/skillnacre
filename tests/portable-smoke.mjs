import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import assert from "node:assert/strict";
import { defaults } from "../core/catalog.mjs";

// The NSIS launcher does not forward the debugging stderr used by _electron.launch.
// An explicit local CDP port tests the real portable entry and its extracted app.
const base = path.resolve(".test-work");
await fs.mkdir(base, { recursive: true });
const root = await fs.mkdtemp(path.join(base, "portable-check-"));
const config = defaults(root, {});
await fs.mkdir(path.join(config.library, "portable-test"), { recursive: true });
await fs.writeFile(
  path.join(config.library, "portable-test", "SKILL.md"),
  "---\nname: portable-test\ndescription: 便携版启动验证\n---\n# 便携启动\n",
);
const server = net.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const env = { ...process.env, SKILLDOCK_TEST_HOME: root };
delete env.ELECTRON_RUN_AS_NODE;
const entry = "SkillNacre-Portable-1.1.0.exe";
const child = spawn(
  path.resolve("release", entry),
  ["--remote-debugging-port=" + port],
  { env, windowsHide: true, stdio: "ignore" },
);
let browser;
try {
  let last;
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:" + port, {
        timeout: 2000,
      });
      break;
    } catch (e) {
      last = e;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  if (!browser) throw last;
  const context = browser.contexts()[0];
  const page =
    context.pages()[0] ||
    (await context.waitForEvent("page", { timeout: 30000 }));
  await page.getByRole("heading", { name: "让技能，有条不紊。" }).waitFor();
  assert.equal(await page.locator(".skill-card").count(), 1);
  const result = await page.evaluate(async () => {
    const p = await window.skilldock.call("plan", {
      kind: "link",
      names: ["portable-test"],
      toolIds: ["cursor"],
    });
    return window.skilldock.call("execute", { id: p.id });
  });
  assert.equal(result.failed, 0);
  assert.ok(
    (
      await fs.lstat(
        path.join(
          config.tools.find((t) => t.id === "cursor").path,
          "portable-test",
        ),
      )
    ).isSymbolicLink(),
  );
  const report = {
    passed: true,
    date: new Date().toISOString(),
    entry,
    transport: "CDP on explicit localhost port",
    checks: [
      "portable self extraction and launch",
      "Chinese window loaded",
      "isolated source read",
      "actual directory symlink created",
    ],
  };
  await fs.writeFile(
    path.join(base, "portable-validation.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await page.close();
} catch (error) {
  console.error("Portable check failed:", error.stack);
  if (browser?.isConnected())
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        console.error(
          "Window:",
          await page.title(),
          (await page.locator("body").innerText()).slice(0, 2000),
        );
        await page.screenshot({ path: path.join(base, "portable-error.png") });
      }
  throw error;
} finally {
  if (browser?.isConnected()) {
    for (const context of browser.contexts())
      for (const page of context.pages()) await page.close().catch(() => {});
    await browser.close();
  }
  if (child.exitCode === null)
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 8000).unref();
    });
  assert.ok(root.startsWith(base + path.sep));
  await fs.rm(root, { recursive: true, force: true });
}
