import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { commandRisk, searchCatalog } from "../src/catalog.js";
import { buildPotArgs, runPot } from "../src/pot-runner.js";

test("buildPotArgs rejects token options", () => {
  assert.throws(
    () =>
      buildPotArgs({
        namespace: "kdrive",
        command: "users",
        options: [{ name: "--token", value: "secret" }],
      }),
    /Do not pass --token/,
  );
});

test("buildPotArgs repeats array options and appends format", () => {
  const args = buildPotArgs({
    namespace: "kdrive",
    command: "files-exists",
    options: [
      { name: "drive-id", value: 123 },
      { name: "file-id", value: [1, 2] },
    ],
    format: "json",
  });

  assert.deepEqual(args, [
    "kdrive",
    "files-exists",
    "--drive-id",
    "123",
    "--file-id",
    "1",
    "--file-id",
    "2",
    "--format",
    "json",
  ]);
});

test("buildPotArgs contains output paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "pot-openclaw-output-"));

  assert.doesNotThrow(() =>
    buildPotArgs(
      {
        namespace: "kdrive",
        command: "download-file",
        options: [{ name: "output", value: join(root, "file.bin") }],
      },
      { outputRoot: root },
    ),
  );

  assert.throws(
    () =>
      buildPotArgs(
        {
          namespace: "kdrive",
          command: "download-file",
          options: [{ name: "output", value: join(tmpdir(), "outside.bin") }],
        },
        { outputRoot: root },
      ),
    /outside configured outputRoot/,
  );
});

test("runPot spawns argv array and injects token through environment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pot-openclaw-fake-"));
  const fakeBinary = join(dir, "pot");
  await writeFile(
    fakeBinary,
    [
      "#!/usr/bin/env node",
      "const payload = { argv: process.argv.slice(2), hasToken: Boolean(process.env.INFOMANIAK_TOKEN) };",
      "console.log(JSON.stringify(payload));",
    ].join("\n"),
  );
  await chmod(fakeBinary, 0o755);

  const result = await runPot(
    {
      kind: "read",
      namespace: "kdrive",
      command: "users",
      options: [{ name: "page", value: 1 }],
    },
    { potPath: fakeBinary },
    { INFOMANIAK_TOKEN: "test-token" },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.json, {
    argv: ["kdrive", "users", "--page", "1", "--format", "json"],
    hasToken: true,
  });
});

test("runPot denies mutations by default", async () => {
  await assert.rejects(
    () =>
      runPot(
        {
          kind: "mutate",
          namespace: "mail",
          command: "draft-create",
          options: [],
        },
        { potPath: "/does/not/matter" },
        { INFOMANIAK_TOKEN: "test-token" },
      ),
    /mutations are disabled/,
  );
});

test("mail move is cataloged as a mutation", () => {
  const [entry] = searchCatalog({ namespace: "mail", query: "move", limit: 1 });

  assert.equal(entry.command, "move");
  assert.equal(commandRisk("mail", "move"), "mutation");
});

test("url shortener catalog includes read and mutation commands", () => {
  const commands = searchCatalog({ namespace: "url-shortener", limit: 20 }).map(
    (entry) => entry.command,
  );

  assert.deepEqual(commands, [
    "list",
    "list-v2",
    "quota",
    "quota-v2",
    "create",
    "create-v2",
    "update",
  ]);
  assert.equal(commandRisk("url-shortener", "list-v2"), "read");
  assert.equal(commandRisk("url-shortener", "create-v2"), "mutation");
  assert.equal(commandRisk("url-shortener", "update"), "mutation");
});
