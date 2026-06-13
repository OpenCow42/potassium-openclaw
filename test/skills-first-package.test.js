import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, relative } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
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
const expectedChannelIds = ["kchat"];
const dangerousRuntimeImports = [
  ["node:child", "_process"].join(""),
  ["child", "_process"].join(""),
  "node:worker_threads",
  "worker_threads",
];

test("package declares a native OpenClaw plugin backed by the published liquid-potassium package", async () => {
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
  assert.equal(packageJson.dependencies?.["liquid-potassium"], "0.2.0");
  assert.equal(packageJson.peerDependencies?.openclaw, ">=2026.6.6");

  assert.equal(nativeManifest.id, "potassium");
  assert.equal(nativeManifest.name, "Potassium");
  assert.deepEqual(nativeManifest.skills, ["./skills"]);
  assert.deepEqual(nativeManifest.channels, expectedChannelIds);
  assert.deepEqual(nativeManifest.channelEnvVars?.kchat, ["INFOMANIAK_TOKEN"]);
  assert.deepEqual(nativeManifest.contracts?.tools, expectedToolNames);
  assert.equal("token" in nativeManifest.configSchema?.properties, false);
  assert.equal(nativeManifest.configSchema?.properties?.tokenEnvName?.default, "INFOMANIAK_TOKEN");
  assert.equal(nativeManifest.configSchema?.properties?.blockMutating?.default, true);
  assert.deepEqual(nativeManifest.setup?.providers?.[0]?.envVars, ["INFOMANIAK_TOKEN"]);
  assert.equal(nativeManifest.channelConfigs?.kchat?.label, "Infomaniak kChat");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.additionalProperties, false);
  assert.equal("token" in nativeManifest.channelConfigs?.kchat?.schema?.properties, false);
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.tokenEnvName?.default, "INFOMANIAK_TOKEN");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.teamName?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.defaultChannel?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.setOnline?.type, "boolean");

  assert.equal(codexManifest.name, "potassium");
  assert.equal(codexManifest.license, "Apache-2.0");
  assert.equal(codexManifest.repository, "https://github.com/OpenCow42/potassium-openclaw");
  assert.equal(codexManifest.author?.name, "OpenCow");
  assert.equal(codexManifest.skills, "./skills/");
  assert.equal(codexManifest.interface?.displayName, "Potassium");
});

test("runtime entry registers exactly the manifest tool contracts", async () => {
  const pluginModule = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const plugin = pluginModule.default;
  const registeredTools = [];
  const registeredChannels = [];

  assert.equal("token" in pluginModule.PotassiumPluginConfigJsonSchema.properties, false);
  assert.equal("token" in pluginModule.PotassiumKchatChannelConfigJsonSchema.properties, false);

  plugin.register({
    pluginConfig: { allowedDomains: ["kdrive"], tokenEnvName: "INFOMANIAK_TOKEN" },
    config: { channels: { kchat: { enabled: true } } },
    registerChannel(channel) {
      registeredChannels.push(channel);
    },
    registerTool(tool) {
      registeredTools.push(tool);
    },
  });

  assert.equal(plugin.id, "potassium");
  assert.equal(plugin.name, "Potassium");
  assert.deepEqual(registeredTools.map((tool) => tool.name), expectedToolNames);
  assert.ok(registeredTools.every((tool) => tool.label && tool.description && tool.parameters));
  assert.deepEqual(registeredChannels.map(({ plugin: channelPlugin }) => channelPlugin.id), expectedChannelIds);

  const [kchatChannel] = registeredChannels.map(({ plugin: channelPlugin }) => channelPlugin);
  assert.equal(kchatChannel.meta.label, "Infomaniak kChat");
  assert.deepEqual(kchatChannel.capabilities.chatTypes, ["direct", "group", "channel", "thread"]);
  assert.equal(kchatChannel.message?.id, "kchat");
  assert.equal(kchatChannel.message?.send?.text instanceof Function, true);
  assert.deepEqual(kchatChannel.message?.durableFinal?.capabilities, {
    text: true,
    replyTo: true,
    thread: true,
  });
  assert.equal(kchatChannel.outbound?.deliveryMode, "direct");
  assert.equal(kchatChannel.outbound?.sendText instanceof Function, true);
  assert.equal(kchatChannel.config.hasConfiguredState({ cfg: {}, env: { INFOMANIAK_TOKEN: "placeholder" } }), true);
  assert.equal(kchatChannel.config.hasConfiguredState({ cfg: {}, env: {} }), false);
});

test("kChat outbound sends directly to id: destinations without channel lookup", async () => {
  const { createPotassiumKchatMessageAdapter } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const calls = [];
  const client = {
    kchat: {
      async getchannelbynameforteamname(request) {
        calls.push(["lookup", request]);
        throw new Error("id: destinations must not resolve channel names");
      },
      async createpost(request) {
        calls.push(["createpost", request]);
        return { id: "post-123", channel_id: "channel-123", create_at: 1710000000000 };
      },
    },
  };
  const adapter = createPotassiumKchatMessageAdapter({ client });

  const result = await adapter.send.text({
    cfg: { channels: { kchat: { teamName: "main-team" } } },
    to: "id:channel-123",
    text: "hello from tests",
    replyToId: "root-from-reply",
  });

  assert.deepEqual(calls, [
    [
      "createpost",
      {
        body: {
          channel_id: "channel-123",
          message: "hello from tests",
          root_id: "root-from-reply",
        },
      },
    ],
  ]);
  assert.equal(result.messageId, "post-123");
  assert.equal(result.receipt.primaryPlatformMessageId, "post-123");
  assert.equal(result.receipt.replyToId, "root-from-reply");
  assert.deepEqual(result.providerResult, { id: "post-123", channel_id: "channel-123", create_at: 1710000000000 });
});

test("kChat outbound resolves #channel destinations before creating posts", async () => {
  const { createPotassiumKchatMessageAdapter } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const calls = [];
  const client = {
    kchat: {
      async getchannelbynameforteamname(request) {
        calls.push(["lookup", request]);
        return { id: "alerts-channel-id", name: "alerts" };
      },
      async createpost(request) {
        calls.push(["createpost", request]);
        return { id: "post-456", channel_id: "alerts-channel-id" };
      },
    },
  };
  const adapter = createPotassiumKchatMessageAdapter({ client });

  const result = await adapter.send.text({
    cfg: { channels: { kchat: { teamName: "main-team", setOnline: false } } },
    to: "#alerts",
    text: "threaded update",
    threadId: "thread-root",
    replyToId: "reply-ignored-when-thread-exists",
  });

  assert.deepEqual(calls, [
    [
      "lookup",
      {
        path: {
          team_name: "main-team",
          channel_name: "alerts",
        },
      },
    ],
    [
      "createpost",
      {
        body: {
          channel_id: "alerts-channel-id",
          message: "threaded update",
          root_id: "thread-root",
        },
        query: {
          set_online: false,
        },
      },
    ],
  ]);
  assert.equal(result.messageId, "post-456");
  assert.equal(result.receipt.threadId, "thread-root");
  assert.equal(result.receipt.replyToId, "reply-ignored-when-thread-exists");
});

test("runtime entry rejects direct bearer-token config", async () => {
  const plugin = (await import(pathToFileURL(join(repositoryRoot, "index.js")).href)).default;

  assert.throws(
    () =>
      plugin.register({
        pluginConfig: { token: "placeholder" },
        registerTool() {},
      }),
    /Direct Infomaniak token config is disabled/,
  );
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
