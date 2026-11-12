#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readConfig } from "@changesets/config";
import { getReleasePlan } from "@changesets/get-release-plan";
import { shouldSkipPackage } from "@changesets/should-skip-package";
import { getPackages } from "@manypkg/get-packages";

const mode = process.argv[2] ?? "version";
if (mode !== "version" && mode !== "publish") {
  throw new Error("Expected release mode: version or publish");
}
const packages = await getPackages(process.cwd());
const { config, errors } = await readConfig(packages.rootDir, packages);
if (!config) {
  throw new Error(errors.join("\n"));
}
// A version PR only needs setup for its release candidates; another new package must not block it.
const plan = mode === "version" ? await getReleasePlan(packages.rootDir, undefined, config) : undefined;
const candidates =
  plan && new Set(plan.releases.filter((release) => release.type !== "none").map((release) => release.name));
const names = packages.packages
  .filter((pkg) => !shouldSkipPackage(pkg, { ignore: config.ignore, allowPrivatePackages: false }))
  .map((pkg) => pkg.packageJson.name)
  .filter((name) => !candidates || candidates.has(name));
const missing = [];
for (const name of names) {
  try {
    const versions = JSON.parse(
      execFileSync(
        "npm",
        [
          "view",
          name,
          "versions",
          "--json",
          "--registry",
          process.env.RELEASE_REGISTRY ?? "https://registry.npmjs.org/"
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"]
        }
      )
    );
    if (!Array.isArray(versions) || versions.length === 0) {
      missing.push(name);
    }
  } catch (error) {
    const stderr = String(error.stderr ?? "");
    if (!stderr.includes("E404")) {
      console.error(`check-first-publish: registry lookup failed for ${name}: ${stderr.trim().split("\n")[0]}`);
      process.exit(1);
    }
    missing.push(name);
  }
}
if (missing.length > 0) {
  console.error(`check-first-publish: no version on npm yet for ${missing.join(", ")}`);
  console.error(
    "check-first-publish: finish One-Time Setup in docs/development/release.md before creating the version PR or publishing."
  );
  process.exit(1);
}
console.log(`check-first-publish: ok (${names.length} package(s))`);
