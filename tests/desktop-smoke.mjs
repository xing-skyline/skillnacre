import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { defaults } from "../core/catalog.mjs";

const base = path.resolve(".test-work");
await fs.mkdir(base, { recursive: true });
const root = await fs.mkdtemp(path.join(base, "desktop-"));
const config = defaults(root, {});
config.cloud = path.join(root, "cloud");
const examples = [
  ["academic-writing", "统一中英文正式文稿风格，整理汇报、公文与学术材料。"],
  ["code-review", "审阅代码改动，检查维护成本、错误风险和边界情况。"],
  ["deep-research", "检索多源证据，围绕研究问题形成可追溯的调研报告。"],
  ["image-illustrator", "为文章设计插图和框架图，保持系列图片风格一致。"],
  ["skill-sync-manager", "统一管理技能目录，并为常用 AI 工具创建真实软链接。"],
  ["weekly-report", "从工作记录梳理完成事项、推进情况与下一步安排。"],
];
for (const [name, description] of examples) {
  const p = path.join(config.library, name);
  await fs.mkdir(p, { recursive: true });
  await fs.writeFile(
    path.join(p, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n\n${description}\n\n## 工作流程\n\n1. 读取材料\n2. 执行任务\n3. 验证结果\n\n\`\`\`python\nprint('SkillNacre')\n\`\`\`\n`,
  );
}
await fs.mkdir(path.join(config.cloud, "01-核心与方法"), { recursive: true });
await fs.cp(
  path.join(config.library, "academic-writing"),
  path.join(config.cloud, "01-核心与方法", "academic-writing"),
  { recursive: true },
);
const env = { ...process.env, SKILLDOCK_TEST_HOME: root };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const errors = [];
try {
  app = await electron.launch({
    ...(process.env.SKILLDOCK_EXECUTABLE
      ? { executablePath: process.env.SKILLDOCK_EXECUTABLE, args: [] }
      : { args: [path.resolve(".")] }),
    env,
    timeout: 60000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "让技能，有条不紊。" }).waitFor();
  assert.equal(await page.locator(".skill-card").count(), 6);
  await page.getByPlaceholder("搜索名称、功能或关键词…").fill("代码");
  assert.equal(await page.locator(".skill-card").count(), 1);
  await page.getByRole("button", { name: "清除搜索" }).click();
  await page
    .getByRole("heading", { name: "academic-writing", exact: true })
    .click();
  await page.getByRole("button", { name: "源文件", exact: true }).click();
  assert.match(
    await page.locator(".code-preview").innerText(),
    /name: academic-writing/,
  );
  await page.getByRole("button", { name: "编辑正文" }).click();
  const editor = page.getByRole("textbox", { name: "技能源文件" });
  await editor.fill((await editor.inputValue()) + "\n桌面编辑验证\n");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.locator(".busy-overlay").waitFor({ state: "hidden" });
  assert.match(
    await fs.readFile(
      path.join(config.library, "academic-writing", "SKILL.md"),
      "utf8",
    ),
    /桌面编辑验证/,
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "选择 code-review", exact: true })
    .check();
  await page.getByRole("button", { name: "连接到 AI 工具" }).click();
  await page.getByRole("button", { name: "Codex", exact: true }).click();
  await page.getByRole("button", { name: "预览操作" }).click();
  await page.getByRole("dialog", { name: "操作预览" }).waitFor();
  await page.getByRole("button", { name: "确认执行 1 项变化" }).click();
  await page.getByRole("dialog", { name: "操作记录", exact: true }).waitFor();
  const codex = config.tools.find((t) => t.id === "codex");
  assert.ok(
    (await fs.lstat(path.join(codex.path, "code-review"))).isSymbolicLink(),
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /AI 工具/ })
    .click();
  assert.equal(await page.locator(".tool-card").count(), 11);
  await page
    .locator("nav")
    .getByRole("button", { name: /同步与备份/ })
    .click();
  await page.getByRole("button", { name: "检查一致性" }).click();
  await page.getByRole("dialog", { name: "只读健康检查" }).waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "预览同步" }).click();
  await page.getByRole("dialog", { name: "操作预览" }).waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /技能库/ })
    .click();
  await page.getByRole("button", { name: "切换来源" }).click();
  await page.getByRole("button", { name: "Codex", exact: true }).click();
  await page.getByRole("button", { name: "使用此来源" }).click();
  await page.locator(".busy-overlay").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".skill-card").count(), 1);
  await page.getByRole("button", { name: "切换来源" }).click();
  await page.getByRole("button", { name: "CC Switch", exact: true }).click();
  await page.getByRole("button", { name: "使用此来源" }).click();
  await page.locator(".busy-overlay").waitFor({ state: "hidden" });
  // v1.1 complete desktop flows use only this isolated fixture.
  await page
    .locator("nav")
    .getByRole("button", { name: /技能组合/ })
    .click();
  await page.getByRole("button", { name: "新建组合", exact: true }).click();
  await page
    .getByRole("textbox", { name: "组合名称", exact: true })
    .fill("研究与写作");
  await page
    .getByRole("checkbox", { name: "组合选择 academic-writing", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "组合选择 deep-research", exact: true })
    .check();
  await page.locator(".tool-chip").filter({ hasText: "Cursor" }).click();
  await page.getByRole("button", { name: "保存组合", exact: true }).click();
  await page
    .getByRole("heading", { name: "研究与写作", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "应用组合", exact: true }).click();
  await page.getByRole("button", { name: "预览操作", exact: true }).click();
  await page
    .getByRole("button", { name: "确认执行 2 项变化", exact: true })
    .click();
  await page.getByRole("dialog", { name: "操作记录", exact: true }).waitFor();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  const cursor = config.tools.find((t) => t.id === "cursor");
  assert.ok(
    (await fs.lstat(path.join(cursor.path, "deep-research"))).isSymbolicLink(),
  );
  await page
    .locator("nav")
    .getByRole("button", { name: /技能组合/ })
    .click();
  await page.getByRole("button", { name: "查看连接矩阵", exact: true }).click();
  assert.equal(await page.locator(".skill-matrix tbody tr").count(), 6);
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(base, "collections.png") });
  await page
    .locator("nav")
    .getByRole("button", { name: /操作记录/ })
    .click();
  await page.locator(".history-row").filter({ hasText: "编辑技能" }).click();
  await page.getByRole("button", { name: "预览恢复", exact: true }).click();
  await page.getByRole("button", { name: "查看文件差异", exact: true }).click();
  await page.locator(".diff-lines").waitFor();
  assert.match(
    await page
      .locator(".diff-lines .remove")
      .allTextContents()
      .then((x) => x.join(" ")),
    /桌面编辑验证/,
  );
  await page.screenshot({ path: path.join(base, "restore-diff.png") });
  await page
    .getByRole("button", { name: "确认执行 1 项变化", exact: true })
    .click();
  await page.getByRole("dialog", { name: "操作记录", exact: true }).waitFor();
  assert.doesNotMatch(
    await fs.readFile(
      path.join(config.library, "academic-writing", "SKILL.md"),
      "utf8",
    ),
    /桌面编辑验证/,
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /AI 工具/ })
    .click();
  await page
    .locator(".tool-card")
    .filter({
      has: page.getByRole("heading", { name: "OpenCode", exact: true }),
    })
    .getByRole("button", { name: "发现路径" })
    .click();
  await page
    .getByRole("dialog", { name: "OpenCode · 发现路径", exact: true })
    .waitFor();
  assert.equal(await page.locator(".discovery-paths>div").count(), 3);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  // Prepare a recorded local import through the real IPC, then exercise update UI.
  const incoming = path.join(root, "incoming", "local-upstream");
  await fs.mkdir(incoming, { recursive: true });
  const doc =
    "---\nname: local-upstream\ndescription: 用于核对来源更新\n---\n# 来源技能\n";
  await fs.writeFile(path.join(incoming, "SKILL.md"), doc + "初始版本\n");
  await page.evaluate(async (folder) => {
    const incoming = await window.skilldock.call("inspectImport", { folder });
    const p = await window.skilldock.call("plan", {
      kind: "import",
      names: ["local-upstream"],
      importId: incoming.id,
    });
    await window.skilldock.call("execute", { id: p.id });
  }, incoming);
  await fs.writeFile(path.join(incoming, "SKILL.md"), doc + "更新版本\n");
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /来源与更新/ })
    .click();
  const originRow = page
    .locator(".origin-row")
    .filter({ hasText: "local-upstream" });
  await originRow
    .getByRole("button", { name: "检查更新", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "local-upstream · 来源更新", exact: true })
    .waitFor();
  assert.match(await page.locator(".diff-view").innerText(), /更新版本/);
  await page.getByRole("button", { name: "预览更新", exact: true }).click();
  await page
    .getByRole("button", { name: "确认执行 1 项变化", exact: true })
    .click();
  await page.getByRole("dialog", { name: "操作记录", exact: true }).waitFor();
  assert.match(
    await fs.readFile(
      path.join(config.library, "local-upstream", "SKILL.md"),
      "utf8",
    ),
    /更新版本/,
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await fs.appendFile(path.join(incoming, "SKILL.md"), "共同的新版本\n");
  await fs.appendFile(
    path.join(config.library, "local-upstream", "SKILL.md"),
    "共同的新版本\n",
  );
  await page
    .locator("nav")
    .getByRole("button", { name: /来源与更新/ })
    .click();
  await page
    .locator(".origin-row")
    .filter({ hasText: "local-upstream" })
    .getByRole("button", { name: "检查更新", exact: true })
    .click();
  await page
    .getByRole("button", { name: "确认当前版本基线", exact: true })
    .click();
  await page
    .getByRole("button", { name: "确认执行 1 项变化", exact: true })
    .click();
  await page.getByRole("dialog", { name: "操作记录", exact: true }).waitFor();
  const tracked = await page.evaluate(() => window.skilldock.call("origins"));
  assert.equal(
    tracked.find((s) => s.name === "local-upstream").localModified,
    false,
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /同步与备份/ })
    .click();
  await fs.appendFile(
    path.join(config.cloud, "01-核心与方法", "academic-writing", "SKILL.md"),
    "备份独立修改\n",
  );
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByRole("button", { name: "预览同步", exact: true }).click();
  await page.getByRole("dialog", { name: "操作预览", exact: true }).waitFor();
  assert.ok(await page.getByRole("button", { name: /确认执行/ }).isDisabled());
  await page
    .getByRole("combobox", { name: "处理冲突 academic-writing", exact: true })
    .selectOption("source");
  await page
    .getByRole("button", { name: "确认执行 1 项变化", exact: true })
    .click();
  await page.getByRole("dialog", { name: "操作记录", exact: true }).waitFor();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /来源与更新/ })
    .click();
  await page.locator(".origin-row").first().waitFor();
  await page.screenshot({ path: path.join(base, "origins.png") });
  await page.setViewportSize({ width: 1080, height: 740 });
  assert.ok(
    await page.locator("body").evaluate((e) => e.scrollWidth <= innerWidth),
  );
  await page.screenshot({ path: path.join(base, "compact.png") });
  await page.setViewportSize({ width: 1480, height: 937 });
  await page.evaluate(
    async (missing) => {
      const snapshot = await window.skilldock.call("snapshot");
      await window.skilldock.call("saveConfig", {
        ...snapshot.config,
        tools: snapshot.config.tools.map((t) =>
          t.id === "cursor" ? { ...t, path: missing } : t,
        ),
      });
    },
    path.join(root, "unrecognized-cursor", "skills"),
  );
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await page.getByRole("button", { name: "自动识别路径", exact: true }).click();
  await page
    .getByRole("dialog", { name: "自动识别 AI 工具路径", exact: true })
    .waitFor();
  assert.equal(await page.locator(".detection-row").count(), 11);
  assert.equal(
    await page
      .getByRole("combobox", { name: "Cursor 技能路径", exact: true })
      .inputValue(),
    cursor.path,
  );
  await page
    .getByRole("checkbox", { name: "应用 Cursor 识别路径", exact: true })
    .check();
  await page.screenshot({ path: path.join(base, "detection.png") });
  await page.getByRole("button", { name: "应用所选路径", exact: true }).click();
  await page
    .getByRole("dialog", { name: "自动识别 AI 工具路径", exact: true })
    .waitFor({ state: "hidden" });
  const detected = await page.evaluate(() => window.skilldock.call("snapshot"));
  assert.equal(
    detected.config.tools.find((t) => t.id === "cursor").path,
    cursor.path,
  );
  assert.equal(detected.config.library, config.library);
  assert.equal(detected.config.cloud, config.cloud);
  await page
    .locator("nav")
    .getByRole("button", { name: /技能库/ })
    .click();
  await page.screenshot({ path: path.join(base, "desktop-smoke.png") });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: [
          "技能列表",
          "中文功能搜索",
          "正文预览",
          "带备份编辑",
          "选择工具",
          "预览并执行真实软链接",
          "工具状态",
          "同步预览",
          "只读健康检查",
          "切换到 Codex 主源",
          "切回 CC Switch",
          "命名组合保存与应用",
          "组合真实软链接",
          "连接矩阵",
          "恢复前的行内差异",
          "程序内恢复与当前版本备份",
          "OpenCode 多路径发现",
          "来源记录与本地来源更新",
          "更新预览后执行",
          "相同内容确认更新基线",
          "同步冲突显式选择",
          "1080×740 窗口布局",
          "自动识别候选路径并应用，保留主源与备份设置",
        ],
        pageErrors: errors,
        screenshot: path.join(base, "desktop-smoke.png"),
      },
      null,
      2,
    ),
  );
} finally {
  if (app) await app.close();
  assert.ok(root.startsWith(base + path.sep));
  await fs.rm(root, { recursive: true, force: true });
}
