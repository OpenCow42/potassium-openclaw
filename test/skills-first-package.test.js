import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, relative } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const liquidPotassiumSha = "28450a310eeed5ffb18e05e9a93f60be506260b8";
const expectedToolNames = [
  "infomaniak_domains",
  "infomaniak_search",
  "infomaniak_describe",
  "infomaniak_discover",
  "infomaniak_mail_application",
  "infomaniak_workflow_list",
  "infomaniak_workflow_describe",
  "infomaniak_workflow_run",
  "infomaniak_call",
];
const dangerousRuntimeImports = [
  ["node:child", "_process"].join(""),
  ["child", "_process"].join(""),
  "node:worker_threads",
  "worker_threads",
];

test("package declares a native OpenClaw plugin backed by a pinned liquid-potassium commit", async () => {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  const nativeManifest = JSON.parse(await readFile(join(repositoryRoot, "openclaw.plugin.json"), "utf8"));
  const codexManifest = JSON.parse(await readFile(join(repositoryRoot, ".codex-plugin", "plugin.json"), "utf8"));

  assert.equal(packageJson.private, undefined, "public bundle must not be marked private");
  assert.equal(packageJson.license, "Apache-2.0");
  assert.equal(packageJson.homepage, "https://github.com/OpenCow42/potassium-openclaw#readme");
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "git+https://github.com/OpenCow42/potassium-openclaw.git",
  });
  assert.deepEqual(packageJson.bugs, {
    url: "https://github.com/OpenCow42/potassium-openclaw/issues",
  });
  assert.equal(packageJson.publishConfig?.access, "public");
  assert.deepEqual(packageJson.files, [".codex-plugin", "openclaw.plugin.json", "index.js", "README.md", "LICENSE", "SECURITY.md", "docs", "skills"]);
  assert.deepEqual(packageJson.openclaw?.extensions, ["./index.js"]);
  assert.equal(packageJson.dependencies?.["liquid-potassium"], `github:OpenCow42/liquidPotassium#${liquidPotassiumSha}`);
  assert.equal(packageJson.peerDependencies?.openclaw, ">=2026.6.6");

  assert.equal(nativeManifest.id, "potassium");
  assert.equal(nativeManifest.name, "Potassium");
  assert.deepEqual(nativeManifest.skills, ["./skills"]);
  assert.deepEqual(nativeManifest.contracts?.tools, expectedToolNames);
  assert.equal(nativeManifest.configSchema?.properties?.tokenEnvName?.default, "INFOMANIAK_TOKEN");
  assert.equal(nativeManifest.configSchema?.properties?.blockMutating?.default, true);
  assert.deepEqual(nativeManifest.setup?.providers?.[0]?.envVars, ["INFOMANIAK_TOKEN"]);

  assert.equal(codexManifest.name, "potassium");
  assert.deepEqual(codexManifest.skills, ["./skills"]);
});

test("runtime entry registers exactly the manifest tool contracts", async () => {
  const plugin = (await import(pathToFileURL(join(repositoryRoot, "index.js")).href)).default;
  const registeredTools = [];

  plugin.register({
    pluginConfig: { allowedDomains: ["kdrive"], tokenEnvName: "INFOMANIAK_TOKEN" },
    registerTool(tool) {
      registeredTools.push(tool);
    },
  });

  assert.equal(plugin.id, "potassium");
  assert.equal(plugin.name, "Potassium");
  assert.deepEqual(registeredTools.map((tool) => tool.name), expectedToolNames);
  assert.ok(registeredTools.every((tool) => tool.label && tool.description && tool.parameters));
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
