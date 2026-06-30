import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const workspaceOnlyPrefixes = [".github/", ".local/", "node_modules/", "scripts/", "site/", "src/", "test/"];

const requiredFixedFiles = [
  ".codex-plugin/plugin.json",
  "openclaw.plugin.json",
  "package.json",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "index.js",
];

const packageJson = await readJson("package.json");
const openclawManifest = await readJson("openclaw.plugin.json");
const codexManifest = await readJson(".codex-plugin/plugin.json");
const expectedFiles = new Set(requiredFixedFiles);

await addRequiredFilesFromDirectory("docs", "documentation");
await addRequiredFilesFromDirectory("skills", "skills");

for (const entrypoint of [
  packageJson.main,
  packageJson.exports?.["."],
  ...(packageJson.openclaw?.extensions ?? []),
]) {
  const normalizedEntrypoint = normalizePackagePath(entrypoint);
  if (normalizedEntrypoint) {
    expectedFiles.add(normalizedEntrypoint);
  }
}

if (!new Set(openclawManifest.skills?.map(normalizePackagePath)).has("skills")) {
  fail('openclaw.plugin.json must point at the bundled "./skills" directory');
}

if (normalizePackagePath(codexManifest.skills) !== "skills") {
  fail('Codex plugin metadata must point at the bundled "skills" directory');
}

const packInfo = await npmPackDryRun();
const packedFiles = new Set(packInfo.files.map(({ path }) => path));
const missingFiles = [...expectedFiles]
  .filter(Boolean)
  .filter((file) => !packedFiles.has(file))
  .sort();
const unexpectedWorkspaceFiles = [...packedFiles]
  .filter((file) => workspaceOnlyPrefixes.some((prefix) => file.startsWith(prefix)))
  .sort();

if (packInfo.name !== packageJson.name) {
  fail(`npm pack reported package name ${packInfo.name}, expected ${packageJson.name}`);
}

if (packInfo.version !== packageJson.version) {
  fail(`npm pack reported package version ${packInfo.version}, expected ${packageJson.version}`);
}

if (missingFiles.length > 0) {
  fail(`npm pack omitted required files:\n${missingFiles.map((file) => `- ${file}`).join("\n")}`);
}

if (unexpectedWorkspaceFiles.length > 0) {
  fail(`npm pack included workspace-only files:\n${unexpectedWorkspaceFiles.map((file) => `- ${file}`).join("\n")}`);
}

console.log(`Package contents smoke check passed: ${packInfo.files.length} files in ${packInfo.filename}`);

async function npmPackDryRun() {
  const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], {
    cwd: repositoryRoot,
    maxBuffer: 10 * 1024 * 1024,
  });

  let packResults;
  try {
    packResults = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Unable to parse npm pack --dry-run --json output: ${error.message}\n${stdout}`);
  }

  const [packInfo] = packResults;
  if (!packInfo || !Array.isArray(packInfo.files)) {
    fail("npm pack --dry-run --json did not return a package file list");
  }

  return packInfo;
}

async function readJson(packagePath) {
  return JSON.parse(await readFile(join(repositoryRoot, packagePath), "utf8"));
}

async function addRequiredFilesFromDirectory(directoryPath, label) {
  const files = await listFiles(directoryPath);
  if (files.length === 0) {
    fail(`expected at least one ${label} file under ${directoryPath}/`);
  }

  for (const file of files) {
    expectedFiles.add(file);
  }
}

async function listFiles(directoryPath) {
  const absoluteDirectory = join(repositoryRoot, directoryPath);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(absoluteDirectory, entry.name);
    const packagePath = normalizePackagePath(relative(repositoryRoot, absolutePath));

    if (entry.isDirectory()) {
      files.push(...(await listFiles(packagePath)));
    } else if (entry.isFile()) {
      files.push(packagePath);
    }
  }

  return files.sort();
}

function normalizePackagePath(packagePath) {
  return typeof packagePath === "string"
    ? packagePath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "")
    : undefined;
}

function fail(message) {
  throw new Error(`Package contents smoke check failed: ${message}`);
}
