import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const WORKSPACE_FILE = "pnpm-workspace.yaml";
export const CHANGES_DIRECTORY = ".changeset";

export interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  files?: string[];
  publishConfig?: { access?: string };
  repository?: string | { url?: string };
}

export interface WorkspacePackage {
  /** Workspace-relative directory, with forward slashes. */
  dir: string;
  manifest: PackageManifest;
}

/**
 * The `packages:` list of a pnpm-workspace.yaml. Only the forms this repository uses are understood: literal
 * workspace-relative directories and single-segment globs such as `packages/*`. pnpm itself accepts the full
 * glob language; check-release.ts fails loudly on a glob it cannot resolve so a new pattern is noticed instead
 * of silently skipped.
 */
export function parseWorkspaceGlobs(yaml: string): string[] {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => /^packages:\s*(#.*)?$/.test(line));
  if (start === -1) {
    throw new Error(`${WORKSPACE_FILE} has no packages list`);
  }
  const entries: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(#.*)?$/.test(line)) {
      continue;
    }
    const item = /^(\s*)-\s+(.*?)\s*(?:#.*)?$/.exec(line);
    if (item === null) {
      break;
    }
    const value = item[2]!.replace(/^['"]|['"]$/g, "");
    if (value.length > 0) {
      entries.push(value);
    }
  }
  if (entries.length === 0) {
    throw new Error(`${WORKSPACE_FILE} packages list is empty`);
  }
  return entries;
}

/** Expands the supported globs against the repository root; duplicate directories are listed once. */
export function resolveWorkspaceDirs(root: string, globs: readonly string[]): string[] {
  const dirs = new Set<string>();
  for (const glob of globs) {
    if (!glob.includes("*")) {
      dirs.add(glob);
      continue;
    }
    const segments = glob.split("/");
    const last = segments[segments.length - 1]!;
    const unsupported =
      glob.includes("**") || last === "" || segments.slice(0, -1).some((segment) => segment.includes("*"));
    if (unsupported) {
      throw new Error(
        `${WORKSPACE_FILE} glob "${glob}" is not supported by scripts/check-release.ts; use literal directories ` +
          "or a single-segment glob such as packages/*"
      );
    }
    const parent = segments.slice(0, -1).join("/") || ".";
    const pattern = new RegExp(
      `^${last
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`
    );
    for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
      if (entry.isDirectory() && pattern.test(entry.name)) {
        dirs.add(parent === "." ? entry.name : glob.slice(0, glob.length - last.length) + entry.name);
      }
    }
  }
  return [...dirs].sort();
}

/** Reads every workspace package the globs resolve to, in directory order. */
export function readWorkspacePackages(root: string, globs: readonly string[]): WorkspacePackage[] {
  return resolveWorkspaceDirs(root, globs).map((dir) => ({
    dir,
    manifest: JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")) as PackageManifest
  }));
}

/** A package publishes when it is not private; pnpm's own commands skip private packages on publish. */
export function isPublishable(pkg: WorkspacePackage): boolean {
  return pkg.manifest.private !== true;
}

/**
 * Pending changesets are the `.changeset/*.md` intent files `pnpm version -r` consumes; README and pnpm's own
 * state files stay. Leftover files mean the version PR has not run since the last change.
 */
export function pendingChangesets(root: string): string[] {
  try {
    return readdirSync(join(root, CHANGES_DIRECTORY), { encoding: "utf8" })
      .filter((name) => name.endsWith(".md") && !name.startsWith("README"))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function repositoryUrl(manifest: PackageManifest): string | undefined {
  return typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
}

export function identifiesRepository(url: string | undefined, repository: string): boolean {
  return [
    `git+https://github.com/${repository}.git`,
    `https://github.com/${repository}.git`,
    `https://github.com/${repository}`,
    `git+ssh://git@github.com/${repository}.git`
  ].includes(url ?? "");
}

export interface ReleaseInput {
  tag: string | undefined;
  repository: string;
  packages: WorkspacePackage[];
  pendingChangesets: string[];
}

/**
 * Returns every reason the release cannot be published; an empty list means the release set is valid. Every
 * published package must carry the version the tag names: one release tag covers the whole release set, so a
 * set of packages that version independently needs a `versioning.fixed` group to release together.
 */
export function releaseErrors({ tag, repository, packages, pendingChangesets }: ReleaseInput): string[] {
  const errors: string[] = [];
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    errors.push(`repository must be owner/name, got "${repository}"`);
  }
  const published = packages.filter(isPublishable);
  if (published.length === 0) {
    errors.push("the workspace has no published packages");
  }

  if (tag === undefined || tag.length === 0) {
    errors.push("release tag is required");
  }

  for (const { dir, manifest } of published) {
    const name = manifest.name ?? dir;
    if (manifest.version === undefined || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      errors.push(`${name} version must be a stable x.y.z release, got "${manifest.version ?? "(missing)"}"`);
    } else if (tag !== `v${manifest.version}`) {
      errors.push(`release tag ${tag ?? "(missing)"} does not match ${name}@${manifest.version}`);
    }
    if (manifest.publishConfig?.access !== "public") {
      errors.push(`${name} publishConfig.access must be "public"`);
    }
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      errors.push(`${name} must list published files in "files"`);
    }
    // npm provenance rejects a package whose repository does not match the workflow's repository.
    if (!identifiesRepository(repositoryUrl(manifest), repository)) {
      errors.push(`${name} repository.url must identify github.com/${repository}`);
    }
  }

  if (pendingChangesets.length > 0) {
    errors.push(`unreleased changesets remain; run Version Packages first: ${pendingChangesets.join(", ")}`);
  }
  return errors;
}
