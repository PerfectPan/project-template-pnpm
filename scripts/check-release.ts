import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";

import {
  WORKSPACE_FILE,
  type ReleaseInput,
  readWorkspacePackages,
  releaseErrors,
  pendingChangesets,
  parseWorkspaceGlobs
} from "./lib/workspace.ts";

const USAGE = "usage: node scripts/check-release.ts <tag> [--repository owner/name] [--verify-git]";

// `pnpm run release:check -- <args>` forwards the separator verbatim; parseArgs would treat it as the
// end-of-options marker and turn the flags behind it into positionals.
const args = process.argv.slice(2);
const separator = args.indexOf("--");
const { positionals, values } = parseArgs({
  args: separator === -1 ? args : [...args.slice(0, separator), ...args.slice(separator + 1)],
  allowPositionals: true,
  options: {
    repository: { type: "string" },
    "verify-git": { type: "boolean" },
    help: { type: "boolean", short: "h" }
  }
});
if (values.help === true) {
  console.log(USAGE);
  process.exit(0);
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const tag = positionals[0] ?? process.env.RELEASE_TAG;
const repository = values.repository ?? process.env.GITHUB_REPOSITORY ?? "";

const input: ReleaseInput = {
  tag,
  repository,
  packages: readWorkspacePackages(root, parseWorkspaceGlobs(readFileSync(`${root}/${WORKSPACE_FILE}`, "utf8"))),
  pendingChangesets: pendingChangesets(root)
};

const errors = releaseErrors(input);

if (values["verify-git"] === true) {
  const head = git("rev-parse", "HEAD");
  try {
    const tagged = git("rev-parse", `refs/tags/${tag}^{commit}`);
    if (tagged !== head) {
      errors.push(`HEAD ${head} is not the commit tagged ${tag} (${tagged})`);
    }
  } catch {
    errors.push(`tag ${tag} does not exist locally`);
  }
  if (git("status", "--porcelain") !== "") {
    errors.push("worktree must be clean");
  }
  try {
    git("merge-base", "--is-ancestor", "HEAD", "origin/main");
  } catch {
    errors.push("release commit must be on origin/main");
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`check-release: ${error}`);
  }
  process.exit(1);
}
const names = input.packages
  .filter((pkg) => pkg.manifest.private !== true)
  .map((pkg) => pkg.manifest.name)
  .join(", ");
console.log(`check-release: ok (${tag}: ${names})`);
