import fs from "node:fs/promises";
import path from "node:path";
import { stat, atomicWrite, canonical, inside } from "./files.mjs";
import { entrySignature } from "./compare.mjs";

export async function lockStatus(dataDir) {
  const p = path.join(dataDir, "operation.lock");
  if (!(await stat(p))) return null;
  let entry;
  try {
    entry = JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return {
      state: "legacy",
      message: "检测到旧版操作锁，请先确认相关程序已退出，再在数据目录中检查。",
    };
  }
  if (!Number.isInteger(entry.pid) || entry.pid <= 0)
    return {
      state: "legacy",
      message: "操作锁信息不完整，请打开数据目录检查。",
    };
  try {
    process.kill(entry.pid, 0);
    return { ...entry, state: "active", message: "有进程仍在使用操作锁。" };
  } catch (e) {
    if (e.code !== "ESRCH")
      return {
        ...entry,
        state: "active",
        message: "暂时无法核实进程是否退出。",
      };
  }
  return {
    ...entry,
    state: "stale",
    message: "检测到已退出进程留下的操作锁，可以整理恢复记录。",
  };
}

export async function recoverJournals(service) {
  if (service.busy) throw new Error("操作进行中");
  const lock = await lockStatus(service.dataDir);
  if (lock && lock.state !== "stale") throw new Error(lock.message);
  if (lock) {
    const latest = await lockStatus(service.dataDir);
    if (!latest || latest.state !== "stale" || latest.token !== lock.token)
      throw new Error("操作锁发生变化，请刷新");
    await fs.unlink(path.join(service.dataDir, "operation.lock"));
  }
  return service.exclusive(async () => {
    const root = path.join(service.dataDir, "backups");
    let recovered = 0;
    if (!(await stat(root))) return { recovered };
    for (const id of await fs.readdir(root)) {
      if (!/^[a-zA-Z0-9-]+$/.test(id)) continue;
      const folder = path.join(root, id);
      if (
        !(await stat(folder))?.isDirectory() ||
        (await stat(folder)).isSymbolicLink()
      )
        continue;
      const historyPath = path.join(service.dataDir, "history", id + ".json");
      let history;
      try {
        history = JSON.parse(await fs.readFile(historyPath, "utf8"));
      } catch {}
      if (history && history.phase !== "running") continue;
      const items = [];
      for (const file of await fs.readdir(folder)) {
        if (!/^\d+\.json$/.test(file)) continue;
        const j = JSON.parse(
          await fs.readFile(path.join(folder, file), "utf8"),
        );
        if (
          !j.backup ||
          !j.dest ||
          !inside(
            await canonical(path.dirname(j.backup)),
            await canonical(root),
          ) ||
          !(await stat(j.backup))
        )
          continue;
        const current = await entrySignature(j.dest),
          safe =
            current === "missing" ||
            (j.phase === "installed" && current === j.postEntry);
        items.push({
          ...j,
          status: "ok",
          label: "中断操作留下的备份",
          postEntry: safe ? current : undefined,
          parentReal: j.parentReal,
          error: safe
            ? "可预览恢复；执行前会再次核对。"
            : "当前版本无法确认，请恢复到其他文件夹进行比较。",
        });
      }
      if (items.length) {
        await atomicWrite(
          historyPath,
          JSON.stringify(
            {
              id,
              kind: "recovery",
              phase: "review",
              date: new Date().toISOString(),
              failed: 0,
              items,
            },
            null,
            2,
          ),
        );
        recovered++;
      }
    }
    return { recovered };
  });
}

export async function pendingJournals(dataDir) {
  const folder = path.join(dataDir, "history");
  if (!(await stat(folder))) return 0;
  let count = 0;
  for (const f of await fs.readdir(folder)) {
    if (!f.endsWith(".json")) continue;
    try {
      if (
        JSON.parse(await fs.readFile(path.join(folder, f), "utf8")).phase ===
        "running"
      )
        count++;
    } catch {}
  }
  return count;
}
