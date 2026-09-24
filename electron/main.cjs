const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
} = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs/promises");
let service, win;
// Keep the v1 data directory: history contains absolute paths to recovery backups.
app.setPath("userData", path.join(app.getPath("appData"), "skilldock"));
if (process.env.SKILLDOCK_TEST_HOME)
  app.setPath(
    "userData",
    path.join(process.env.SKILLDOCK_TEST_HOME, "desktop-data"),
  );
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const { SkillService, defaults } = await import(
        pathToFileURL(path.join(__dirname, "../core/service.mjs")).href
      );
      service = new SkillService(
        app.getPath("userData"),
        process.env.SKILLDOCK_TEST_HOME
          ? defaults(process.env.SKILLDOCK_TEST_HOME, {})
          : defaults(),
        process.env.SKILLDOCK_TEST_HOME
          ? { home: process.env.SKILLDOCK_TEST_HOME, env: {} }
          : undefined,
      );
      if (process.env.SKILLDOCK_TEST_HOME)
        service.config.cloud = path.join(
          process.env.SKILLDOCK_TEST_HOME,
          "cloud",
        );
      await service.init();
      const handlers = {
        snapshot: () => service.snapshot(),
        health: () => service.health(),
        detail: ({ name, source }) => service.detail(name, source),
        saveConfig: (config) => service.saveConfig(config),
        plan: (req) => service.plan(req),
        execute: ({ id }) => service.execute(id),
        saveSkill: ({ name, content, hash }) =>
          service.saveSkill(name, content, hash),
        inspectImport: ({ folder }) => service.inspectImport(folder),
        github: (req) => service.github(req),
        discovery: ({ toolId }) => service.discovery(toolId),
        detectPaths: () => service.detectPaths(),
        applyDetectedPaths: (req) => service.applyDetectedPaths(req),
        savePreset: (req) => service.savePreset(req),
        deletePreset: ({ id }) => service.deletePreset(id),
        planPreset: (req) => service.planPreset(req),
        planRestore: (req) => service.planRestore(req),
        planDiff: (req) => service.planDiff(req),
        origins: () => service.origins(),
        checkUpdate: ({ name }) => service.checkUpdate(name),
        planUpdate: (req) => service.planUpdate(req),
        recoverInterrupted: () => service.recoverInterrupted(),
        chooseFolder: async () => {
          const r = await dialog.showOpenDialog(win, {
            properties: ["openDirectory", "createDirectory"],
          });
          return r.canceled ? null : r.filePaths[0];
        },
        openPath: async ({ path: target }) => {
          if (typeof target !== "string" || !path.isAbsolute(target))
            throw new Error("无效目录");
          if (!(await fs.stat(target)).isDirectory())
            throw new Error("只能打开文件夹");
          const error = await shell.openPath(target);
          if (error) throw new Error(error);
        },
        openExternal: async ({ url }) => {
          const u = new URL(url);
          if (!["https:", "http:"].includes(u.protocol))
            throw new Error("只支持网页链接");
          await shell.openExternal(u.href);
        },
        copy: ({ text }) => clipboard.writeText(String(text)),
        readFile: async ({ name, file }) => {
          const { inside } = await import(
            pathToFileURL(path.join(__dirname, "../core/files.mjs")).href
          );
          const d = await service.detail(name);
          const target = await fs.realpath(path.resolve(d.realPath, file));
          if (!inside(target, d.realPath))
            throw new Error("文件超出当前技能目录");
          const s = await fs.stat(target);
          if (!s.isFile() || s.size > 512000)
            throw new Error("只能预览 500 KB 以内的文本文件");
          const buf = await fs.readFile(target);
          if (buf.includes(0))
            throw new Error("此文件为二进制格式，请打开文件夹查看");
          return buf.toString("utf8");
        },
      };
      ipcMain.handle("skilldock:call", async (event, method, args) => {
        if (
          event.sender !== win.webContents ||
          event.senderFrame !== win.webContents.mainFrame
        )
          throw new Error("无效调用来源");
        if (!Object.hasOwn(handlers, method)) throw new Error("未知操作");
        try {
          return { ok: true, data: await handlers[method](args) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      });
      win = new BrowserWindow({
        width: 1480,
        height: 980,
        minWidth: 1080,
        minHeight: 740,
        backgroundColor: "#f7f8fb",
        title: "SkillNacre · 技能管理",
        autoHideMenuBar: true,
        show: false,
        icon: path.join(__dirname, process.platform === "win32" ? "../build/icon.ico" : "../build/icon.png"),
        titleBarStyle: process.platform === "darwin" ? "default" : "hidden",
        titleBarOverlay: process.platform === "darwin" ? false : {
          color: "#f7f8fb",
          symbolColor: "#555970",
          height: 42,
        },
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.on("close", (event) => {
        if (service.busy) event.preventDefault();
      });
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler(
        (_wc, _perm, callback) => callback(false),
      );
      await win.loadFile(path.join(__dirname, "../dist/index.html"));
      win.show();
    })
    .catch((e) => {
      dialog.showErrorBox("SkillNacre 启动失败", e.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
}
