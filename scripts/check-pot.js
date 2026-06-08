import { spawn } from "node:child_process";

const binary = process.argv[2] || process.env.POT_PATH || "pot";
const minimumVersion = process.env.POT_MIN_VERSION || "0.0.2";

try {
  const versionResult = await run(binary, ["version"]);
  const version = extractVersion(versionResult.stdout);

  if (!version) {
    throw new Error(`Could not parse pot version output: ${versionResult.stdout.trim() || "empty output"}`);
  }

  if (compareVersions(version, minimumVersion) < 0) {
    throw new Error(`Found ${binary} ${version}, but ${minimumVersion} or newer is required.`);
  }

  const helpResult = await run(binary, ["--help"]);
  const firstLine = helpResult.stdout.split("\n").find((line) => line.trim().length > 0) ?? "pot";
  console.log(`Found ${binary} ${version}: ${firstLine.trim()}`);
} catch (error) {
  console.error(`pot check failed: ${error.message}`);
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}: ${stderr.trim() || stdout.trim() || "no output"}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function extractVersion(output) {
  const match = output.match(/\b(\d+\.\d+\.\d+)(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match?.[1];
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }

  return 0;
}

function versionParts(version) {
  return version.split(".").map((part) => Number.parseInt(part, 10));
}
