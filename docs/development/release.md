# npm Release Runbook

Changesets owns change records (`pnpm changeset`), version bumps and changelogs (`changeset version`) and
publishing (`changeset publish`), configured in `.changeset/config.json`. Published packages under `packages/` are
published to npm by GitHub Actions with npm Trusted Publishing (OIDC) and provenance. A merged version PR
publishes, and the workflow pushes one tag `<name>@<version>` and creates one GitHub Release per published
package. No long-lived npm token is stored in the repository or its secrets. The release jobs come from the shared
workflow in PerfectPan/gh-repo-checks; its [runbook](https://github.com/PerfectPan/gh-repo-checks/blob/v1/docs/npm-release.md) covers the jobs, one-time npm setup, cutting a release and
failure recovery, and this page covers what the template decides.

| Step | Where | Result |
| --- | --- | --- |
| Changeset | feature PR | `.changeset/<name>.md`, written with `pnpm changeset` or by hand; CI does not check for it |
| Version PR | `publish-npm.yml`, on each push to `main` with pending changesets | draft PR `chore(release): version packages` from `changeset-release/main`, whose body lists each package's new changelog section |
| Version PR merge | GitHub, the only manual step | bumped `package.json` versions and `CHANGELOG.md` per package on `main`, no pending changesets |
| Publish | `publish-npm.yml`, on the merge push | the release gates run, packages publish, and the workflow pushes one tag and creates one GitHub Release per package |

Each row is a separate completion state. A merged version PR is not a published release, and a started publish
workflow is not a published package.

## The Release Workflow

`.github/workflows/publish-npm.yml` runs on every push to `main` (a PR merge is a push) and on manual dispatch, and
calls `PerfectPan/gh-repo-checks/.github/workflows/npm-release.yml@v1` with the default inputs: `pnpm run check` as
the release gate, `pnpm audit --prod --audit-level=high`, `pnpm run version-packages`, and the first-publish check.
The shared workflow runs four jobs, each with only its own permissions: select release mode (read-only, with
`gh repo-checks release-plan` and `gh repo-checks first-publish`), version packages (draft version PR), check and
pack packages (read-only gate, audit and `pnpm pack`), and publish packages (the only job with the OIDC permission,
publishing the packed tarballs). npm validates the calling file, so trusted publishers are bound to
`publish-npm.yml`; rename it before configuring them, not after. The caller keeps one concurrency group with
`cancel-in-progress: false`. `ci.yml` runs `gh repo-checks release-plan` on pull requests after the install.

## Changesets

A PR that changes what a published package ships (source, manifest, build config) or the lockfile carries a
changeset. CI does not check for a missing one; the author adds it and the reviewer looks for it. Write it with:

```bash
pnpm changeset add --patch @scope/example -m "Correct the example export."
```

Interactive form: `pnpm changeset` prompts for the packages, the bump and the message, and needs a terminal. Name
every affected published package when a change affects several. The command writes `.changeset/<name>.md`, which
you can also write by hand under any short kebab-case name:

```markdown
---
"@scope/example": patch
---

Correct the example export.
```

The summary becomes the changelog entry, so write it for users of the package. Rules for the bump:

- Use `patch` for fixes, `minor` for features and `major` for a breaking release. The template permits major
  bumps, including the move from 0.x to 1.0.0; a repository can adopt a narrower policy deliberately.
- A record naming only a private or ignored package is never consumed by `changeset version`, so it stays pending
  and the flow would never publish again; `gh repo-checks release-plan` rejects it in CI and before a version PR.
  Move its note to a published package or delete the record. This applies to `none` records too.
- `pnpm changeset status --verbose` prints the pending changesets and the versions they would release.

## Versioning Configuration

`.changeset/config.json` sets `privatePackages: { version: false, tag: false }`, so private packages are never
versioned or tagged, and `changelog-github` writes PR links and author thanks into each package's `CHANGELOG.md`.
It reads `GITHUB_REPOSITORY` from Actions, so repositories created from the template link to themselves. Local
version previews need both `GITHUB_REPOSITORY=OWNER/REPO` and `GITHUB_TOKEN`.
The example package versions independently (`fixed: []`). When a second published package appears, decide between
a `fixed` group (lockstep releases at one shared version) and independent versions, and document the choice here.
The shared `fmt` of `@perfectpan/lint-config` skips the generated `CHANGELOG.*`; a package that sets its own
`fmt.ignorePatterns` starts the list with `...fmt.ignorePatterns`.

## First Releases

Publishing a package name that has never existed on npm fails at the trusted-publishing exchange: OIDC cannot
create package names. The shared workflow's first-publish check stops before creating a version PR for a new
package name. Publish the placeholder (One-Time Setup below) and re-run the failed run.
The placeholder `0.0.0` never collides with real releases, which are higher: the first `minor` change record bumps
`0.0.0 → 0.1.0` in the first version PR. The template's example package is `"private": true` and ships without a
change record, so the template repository itself never enters this flow; a repository created from the template
removes that flag (see One-Time Setup) and writes its own first record.

## One-Time Setup

### Repository

1. Keep the repository public. pnpm attaches provenance only when the repository and the package are public; from a
   private repository it publishes without provenance.
2. Every published `package.json` has `repository.url` pointing at this GitHub repository (`git+https://github.com/OWNER/REPO.git`)
   and `publishConfig.access: "public"`, and lists published files in `files`. npm rejects provenance when the
   repository does not match, and a scoped package without public access cannot publish.
3. The template's example package carries `"private": true` and no `publishConfig`, which keeps the template's own
   Release workflow in no-op mode. Remove `"private": true` from each package meant to publish and add the
   `publishConfig` from the previous step; private packages stay skipped by the first-publish check and
   `changeset publish`.
4. Let GitHub Actions create pull requests: **Settings → Actions → General → Workflow permissions → Allow GitHub
   Actions to create and approve pull requests**. The Release workflow fails without it, on the first push to `main`
   that leaves changesets pending.

### npm Trusted Publisher, per package

Follow First publish and Trusted publisher in the [shared runbook](https://github.com/PerfectPan/gh-repo-checks/blob/v1/docs/npm-release.md) for each package name, with the
workflow filename `publish-npm.yml` and no environment. For the example package the placeholder is:

```bash
dir="$(mktemp -d)" && cd "$dir"
printf '{"name":"@scope/example","version":"0.0.0","description":"Placeholder; releases are published by CI."}\n' > package.json
npm publish --access public
npm deprecate @scope/example@0.0.0 "Placeholder; install a later version."
```

Create the trusted publisher right before merging the first version PR: a new configuration expires unless a
publish uses it within 2 days.

## Cutting a Release and Failure Recovery

The steps and the recovery for each failed job are the same in every repository that calls the shared workflow;
see Cutting a Release and Failure Recovery in the [shared runbook](https://github.com/PerfectPan/gh-repo-checks/blob/v1/docs/npm-release.md). Every version update returns the
version PR to Draft; select **Ready for review** to run `ci.yml`, whose full job skips Draft PRs.

## Bot Pull Requests

- **Version PR**: see [Cutting a Release and Failure Recovery](#cutting-a-release-and-failure-recovery). Its title already passes `gh repo-checks pr-title`; bot PRs skip the description check.
- **Dependabot npm PRs**: one weekly PR carries every minor and patch npm update, and a second one every major.
  Dependabot officially supports pnpm 7–10; on pnpm 12 its support is limited (dependabot-core#16397), so a PR may
  edit `package.json` files or the catalog in `pnpm-workspace.yaml` without regenerating the root
  `pnpm-lock.yaml`. Check out the branch, run `pnpm install`, and commit the lockfile so CI runs green. A
  `vite-plus` bump and the matching `vite` alias
  (`npm:@voidzero-dev/vite-plus-core`) land in separate PRs; add the alias bump to the first branch before
  merging so the two stay in lockstep. Dependabot moves a peer together with the matching devDependency; moving an
  exact peer is a `minor` change, since hosts pinning the old version then fail to install, so do not release with
  only `patch` changesets for a release that carries one. Add a `patch` changeset for published
  packages whose runtime dependencies or peers changed.
- **Dependabot GitHub Actions PRs** move an action to its next major version tag (for example `actions/checkout@v7`
  to `@v8`); minor and patch releases need no PR because workflows reference the major tag. Merge them for this
  repository's own workflows (`ci.yml`, `publish-npm.yml`). Close PRs that touch `review.yml` or another file
  synced from [PerfectPan/project-template](https://github.com/PerfectPan/project-template), with a comment that the
  bump comes from upstream, and sync the file once upstream has it. Dependabot cannot ignore an action per file, so
  these PRs keep appearing.

## CI Trigger Policy

`ci.yml` runs the full `check` job for non-Draft PRs on `opened`, `synchronize`, `reopened`, and
`ready_for_review`, and keeps the existing push-to-`main` run. Draft PR events skip the full job while the
lightweight Review workflow remains active. No manual CI trigger is added. See
[CI Execution Policy](../../CONTRIBUTING.md#ci-execution-policy) for skipped-check and merge requirements.

The PR checkout validates GitHub's merge result. If only the base changes, update the PR branch or select Draft
then Ready to obtain a fresh run for the current comparison before merging. Metadata edits run the separate
Review workflow without repeating the full suite.
