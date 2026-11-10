import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

const script = resolve(import.meta.dirname, "check-release-plan.mjs");
const workspaces: string[] = [];

function workspaceWithRecord(releases: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "template-release-plan-"));
  workspaces.push(root);
  const write = (path: string, content: unknown) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), typeof content === "string" ? content : JSON.stringify(content));
  };
  write("package.json", { name: "root", private: true, version: "0.0.0" });
  write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
  write("packages/a/package.json", { name: "a", version: "0.1.0" });
  write("packages/b/package.json", { name: "b", version: "0.1.0" });
  write("packages/u/package.json", { name: "u", private: true, version: "0.0.1" });
  write(".changeset/config.json", {
    changelog: false,
    fixed: [["a", "b"]],
    privatePackages: { version: false, tag: false }
  });
  const frontmatter = Object.entries(releases)
    .map(([name, type]) => `"${name}": ${type}`)
    .join("\n");
  write(".changeset/record.md", `---\n${frontmatter}\n---\n\nNote.\n`);
  return root;
}

function check(root: string) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
}

afterEach(() => {
  for (const root of workspaces.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("check-release-plan", () => {
  it("accepts minor and patch records for the fixed group", () => {
    const result = check(workspaceWithRecord({ a: "minor", b: "patch" }));

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("rejects a major record", () => {
    const result = check(workspaceWithRecord({ a: "major" }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".changeset/record.md requests a major bump");
  });

  it("rejects a record for a package outside the fixed group, which changeset version never consumes", () => {
    const result = check(workspaceWithRecord({ u: "patch" }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".changeset/record.md names u, which is not released");
  });
});
