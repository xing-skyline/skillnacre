import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { defaults } from "../core/catalog.mjs";

// All screenshots use generated examples and an isolated app data directory.
const base = path.resolve(process.env.SKILLNACRE_DEMO_BASE || ".test-work");
await fs.access(base).catch(() => fs.mkdir(base, { recursive: true }));
const root = await fs.mkdtemp(path.join(base, "SkillNacre-Demo-"));
const images = path.resolve("docs/images");
await fs.mkdir(images, { recursive: true });
const config = defaults(root, {});
const examples = [
  [
    "code-review",
    "审阅代码改动，识别错误风险、边界情况与维护成本。",
    "01-开发",
  ],
  [
    "api-designer",
    "从使用场景出发设计清晰的接口，整理请求、响应与错误处理。",
    "01-开发",
  ],
  [
    "research-notes",
    "整理研究问题与证据来源，形成可追溯的阅读笔记。",
    "02-研究",
  ],
  [
    "data-explainer",
    "解释表格和统计结果，把数据发现写成易懂的结论。",
    "02-研究",
  ],
  [
    "weekly-report",
    "梳理本周成果、推进事项与下一步安排，生成简明工作周报。",
    "03-写作",
  ],
  [
    "clear-writing",
    "精简冗长句子，调整文章结构，让表达连贯、具体、易读。",
    "03-写作",
  ],
];
for (const [name, description, category] of examples) {
  const directory = path.join(config.library, category, name);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n\n${description}\n\n## 适用场景\n\n这是文档截图用的虚构示例技能，展示名称、主要功能与正文阅读。\n\n## 工作流程\n\n1. 明确目标，读取已有材料。\n2. 根据任务整理内容，保留可核对的依据。\n3. 检查结果，给出简洁清楚的说明。\n\n## 输出要求\n\n- 先说明主要结论。\n- 使用具体例子帮助理解。\n- 标明仍需补充的信息。\n`,
  );
}
for (const tool of config.tools) await fs.mkdir(tool.path, { recursive: true });
const env = { ...process.env, SKILLDOCK_TEST_HOME: root };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    ...(process.env.SKILLDOCK_EXECUTABLE
      ? { executablePath: process.env.SKILLDOCK_EXECUTABLE, args: [] }
      : { args: [path.resolve(".")] }),
    env,
    timeout: 60000,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("heading", { name: "让技能，有条不紊。" }).waitFor();
  assert.equal(await page.locator(".skill-card").count(), examples.length);
  await page.evaluate(async () => {
    const snapshot = await window.skilldock.call("snapshot");
    await window.skilldock.call("saveConfig", {
      ...snapshot.config,
      favorites: ["code-review", "clear-writing"],
      cloud: "",
    });
    const plan = await window.skilldock.call("plan", {
      kind: "link",
      names: ["code-review", "api-designer", "clear-writing"],
      toolIds: ["claude", "codex", "cursor"],
    });
    const result = await window.skilldock.call("execute", { id: plan.id });
    if (result.failed) throw new Error("Demo connections failed");
    await window.skilldock.call("savePreset", {
      name: "开发与表达",
      names: ["code-review", "api-designer", "clear-writing"],
      toolIds: ["claude", "codex", "cursor"],
    });
    await window.skilldock.call("savePreset", {
      name: "研究与写作",
      names: ["research-notes", "data-explainer", "weekly-report"],
      toolIds: ["claude"],
    });
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.locator(".busy-overlay").waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(images, "library.png") });
  await page.getByRole("heading", { name: "code-review", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: path.join(images, "detail.png") });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /AI 工具/ })
    .click();
  await page.screenshot({ path: path.join(images, "tools.png") });
  await page.getByRole("button", { name: "自动识别路径", exact: true }).click();
  await page
    .getByRole("dialog", { name: "自动识别 AI 工具路径", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(images, "detection.png") });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /技能组合/ })
    .click();
  await page.getByText("开发与表达", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(images, "collections.png") });
  const state = await page.evaluate(() => window.skilldock.call("snapshot"));
  assert.equal(state.config.cloud, "");
  assert.deepEqual(errors, []);
  console.log(
    "Captured 5 screenshots from 6 synthetic skills; empty-backup configuration and real links work.",
  );
} finally {
  if (app) await app.close();
  assert.equal(path.dirname(root), base);
  await fs.rm(root, { recursive: true, force: true });
}
