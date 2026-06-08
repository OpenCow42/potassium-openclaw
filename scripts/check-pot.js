import { spawn } from "node:child_process";

const binary = process.argv[2] || process.env.POT_PATH || "pot";

const child = spawn(binary, ["--help"], {
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

child.on("error", (error) => {
  console.error(`pot check failed: ${error.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  if (code !== 0) {
    console.error(`pot exited with ${code}.`);
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
    process.exit(code ?? 1);
  }

  const firstLine = stdout.split("\n").find((line) => line.trim().length > 0) ?? "pot";
  console.log(`Found ${binary}: ${firstLine.trim()}`);
});
