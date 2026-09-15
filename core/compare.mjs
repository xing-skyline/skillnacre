import fs from "node:fs/promises";
import path from "node:path";
import { stat, hash } from "./files.mjs";
import { ignored } from "./catalog.mjs";

// Recovery checks the entry itself, never the content behind a symbolic link.
export async function entrySignature(p) {
  const s = await stat(p);
  if (!s) return "missing";
  if (s.isSymbolicLink()) return hash("link:" + (await fs.readlink(p)));
  if (s.isFile()) return hash(await fs.readFile(p));
  if (!s.isDirectory()) throw new Error("不支持的文件类型：" + p);
  const entries = [];
  for (const n of (await fs.readdir(p)).sort())
    entries.push(n + ":" + (await entrySignature(path.join(p, n))));
  return hash(entries.join("\n"));
}

export function lineDiff(before, after) {
  const a = before.split("\n"),
    b = after.split("\n");
  // Bounded LCS: large documents use a complete before/after block, avoiding UI stalls.
  if (a.length * b.length > 1_000_000)
    return {
      coarse: true,
      lines: [
        ...a.map((text) => ({ type: "remove", text })),
        ...b.map((text) => ({ type: "add", text })),
      ],
    };
  const dp = Array.from(
    { length: a.length + 1 },
    () => new Uint32Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const lines = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j])
      lines.push({ type: "same", text: a[i++], old: i, new: ++j });
    else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j]))
      lines.push({ type: "add", text: b[j++], new: j });
    else lines.push({ type: "remove", text: a[i++], old: i });
  }
  return { lines };
}

async function filesAt(root) {
  const result = new Map();
  let total = 0;
  async function visit(p, name) {
    const s = await stat(p);
    if (!s) return;
    if (++total > 5000) throw new Error("文件超过 5000 项，请在文件夹中比较");
    if (s.isSymbolicLink()) {
      const target = await fs.readlink(p);
      result.set(name, {
        kind: "link",
        hash: hash(target),
        text: "链接 → " + target,
      });
    } else if (s.isDirectory()) {
      for (const n of (await fs.readdir(p)).sort())
        if (!ignored(n) && n !== ".claude-plugin")
          await visit(path.join(p, n), name ? name + "/" + n : n);
    } else if (s.isFile()) {
      const buffer = await fs.readFile(p);
      let text;
      if (buffer.length <= 200_000 && !buffer.includes(0)) {
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {}
      }
      result.set(name, {
        kind: "file",
        hash: hash(buffer),
        size: buffer.length,
        text,
      });
    }
  }
  let resolved = root;
  if ((await stat(root))?.isSymbolicLink()) {
    try {
      if ((await fs.stat(root)).isDirectory())
        resolved = await fs.realpath(root);
    } catch {}
  }
  await visit(resolved, "");
  return result;
}

export async function treeDiff(before, after) {
  const [a, b] = await Promise.all([filesAt(before), filesAt(after)]);
  const files = [];
  let unchanged = 0,
    textBudget = 1_000_000;
  for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const left = a.get(name),
      right = b.get(name);
    if (left?.hash === right?.hash && left?.kind === right?.kind) {
      unchanged++;
      continue;
    }
    const item = {
      name: name || path.basename(before),
      status: !left ? "added" : !right ? "deleted" : "modified",
      beforeSize: left?.size,
      afterSize: right?.size,
    };
    if (
      (!left || left.text !== undefined) &&
      (!right || right.text !== undefined) &&
      textBudget > 0
    ) {
      const l = left?.text || "",
        r = right?.text || "";
      textBudget -= l.length + r.length;
      Object.assign(item, lineDiff(l, r));
    } else item.note = "二进制、大文件或超出预览总量，仅显示文件变化";
    files.push(item);
  }
  return { before, after, files, unchanged };
}
