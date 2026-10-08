---
name: cloudflare-cost-review
description: Review recurring Cloudflare work for runaway cost, or install the anti-cloudflare-cost Oxlint review gates. Use for alarms, retries, cron sweeps, query cost, webhook feedback loops, fan-out, and browser polling.
---

# Cloudflare cost review

Read the target repository's instructions and [bounded-work guidance](references/bounded-work.md). Keep the requested scope; an audit authorizes reads and findings, while a request to fix or install authorizes those changes.

## Review

1. Find the actual entry points and follow calls through persistence and external effects. Inspect alarms, Agent schedules, cron handlers, retry/reply loops, queue redelivery, provider callbacks, and browser timers relevant to the scope.
2. For each recurring path, establish its trigger, per-trigger work bound, persisted lifetime bound or ongoing-work budget, exhaustion outcome, and recovery. Include throwing handlers and concurrent starts. Cite the enforcing code, not only the declared status or comment.
3. Review query filters, joins, ordering, and bound parameters. Use local integration tests for actual query plans and representative rows-read measurements. Give scan exceptions to individual queries. Separate syntax checks, measured behavior, and unknowns.
4. Report concrete defects in impact order: trigger, wrong outcome, evidence by path and symbol, smallest correction, and verification. Estimate operations per day only when cadence and work count are known. A rate ceiling alone does not bound total work.
5. For authorized fixes, update the owning rule or guide, demonstrate a credible regression, repair the owner, and run the affected checks. Preserve intentional ongoing services and recovery paths. State what remains unverified.

## Install the lint gates when requested

Retrieve https://github.com/philippreiner/anti-cloudflare-cost into a temporary directory using `gh repo clone` or `git clone`, and record its commit. Read its README before configuration. Copy `src/` into the project's tooling directory. If that destination exists, compare and preserve local customizations; port selected changes instead of overwriting it.

Install `@oxlint/plugins` at the exact resolved Oxlint version. If Oxlint is absent, use matching versions from the retrieved repository and validate support. Merge the plugin and alarm rule into the existing configuration. Scope the optional interval rule to actual browser files; inspect project entry points rather than assuming every frontend-package file runs in the browser. Preserve existing plugins, overrides, and ignores.

Run the project's lint command. Inspect each new finding before adding a suppression. A suppression names a verified bound or an intentional local-only timer; report unresolved findings rather than writing blanket disables. Record the upstream commit and copied path for future maintenance. Leave commits, publication, Cloudflare credentials, and remote operations to the user's explicit authorization and repository policy.
