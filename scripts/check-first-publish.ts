import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import process from "node:process";

import { isPublishable, parseWorkspaceEntries, readManifests } from "./lib/workspace.ts";

const root = realpathSync(execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim());
const lsOutput = execFileSync("pnpm", ["ls", "-r", "--depth", "-1", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024
});

const registry = process.env.RELEASE_REGISTRY ?? "https://registry.npmjs.org/";
const names = readManifests(root, parseWorkspaceEntries(root, lsOutput))
  .filter(isPublishable)
  .map((pkg) => pkg.manifest.name)
  .filter((name): name is string => name !== undefined && name.length > 0);

const missing: string[] = [];
for (const name of names) {
  try {
    // npm exits non-zero with a 404 for a package name that does not exist; an existing but empty
    // versions list counts as unpublished too.
    const versions = JSON.parse(
      execFileSync("npm", ["view", name, "versions", "--json", "--registry", registry], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      })
    );
    if (!Array.isArray(versions) || versions.length === 0) {
      missing.push(name);
    }
  } catch {
    missing.push(name);
  }
}

if (missing.length > 0) {
  console.error(`check-first-publish: no version on npm yet for ${missing.join(", ")}`);
  console.error(
    "check-first-publish: finish the first publish in One-Time Setup (docs/development/release.md) before running " +
      "Version Packages. pnpm version -r consumes the changesets either way, and publishing a package name that " +
      "does not exist yet fails at the npm trusted-publishing exchange."
  );
  process.exit(1);
}
console.log(`check-first-publish: ok (${names.join(", ")} have versions on npm)`);
