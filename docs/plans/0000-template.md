# <Plan title>

Copy this file when starting a plan for a non-trivial change (see `CONTRIBUTING.md`). Keep only the sections that apply and delete the rest. If an owner, reviewer, or date is unknown, write "unconfirmed". Do not invent them.

- Status: draft / blocked / in review / active
- Owner: <name or unconfirmed>
- Last updated: <date>
- Issue / PR: <link or none>

## 1. Problem, goals, and non-goals

- **Context & problem**: What exists today, what constraints apply, and why this change is worth doing.
- **Goals & acceptance**: Checkable outcomes and invariants the change must satisfy.
- **Non-goals**: Related work explicitly excluded so scope does not expand.

## 2. Design and decisions

- **Boundaries & data flow**: Which modules, contracts, or storage boundaries change, and who owns what.
- **Key decisions**: For each non-obvious choice, state the alternatives considered, why this option won, and any compatibility, security, or migration constraints.

## 3. Execution plan

<!-- Keep this when the work spans multiple PRs/sessions or needs ordered checkpoints; delete for a single-PR design. -->

- **Preconditions**: Reviewed design, baseline checks, or upstream dependencies required before starting.
- **Batches / tasks**:
  1. `<task>`: files to touch, expected change, tests, and exit condition.
- **Rollback**: Smallest reversible unit and any persisted-data or release-order constraint.

## 4. Verification

- Automated tests, checks, and commands required before landing.
- Manual or environment-specific checks (note any deferred items that should become follow-up issues on retirement).

## 5. Risks and open questions

<!-- Keep Status `blocked` while a material decision affecting scope, interfaces, data, or rollout is unresolved. Delete if none. -->

- <risk or open question>

## Retirement checklist (before deleting in the final PR)

- [ ] Remaining manual checks or follow-ups moved to issues
- [ ] Lasting non-code knowledge (invariants, tradeoffs, external quirks, validation limits) migrated to `docs/` or local `Why:` comments
- [ ] This plan file deleted in the final delivery PR/MR
