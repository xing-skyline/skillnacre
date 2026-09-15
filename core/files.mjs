import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "yaml";
import { ignored, protectedName, validName } from "./catalog.mjs";

export const hash = (text) => createHash("sha256").update(text).digest("hex");
export async function stat(p) {
  try {
    return await fs.lstat(p);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
export const same = (a, b) =>
  process.platform === "win32"
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    : path.resolve(a) === path.resolve(b);
export const inside = (p, root) => {
  const r = path.relative(root, p);
  return !r.startsWith(".." + path.sep) && r !== ".." && !path.isAbsolute(r);
};
export async function canonical(p) {
  try {
    return await fs.realpath(p);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const parent = path.dirname(p);
    if (parent === p) return p;
    return path.join(await canonical(parent), path.basename(p));
  }
}
export function metadata(content) {
  const m = content
    .replace(/^\uFEFF/, "")
    .match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) throw new Error("缺少 YAML 元数据（--- 开头的 name 和 description）");
  const data = parse(m[1], { maxAliasCount: 50 });
  if (
    !data ||
    typeof data.name !== "string" ||
    typeof data.description !== "string" ||
    !data.description.trim()
  )
    throw new Error("SKILL.md 需要有效的 name 和 description");
  validName(data.name);
  return {
    name: data.name,
    description: data.description.trim(),
    body: content.slice(m[0].length),
    tags: Array.isArray(data.tags)
      ? data.tags.filter((v) => typeof v === "string")
      : [],
  };
}
export async function readSkill(p, strict = true) {
  const content = await fs.readFile(path.join(p, "SKILL.md"), "utf8");
  let meta;
  try {
    meta = metadata(content);
    if (meta.name !== path.basename(p))
      throw new Error(
        `name 为 ${meta.name}，与目录 ${path.basename(p)} 不一致`,
      );
  } catch (e) {
    if (strict) throw e;
    meta = {
      name: path.basename(p),
      description: "元数据需要修正",
      body: content,
      tags: [],
      warning: e.message,
    };
  }
  const realPath = await fs.realpath(p);
  return {
    ...meta,
    id: path.basename(p),
    path: p,
    realPath,
    content,
    hash: hash(content),
    modified: (await fs.stat(path.join(p, "SKILL.md"))).mtime.toISOString(),
  };
}
export async function discover(root, grouped = false) {
  if (!root || !(await stat(root))) return [];
  const found = [];
  async function walk(dir, depth, category = "") {
    for (const ent of (await fs.readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (protectedName(ent.name) || ignored(ent.name)) continue;
      const p = path.join(dir, ent.name);
      if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
      if (await stat(path.join(p, "SKILL.md"))) {
        try {
          found.push({ ...(await readSkill(p, false)), category });
        } catch (e) {
          found.push({
            id: ent.name,
            name: ent.name,
            path: p,
            category,
            description: "无法读取",
            warning: e.message,
          });
        }
      } else if (grouped && depth < 2 && ent.isDirectory())
        await walk(p, depth + 1, category || ent.name);
    }
  }
  await walk(root, 0);
  const names = new Set();
  for (const s of found) {
    if (names.has(s.id))
      throw new Error(`技能名称重复：${s.id}。请先整理来源目录。`);
    names.add(s.id);
  }
  return found;
}
export async function fingerprint(p, logical = false, visited = new Set()) {
  const s = await stat(p);
  if (!s) return "missing";
  if (s.isSymbolicLink()) {
    const target = await fs.readlink(p);
    if (visited.has(p)) throw new Error("检测到循环软链接");
    const seen = new Set(visited);
    seen.add(p);
    return hash(
      `link:${target}:${await fingerprint(path.resolve(path.dirname(p), target), logical, seen)}`,
    );
  }
  if (s.isFile()) return hash(await fs.readFile(p));
  if (!s.isDirectory()) throw new Error(`不支持的文件类型：${p}`);
  const entries = [];
  for (const name of (await fs.readdir(p)).sort()) {
    if (ignored(name) || (logical && name === ".claude-plugin")) continue;
    entries.push(
      name + ":" + (await fingerprint(path.join(p, name), logical, visited)),
    );
  }
  return hash(entries.join("\n"));
}
export async function atomicWrite(p, content) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = path.join(path.dirname(p), `.skilldock-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tmp, content, { flag: "wx" });
    await fs.rename(tmp, p);
  } finally {
    if (await stat(tmp)) await fs.unlink(tmp);
  }
}
export async function copyTree(source, dest) {
  // Do not follow links embedded in imported packages into unrelated local files.
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });
  for (const ent of entries) {
    if (ignored(ent.name)) continue;
    const from = path.join(source, ent.name),
      to = path.join(dest, ent.name);
    if (ent.isSymbolicLink())
      throw new Error(`技能内含软链接，请先检查并改为普通文件：${from}`);
    if (ent.isDirectory()) await copyTree(from, to);
    else if (ent.isFile()) await fs.copyFile(from, to);
    else throw new Error(`不支持的文件类型：${from}`);
  }
}
export async function movePreserving(source, dest) {
  try {
    await fs.rename(source, dest);
    return;
  } catch (e) {
    if (e.code !== "EXDEV") throw e;
  }
  // Across drives, verify a complete copy before removing the original entry.
  const original = await stat(source);
  if (!original) throw new Error("待备份文件已不存在");
  const signature = async (p) =>
    original.isSymbolicLink() ? await fs.readlink(p) : await fingerprint(p);
  const before = await signature(source);
  await fs.cp(source, dest, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    errorOnExist: true,
    force: false,
  });
  if (
    (await signature(dest)) !== before ||
    (await signature(source)) !== before
  )
    throw new Error("跨磁盘备份校验失败，原文件已保留");
  const parent = await canonical(path.dirname(source)),
    resolved = path.join(parent, path.basename(source));
  if (!inside(resolved, parent) || same(resolved, parent))
    throw new Error("删除边界检查失败");
  if (original.isSymbolicLink() || original.isFile()) await fs.unlink(source);
  else await fs.rm(source, { recursive: true, force: false });
}
export async function linkStatus(dest, source) {
  const s = await stat(dest);
  if (!s) return "missing";
  if (!s.isSymbolicLink())
    return source && same(await canonical(dest), await canonical(source))
      ? "source"
      : "copy";
  let actual;
  try {
    actual = await fs.realpath(dest);
  } catch {
    return "broken";
  }
  return source && same(actual, await canonical(source)) ? "linked" : "wrong";
}
