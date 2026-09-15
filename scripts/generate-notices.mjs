import fs from "node:fs/promises";
import path from "node:path";

const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
const sections = [];
for (const [directory, info] of Object.entries(lock.packages)) {
  if (!directory || info.dev) continue;
  const pkg = JSON.parse(
    await fs.readFile(path.join(directory, "package.json"), "utf8"),
  );
  const files = (await fs.readdir(directory)).filter((name) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(name),
  );
  const texts = [];
  for (const name of files) {
    const file = path.join(directory, name);
    if ((await fs.stat(file)).isFile())
      texts.push(await fs.readFile(file, "utf8"));
  }
  if (!texts.length)
    throw new Error(`Missing license text for ${pkg.name}@${pkg.version}`);
  sections.push(
    `${pkg.name}@${pkg.version}\nLicense: ${pkg.license || info.license || "See below"}\n\n${texts.join("\n\n").trim()}`,
  );
}
const header =
  "SkillNacre 第三方软件许可\n\n本文件由锁定依赖的许可证自动生成。各依赖仍按其自身许可证授权。\nElectron / Chromium 的许可另见发行目录中的 LICENSE.electron.txt 和 LICENSES.chromium.html。\n\n";
await fs.writeFile(
  "THIRD_PARTY_NOTICES.txt",
  header + sections.sort().join("\n\n" + "=".repeat(72) + "\n\n") + "\n",
);
console.log(`Generated notices for ${sections.length} production packages.`);
