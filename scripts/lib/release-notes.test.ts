import { describe, expect, it } from "vite-plus/test";

import { RELEASE_PR_INTRO, renderReleaseNotes, TRUNCATION_NOTICE } from "./release-notes.ts";

const example = `# Change Log - @scope/example

This log was last generated on Sat, 17 Oct 2026 06:13:04 GMT and should not be manually modified.

## 0.2.0
Sat, 17 Oct 2026 06:13:04 GMT

### Minor changes

- Add a small feature worth announcing in the release PR.

## 0.1.1
Fri, 16 Oct 2026 06:29:41 GMT

### Patches

- An older note that stays in the file.

## 0.1.0
Thu, 15 Oct 2026 06:07:53 GMT

_Version update only_
`;

const second = `# Change Log - @scope/second

This log was last generated on Sat, 17 Oct 2026 06:13:04 GMT and should not be manually modified.

## 0.2.0
Sat, 17 Oct 2026 06:13:04 GMT

_Version update only_
`;

const entries = [
  { name: "@scope/example", version: "0.2.0", changelog: example },
  { name: "@scope/second", version: "0.2.0", changelog: second }
];

describe("renderReleaseNotes", () => {
  it("extracts the newest version's section without its heading and generated date line", () => {
    expect(
      renderReleaseNotes([entries[0]!]).endsWith(
        "### Minor changes\n\n- Add a small feature worth announcing in the release PR."
      )
    ).toBe(true);
    expect(renderReleaseNotes([entries[0]!])).not.toContain(" GMT");
  });

  it("ends an older version's section at the next heading", () => {
    expect(
      renderReleaseNotes([{ name: "@scope/example", version: "0.1.1", changelog: example }]).endsWith(
        "### Patches\n\n- An older note that stays in the file."
      )
    ).toBe(true);
  });

  it("fails with the package and version when the changelog lacks the section", () => {
    expect(() => renderReleaseNotes([{ name: "@scope/example", version: "0.1.2", changelog: example }])).toThrow(
      "no 0.1.2 section in the CHANGELOG.md of @scope/example"
    );
  });

  it("lists every package of the policy in the given order under the intro", () => {
    const body = renderReleaseNotes(entries);
    const exampleAt = body.indexOf("## @scope/example@0.2.0");
    const secondAt = body.indexOf("## @scope/second@0.2.0");
    expect(body.startsWith(RELEASE_PR_INTRO)).toBe(true);
    expect(exampleAt).toBeGreaterThan(RELEASE_PR_INTRO.length);
    expect(secondAt).toBeGreaterThan(exampleAt);
    expect(body).toContain("### Minor changes\n\n- Add a small feature worth announcing in the release PR.");
    expect(body).toContain("_Version update only_");
    expect(body).not.toContain("Sat, 17 Oct 2026");
  });

  it("cuts the entries past the cap and points at the CHANGELOG files", () => {
    const changelog = `## 0.2.0\n${"- a long change note that fills the body. ".repeat(12)}`;
    // At this cap an entry fits only when the notice and the blank line before it fit too; reserving the notice
    // alone leaves the truncated body 2 characters over.
    const cap = renderReleaseNotes([entries[0]!]).length + TRUNCATION_NOTICE.length;
    const body = renderReleaseNotes([entries[0]!, { ...entries[1]!, changelog }], cap);
    expect(body.startsWith(RELEASE_PR_INTRO)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(cap);
    expect(body.endsWith(TRUNCATION_NOTICE)).toBe(true);
    expect(body).not.toContain("## @scope/example@0.2.0");
    expect(body).not.toContain("## @scope/second@0.2.0");
  });

  it("does not match a heading that merely starts with the target version", () => {
    const changelog = `# Change Log - @scope/example

## 0.2.0-beta.1
Wed, 15 Oct 2026 06:13:04 GMT

### Patches

- A prerelease note.

## 0.2.0
Sat, 17 Oct 2026 06:13:04 GMT

### Patches

- The released note.
`;
    expect(
      renderReleaseNotes([{ name: "@scope/example", version: "0.2.0", changelog }]).endsWith(
        "### Patches\n\n- The released note."
      )
    ).toBe(true);
    expect(renderReleaseNotes([{ name: "@scope/example", version: "0.2.0", changelog }])).not.toContain(
      "A prerelease note."
    );
  });

  it("cuts a body that one huge section already fills and still points at the CHANGELOG files", () => {
    const changelog = `## 0.2.0\n${"x".repeat(500)}`;
    const cap = RELEASE_PR_INTRO.length + 200;
    const body = renderReleaseNotes([{ name: "@scope/example", version: "0.2.0", changelog }], cap);
    expect(body.startsWith(RELEASE_PR_INTRO)).toBe(true);
    expect(body).not.toContain("## @scope/example@0.2.0");
    expect(body.endsWith(TRUNCATION_NOTICE)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(cap);
  });
});
