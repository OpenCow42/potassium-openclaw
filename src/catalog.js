export const commandCatalog = [
  {
    namespace: "kdrive",
    command: "users",
    summary: "List kDrive users visible to the token.",
    risk: "read",
    requiredOptions: [],
  },
  {
    namespace: "kdrive",
    command: "drives",
    summary: "List accessible kDrives for an account.",
    risk: "read",
    requiredOptions: ["--account-id"],
  },
  {
    namespace: "kdrive",
    command: "drive",
    summary: "Fetch one kDrive by id.",
    risk: "read",
    requiredOptions: ["--drive-id"],
  },
  {
    namespace: "kdrive",
    command: "directory-files",
    summary: "List files in a kDrive directory.",
    risk: "read",
    requiredOptions: ["--drive-id", "--file-id"],
  },
  {
    namespace: "kdrive",
    command: "search-files",
    summary: "Search files in a kDrive.",
    risk: "read",
    requiredOptions: ["--drive-id"],
  },
  {
    namespace: "kdrive",
    command: "download-file",
    summary: "Download a kDrive file to a contained output path.",
    risk: "file-write",
    requiredOptions: ["--drive-id", "--file-id", "--output"],
  },
  {
    namespace: "kdrive",
    command: "upload-file",
    summary: "Upload a local file into kDrive.",
    risk: "mutation",
    requiredOptions: ["--drive-id", "--file"],
  },
  {
    namespace: "kchat",
    command: "teams",
    summary: "List kChat teams for a team name context.",
    risk: "read",
    requiredOptions: ["--team-name"],
  },
  {
    namespace: "kchat",
    command: "channels",
    summary: "List kChat channels.",
    risk: "read",
    requiredOptions: ["--team-name"],
  },
  {
    namespace: "kchat",
    command: "channel-posts",
    summary: "List posts in a kChat channel.",
    risk: "read",
    requiredOptions: ["--team-name", "--channel-id"],
  },
  {
    namespace: "kchat",
    command: "post-create",
    summary: "Create a kChat post.",
    risk: "mutation",
    requiredOptions: ["--team-name", "--channel-id", "--message"],
  },
  {
    namespace: "mail",
    command: "user-mailboxes",
    summary: "List current-user Mail mailboxes.",
    risk: "read",
    requiredOptions: [],
  },
  {
    namespace: "mail",
    command: "folders",
    summary: "List folders for a mailbox UUID.",
    risk: "read",
    requiredOptions: ["--mailbox-uuid"],
  },
  {
    namespace: "mail",
    command: "threads",
    summary: "List Mail threads in a folder.",
    risk: "read",
    requiredOptions: ["--mailbox-uuid", "--folder-id"],
  },
  {
    namespace: "mail",
    command: "message",
    summary: "Fetch one Mail message by resource id.",
    risk: "read",
    requiredOptions: ["--resource"],
  },
  {
    namespace: "mail",
    command: "draft-create",
    summary: "Create a Mail draft.",
    risk: "mutation",
    requiredOptions: ["--mailbox-uuid", "--to", "--body"],
  },
  {
    namespace: "mail",
    command: "move",
    summary: "Move Mail messages between folders.",
    risk: "mutation",
    requiredOptions: ["--mailbox-uuid", "--uid", "--to-folder-id"],
  },
  {
    namespace: "url-shortener",
    command: "list",
    summary: "List URL shortener links.",
    risk: "read",
    requiredOptions: [],
  },
  {
    namespace: "url-shortener",
    command: "list-v2",
    summary: "List URL shortener links through the v2 route.",
    risk: "read",
    requiredOptions: [],
  },
  {
    namespace: "url-shortener",
    command: "quota",
    summary: "Read URL shortener quota.",
    risk: "read",
    requiredOptions: [],
  },
  {
    namespace: "url-shortener",
    command: "quota-v2",
    summary: "Read URL shortener quota through the v2 route.",
    risk: "read",
    requiredOptions: [],
  },
  {
    namespace: "url-shortener",
    command: "create",
    summary: "Create a short URL.",
    risk: "mutation",
    requiredOptions: ["--url"],
  },
  {
    namespace: "url-shortener",
    command: "create-v2",
    summary: "Create a short URL through the v2 route when supported.",
    risk: "mutation",
    requiredOptions: ["--url"],
  },
  {
    namespace: "url-shortener",
    command: "update",
    summary: "Update a short URL expiration date.",
    risk: "mutation",
    requiredOptions: ["--short-url-code", "--expiration-date"],
  },
];

const mutationPatterns = [
  /^add-/,
  /^alias-/,
  /^cancel-/,
  /^copy-/,
  /^create-/,
  /^delete-/,
  /^draft-(create|update|delete|schedule)$/,
  /^duplicate-/,
  /^favorite-/,
  /^file-upload$/,
  /^forwarding-/,
  /^like-/,
  /^modify-/,
  /^move$/,
  /^move-/,
  /^post-(create|delete)$/,
  /^remove-/,
  /^rename-/,
  /^restore-/,
  /^schedule-/,
  /^set-/,
  /^trash-/,
  /^unfavorite-/,
  /^unlike-/,
  /^update-/,
  /^upload-/,
];

const fileWritePatterns = [
  /^download-/,
  /^export-/,
  /^file-preview$/,
  /^file-thumbnail$/,
  /^file$/,
  /^user-image$/,
  /^user-default-image$/,
];

export function searchCatalog({ query = "", namespace, limit = 20 } = {}) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  return commandCatalog
    .filter((entry) => !namespace || entry.namespace === namespace)
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, terms),
    }))
    .filter(({ score }) => terms.length === 0 || score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function commandRisk(namespace, command) {
  const catalogEntry = commandCatalog.find(
    (entry) => entry.namespace === namespace && entry.command === command,
  );

  if (catalogEntry) {
    return catalogEntry.risk;
  }

  if (mutationPatterns.some((pattern) => pattern.test(command))) {
    return "mutation";
  }

  if (fileWritePatterns.some((pattern) => pattern.test(command))) {
    return "file-write";
  }

  return "read";
}

function scoreEntry(entry, terms) {
  if (terms.length === 0) {
    return 1;
  }

  const haystack = `${entry.namespace} ${entry.command} ${entry.summary}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
