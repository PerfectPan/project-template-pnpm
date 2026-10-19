import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  parseWorkspaceGlobs,
  readWorkspacePackages,
  type ReleaseInput,
  releaseErrors,
  resolveWorkspaceDirs
} from "./workspace.ts";

const yaml = `# workspace
packages:
  # one per domain
  - packages/*
  - 'scripts'

minimumReleaseAge: 1440
`;

const root = mkdtempSync(join(tmpdir(), "workspace-lib-"));
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("parseWorkspaceGlobs", () => {
  it("reads the packages list and stops at the next key", () => {
    expect(parseWorkspaceGlobs(yaml)).toEqual(["packages/*", "scripts"]);
  });

  it("fails without a packages list", () => {
    expect(() => parseWorkspaceGlobs("minimumReleaseAge: 1440\n")).toThrow("no packages list");
  });
});

describe("resolveWorkspaceDirs", () => {
  it("expands single-segment globs to member directories", () => {
    mkdirSync(join(root, "packages/example"), { recursive: true });
    mkdirSync(join(root, "packages/ignored.txt"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "packages/ignored.txt/keep.txt"), "");
    expect(resolveWorkspaceDirs(root, ["packages/*", "scripts"])).toEqual([
      "packages/example",
      "packages/ignored.txt",
      "scripts"
    ]);
  });

  it("rejects globs it cannot resolve", () => {
    expect(() => resolveWorkspaceDirs(root, ["packages/**"])).toThrow("not supported");
  });
});

describe("readWorkspacePackages", () => {
  it("reads each member's manifest", () => {
    mkdirSync(join(root, "packages/example"), { recursive: true });
    writeFileSync(join(root, "packages/example/package.json"), '{"name":"@scope/example","version":"1.0.0"}');
    const [pkg] = readWorkspacePackages(root, ["packages/*"]);
    expect(pkg!.dir).toBe("packages/example");
    expect(pkg!.manifest.name).toBe("@scope/example");
  });
});

function input(overrides: Partial<ReleaseInput> = {}): ReleaseInput {
  return {
    tag: "v1.2.3",
    repository: "owner/repo",
    packages: [
      {
        dir: "packages/lib",
        manifest: {
          name: "@scope/lib",
          version: "1.2.3",
          files: ["dist"],
          publishConfig: { access: "public" },
          repository: { url: "git+https://github.com/owner/repo.git" }
        }
      }
    ],
    pendingChangesets: [],
    ...overrides
  };
}

describe("releaseErrors", () => {
  it("accepts a consistent release", () => {
    expect(releaseErrors(input())).toEqual([]);
  });

  it("skips private packages", () => {
    expect(
      releaseErrors(input({ packages: [{ dir: "scripts", manifest: { name: "repo-scripts", private: true } }] })).some(
        (error) => error.includes("repo-scripts")
      )
    ).toBe(false);
  });

  it("requires a publishable package", () => {
    expect(releaseErrors(input({ packages: [] }))).toContain("the workspace has no published packages");
  });

  it("rejects a tag that does not match the package version", () => {
    expect(releaseErrors(input({ tag: "v1.2.4" }))).toEqual(["release tag v1.2.4 does not match @scope/lib@1.2.3"]);
  });

  it("rejects a prerelease version", () => {
    const pkg = { ...input().packages[0]!, manifest: { ...input().packages[0]!.manifest, version: "1.2.3-rc.0" } };
    expect(releaseErrors(input({ tag: "v1.2.3-rc.0", packages: [pkg] }))).toContain(
      '@scope/lib version must be a stable x.y.z release, got "1.2.3-rc.0"'
    );
  });

  it("rejects a manifest from another repository and pending changesets", () => {
    const [entry] = input().packages;
    const pkg = { ...entry!, manifest: { ...entry!.manifest, repository: "https://github.com/other/repo" } };
    expect(releaseErrors(input({ packages: [pkg], pendingChangesets: ["next-feature.md"] }))).toEqual([
      "@scope/lib repository.url must identify github.com/owner/repo",
      "unreleased changesets remain; run Version Packages first: next-feature.md"
    ]);
  });
});
