import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { searchCatalog } from "./catalog.js";
import { runPot } from "./pot-runner.js";

const namespaceSchema = Type.Union([
  Type.Literal("kdrive"),
  Type.Literal("kchat"),
  Type.Literal("mail"),
  Type.Literal("url-shortener"),
]);

const optionValueSchema = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean()])),
]);

const optionSchema = Type.Object({
  name: Type.String({ description: "Potassium option name, for example drive-id or --drive-id." }),
  value: optionValueSchema,
});

const runParametersSchema = Type.Object({
  namespace: namespaceSchema,
  command: Type.String({ description: "Potassium command name inside the namespace." }),
  options: Type.Optional(Type.Array(optionSchema)),
  format: Type.Optional(Type.Union([Type.Literal("json"), Type.Literal("text")])),
});

export default defineToolPlugin({
  id: "infomaniak",
  name: "Infomaniak",
  description: "Use the prebuilt Potassium CLI command pot to interact with Infomaniak APIs.",
  configSchema: Type.Object({
    potPath: Type.Optional(Type.String({ description: "Absolute path to the Potassium pot binary. Defaults to PATH lookup." })),
    tokenEnvName: Type.Optional(Type.String({ description: "Environment variable containing the Infomaniak bearer token." })),
    defaultFormat: Type.Optional(Type.Union([Type.Literal("json"), Type.Literal("text")])),
    mutationMode: Type.Optional(Type.Union([Type.Literal("deny"), Type.Literal("allow")])),
    outputRoot: Type.Optional(Type.String({ description: "Containment root for --output paths." })),
    timeoutMs: Type.Optional(Type.Number({ minimum: 1000 })),
    maxOutputBytes: Type.Optional(Type.Number({ minimum: 1024 })),
  }),
  tools: (tool) => [
    tool({
      name: "infomaniak_search_commands",
      label: "Search Infomaniak Commands",
      description: "Search Potassium commands for Infomaniak kDrive, kChat, Mail, and URL shortener.",
      parameters: Type.Object({
        query: Type.Optional(Type.String()),
        namespace: Type.Optional(namespaceSchema),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
      }),
      execute({ query = "", namespace, limit = 20 }) {
        return {
          commands: searchCatalog({ query, namespace, limit }),
          note: "This is a seeded catalog until Potassium exposes `pot catalog --format json`.",
        };
      },
    }),
    tool({
      name: "infomaniak_read",
      label: "Read Infomaniak",
      description: "Run a read-only Potassium command with JSON output by default.",
      parameters: runParametersSchema,
      async execute(params, config) {
        return runPot({ ...params, kind: "read" }, config);
      },
    }),
    tool({
      name: "infomaniak_mutate",
      label: "Mutate Infomaniak",
      description: "Run an explicitly enabled Potassium mutation command.",
      optional: true,
      parameters: runParametersSchema,
      async execute(params, config) {
        return runPot({ ...params, kind: "mutate" }, config);
      },
    }),
  ],
});
