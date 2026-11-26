// Bumps the version everywhere, commits and pushes. GitHub Actions then builds
// and publishes the release, and installed copies update themselves.
//   npm run release            -> 0.2.0 -> 0.2.1
//   npm run release -- minor   -> 0.2.0 -> 0.3.0
//   npm run release -- 1.0.0
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const sh = (cmd) => execSync(cmd, { stdio: "inherit" });
const conf = "src-tauri/tauri.conf.json";
const current = JSON.parse(readFileSync(conf, "utf8")).version;
const arg = process.argv[2] ?? "patch";
const [ma, mi, pa] = current.split(".").map(Number);
const next =
  arg === "major" ? `${ma + 1}.0.0` : arg === "minor" ? `${ma}.${mi + 1}.0` : arg === "patch" ? `${ma}.${mi}.${pa + 1}` : arg;
if (!/^\d+\.\d+\.\d+$/.test(next)) throw new Error(`Not a version: ${next}`);

const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (dirty) console.log("Including uncommitted changes in this release:\n" + dirty);

const replace = (file, from, to) => {
  const text = readFileSync(file, "utf8");
  if (!from.test(text)) throw new Error(`Version not found in ${file}`);
  writeFileSync(file, text.replace(from, to));
};
replace(conf, /("version":\s*")[^"]+(")/, `$1${next}$2`);
replace("package.json", /("version":\s*")[^"]+(")/, `$1${next}$2`);
replace("src-tauri/Cargo.toml", /^(version\s*=\s*")[^"]+(")/m, `$1${next}$2`);
replace("src-tauri/Cargo.lock", /(name = "studymed"\r?\nversion = ")[^"]+(")/, `$1${next}$2`);

sh("git add -A");
sh(`git commit -m "Release v${next}"`);
sh("git push");
console.log(`\nPushed v${next}. GitHub is building it now; installed copies will update within a few hours.`);
