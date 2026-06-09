import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const skillsRoot = fileURLToPath(new URL("../skills/", import.meta.url));
const allowedOpenClawMetadataKeys = new Set(["requires", "primaryEnv", "install"]);
const allowedInstallerKinds = new Set(["brew", "node", "go", "uv", "download"]);

test("bundled skills follow documented OpenClaw skill metadata", async () => {
  const skillFiles = await listSkillFiles();

  assert.ok(skillFiles.length > 0, "expected bundled skills");

  for (const { skillName, skillPath } of skillFiles) {
    const markdown = await readFile(skillPath, "utf8");
    const frontmatter = extractFrontmatter(markdown, skillPath);
    const metadata = extractOpenClawMetadata(frontmatter, skillPath);

    assert.equal(findFrontmatterValue(frontmatter, "name"), skillName, `${skillName} frontmatter name must match directory`);
    assert.notEqual(skillName, "infomaniak", "bundle must not expose Infomaniak as a skill/tool name");

    assert.equal(
      findFrontmatterValue(frontmatter, "homepage"),
      "https://github.com/OpenCow42/tool-releases",
      `${skillName} must expose the Potassium releases homepage`,
    );

    assert.deepEqual(metadata.requires?.bins, ["pot"], `${skillName} must require pot`);
    assert.ok(metadata.requires?.env?.includes("INFOMANIAK_TOKEN"), `${skillName} must require INFOMANIAK_TOKEN`);
    assert.equal(metadata.primaryEnv, "INFOMANIAK_TOKEN", `${skillName} must declare primaryEnv`);
    assert.deepEqual(
      Object.keys(metadata).sort(),
      [...allowedOpenClawMetadataKeys].sort(),
      `${skillName} must use only documented metadata.openclaw keys`,
    );

    for (const install of metadata.install ?? []) {
      assert.ok(
        allowedInstallerKinds.has(install.kind),
        `${skillName} installer ${install.id ?? "<unnamed>"} must use a documented installer kind`,
      );
      assert.notEqual(install.kind, "apt", `${skillName} must keep APT as operator docs, not installer metadata`);
    }

    assert.ok(
      metadata.install?.some(
        (install) =>
          install.kind === "brew" &&
          install.formula === "opencow42/tap/potassium" &&
          install.bins?.includes("pot"),
      ),
      `${skillName} must expose the Potassium Homebrew installer hint`,
    );
  }
});

async function listSkillFiles() {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skillFiles = [];

  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const skillPath = join(skillsRoot, entry.name, "SKILL.md");

    try {
      await readFile(skillPath, "utf8");
      skillFiles.push({ skillName: entry.name, skillPath });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return skillFiles;
}

function extractFrontmatter(markdown, skillPath) {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatterMatch, `${skillPath} must have frontmatter`);
  return frontmatterMatch[1];
}

function findFrontmatterValue(frontmatter, key) {
  const prefix = `${key}: `;
  const line = frontmatter
    .split("\n")
    .find((candidate) => candidate.startsWith(prefix));

  return line?.slice(prefix.length).trim();
}

function extractOpenClawMetadata(frontmatter, skillPath) {
  const metadataLine = frontmatter
    .split("\n")
    .find((line) => line.startsWith("metadata: "));

  assert.ok(metadataLine, `${skillPath} must have metadata frontmatter`);

  const metadata = JSON.parse(metadataLine.slice("metadata: ".length));
  assert.ok(metadata.openclaw, `${skillPath} must have metadata.openclaw`);
  return metadata.openclaw;
}
