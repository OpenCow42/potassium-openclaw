import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const installRoot = await mkdtemp(join(tmpdir(), "potassium-openclaw-install-"));
const maxBuffer = 10 * 1024 * 1024;

try {
  const packageDir = join(installRoot, "package");
  const extensionDir = join(installRoot, "extension");
  await mkdir(packageDir);
  await mkdir(extensionDir);

  const packageInfo = await npmPack(packageDir);
  await execFileAsync("tar", ["-xzf", join(packageDir, packageInfo.filename), "--strip-components=1", "-C", extensionDir], {
    maxBuffer,
  });
  await execFileAsync("npm", ["install", "--omit=dev", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund"], {
    cwd: extensionDir,
    maxBuffer,
  });

  const extensionRequire = createRequire(join(extensionDir, "index.js"));
  extensionRequire.resolve("liquid-potassium");
  await import(pathToFileURL(join(extensionDir, "index.js")).href);

  console.log(`Installed runtime smoke check passed: ${packageInfo.filename}`);
} finally {
  await rm(installRoot, { recursive: true, force: true });
}

async function npmPack(packageDir) {
  const { stdout } = await execFileAsync("npm", ["pack", "--json", "--pack-destination", packageDir], {
    cwd: repositoryRoot,
    maxBuffer,
  });

  let packageResults;
  try {
    packageResults = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Unable to parse npm pack --json output: ${error.message}\n${stdout}`);
  }

  const [packageInfo] = packageResults;
  if (!packageInfo?.filename) {
    throw new Error("npm pack --json did not return a package filename");
  }

  return packageInfo;
}
