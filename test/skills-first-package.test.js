import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const dangerousRuntimeImports = [
  ["node:child", "_process"].join(""),
  ["child", "_process"].join(""),
  "node:worker_threads",
  "worker_threads",
];

test("package is skills-first and ships no native runtime entrypoint", async () => {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(repositoryRoot, ".codex-plugin", "plugin.json"), "utf8"));

  assert.equal(packageJson.openclaw, undefined, "skills-first package must not declare runtime extensions");
  assert.deepEqual(packageJson.files, [".codex-plugin", "README.md", "SECURITY.md", "docs", "skills"]);
  assert.equal(manifest.name, "potassium");
  assert.deepEqual(manifest.skills, ["./skills"]);
  assert.equal(manifest.contracts, undefined, "skills-first package must not declare plugin tool contracts");
  assert.equal(manifest.toolMetadata, undefined, "skills-first package must not declare plugin tool metadata");
});

test("shipped JavaScript files do not import process-spawning APIs", async () => {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  const files = await listPackagedJavaScriptFiles(packageJson.files);

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    for (const dangerousImport of dangerousRuntimeImports) {
      assert.equal(
        source.includes(dangerousImport),
        false,
        `${relative(repositoryRoot, filePath)} must not reference ${dangerousImport}`,
      );
    }
  }
});

async function listPackagedJavaScriptFiles(entries) {
  const files = [];

  for (const entry of entries) {
    const path = join(repositoryRoot, entry);
    await collectJavaScriptFiles(path, files);
  }

  return files;
}

async function collectJavaScriptFiles(path, files) {
  const pathStat = await stat(path);

  if (pathStat.isFile()) {
    if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
      files.push(path);
    }
    return;
  }

  if (!pathStat.isDirectory()) {
    return;
  }

  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    await collectJavaScriptFiles(join(path, entry.name), files);
  }
}
