#!/usr/bin/env node

// Changesets leaves records for skipped packages pending, including records whose bump type is "none".
import { readConfig } from "@changesets/config";
import { getReleasePlan } from "@changesets/get-release-plan";
import { shouldSkipPackage } from "@changesets/should-skip-package";
import { getPackages } from "@manypkg/get-packages";

const packages = await getPackages(process.cwd());
const { config, errors } = await readConfig(packages.rootDir, packages);
if (!config) {
  throw new Error(errors.join("\n"));
}
const plan = await getReleasePlan(packages.rootDir, undefined, config);
const skipped = new Set(
  packages.packages
    .filter((pkg) =>
      shouldSkipPackage(pkg, { ignore: config.ignore, allowPrivatePackages: config.privatePackages.version })
    )
    .map((pkg) => pkg.packageJson.name)
);
const failures = plan.changesets.flatMap((changeset) => {
  const names = changeset.releases.filter((release) => skipped.has(release.name)).map((release) => release.name);
  return names.length ? [`.changeset/${changeset.id}.md names ${names.join(", ")}, which is not versioned`] : [];
});

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`check-release-plan: ${failure}`);
  }
  process.exit(1);
}

console.log(`check-release-plan: ok (${plan.changesets.length} pending change record(s))`);
