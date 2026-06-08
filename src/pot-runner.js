import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { commandRisk } from "./catalog.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;
const DEFAULT_TOKEN_ENV_NAME = "INFOMANIAK_TOKEN";
const DEFAULT_FORMAT = "json";

export function normalizeConfig(config = {}) {
  return {
    potPath: config.potPath || "pot",
    tokenEnvName: config.tokenEnvName || DEFAULT_TOKEN_ENV_NAME,
    defaultFormat: config.defaultFormat || DEFAULT_FORMAT,
    mutationMode: config.mutationMode || "deny",
    outputRoot: config.outputRoot,
    timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxOutputBytes: config.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES,
  };
}

export function buildPotArgs(request, config = {}) {
  const normalizedConfig = normalizeConfig(config);
  const format = request.format || normalizedConfig.defaultFormat;
  const args = [request.namespace, request.command];

  for (const option of request.options || []) {
    const name = normalizeOptionName(option.name);
    assertAllowedOptionName(name);

    for (const value of normalizeOptionValues(option.value)) {
      if (name === "--output") {
        assertContainedOutputPath(String(value), normalizedConfig.outputRoot);
      }

      args.push(name, String(value));
    }
  }

  args.push("--format", format);
  return args;
}

export async function runPot(request, config = {}, environment = process.env) {
  const normalizedConfig = normalizeConfig(config);
  const mergedEnvironment = { ...process.env, ...environment };
  const token = mergedEnvironment[normalizedConfig.tokenEnvName];

  if (!token) {
    throw new Error(`Missing Infomaniak bearer token in ${normalizedConfig.tokenEnvName}.`);
  }

  const risk = commandRisk(request.namespace, request.command);
  if (request.kind === "read" && risk === "mutation") {
    throw new Error(`Command ${request.namespace} ${request.command} is a mutation; use infomaniak_mutate.`);
  }

  if (request.kind === "mutate" && normalizedConfig.mutationMode !== "allow") {
    throw new Error("Infomaniak mutations are disabled. Set mutationMode to allow after enabling the optional mutate tool.");
  }

  const args = buildPotArgs(request, normalizedConfig);
  const startedAt = Date.now();
  const result = await spawnAndCollect(normalizedConfig.potPath, args, mergedEnvironment, normalizedConfig);
  const stdout = redact(result.stdout, [token]);
  const stderr = redact(result.stderr, [token]);
  const output = {
    ok: result.exitCode === 0,
    binary: normalizedConfig.potPath,
    argv: args,
    risk,
    exitCode: result.exitCode,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
  };

  if (result.exitCode !== 0) {
    throw new Error(`pot exited with ${result.exitCode}: ${stderr || stdout || "no output"}`);
  }

  if ((request.format || normalizedConfig.defaultFormat) === "json") {
    output.json = parseJSON(stdout);
  }

  return output;
}

function normalizeOptionName(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Option name must be a non-empty string.");
  }

  const trimmed = name.trim();
  return trimmed.startsWith("--") ? trimmed : `--${trimmed}`;
}

function assertAllowedOptionName(name) {
  if (name === "--token") {
    throw new Error("Do not pass --token. Configure credentials through the token environment variable.");
  }

  if (!/^--[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(`Unsupported option name: ${name}`);
  }
}

function normalizeOptionValues(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    throw new Error("Option value cannot be null or undefined.");
  }

  return [value];
}

function assertContainedOutputPath(path, outputRoot) {
  if (!outputRoot) {
    throw new Error("Commands that use --output require config.outputRoot.");
  }

  const resolvedRoot = resolve(outputRoot);
  const resolvedPath = resolve(path);
  const isContained = resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${sep}`);

  if (!isContained) {
    throw new Error(`Output path ${path} is outside configured outputRoot.`);
  }
}

function spawnAndCollect(binary, args, environment, config) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, {
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    let truncated = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, config.timeoutMs);

    const collect = (streamName) => (chunk) => {
      const text = chunk.toString("utf8");
      outputBytes += Buffer.byteLength(text);
      if (outputBytes > config.maxOutputBytes) {
        truncated = true;
        child.kill("SIGTERM");
        return;
      }

      if (streamName === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }
    };

    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);

      if (timedOut) {
        reject(new Error(`pot timed out after ${config.timeoutMs}ms.`));
        return;
      }

      if (truncated) {
        reject(new Error(`pot output exceeded ${config.maxOutputBytes} bytes.`));
        return;
      }

      resolvePromise({ exitCode, stdout, stderr });
    });
  });
}

function parseJSON(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function redact(text, secrets) {
  let redacted = text;
  for (const secret of secrets.filter(Boolean)) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}
