# anti-cloudflare-cost

[![Check](https://github.com/philippreiner/anti-cloudflare-cost/actions/workflows/check.yml/badge.svg)](https://github.com/philippreiner/anti-cloudflare-cost/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Small, vendorable Oxlint rules and review guidance for Cloudflare work that can keep billing after a request ends.

An alarm schedules itself again. A cron retries the same failed job. An idle sweep scans a growing table every minute. These patterns can look harmless in a small test database and become expensive later.

This repo helps put those paths under review before they ship. It contains two lint rules, local cron/query-plan examples, and an agent skill. It does not measure your account usage or guarantee a spending limit. Cloudflare's [budget alerts notify but do not cap usage](https://developers.cloudflare.com/billing/manage/budget-alerts/).

Inspired by [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop): copy the source, read it, and adapt it to your codebase. There is no official npm package.

## What you get

| Piece                                                                          | What it does                                                | What still needs review                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------ |
| `require-alarm-review`                                                         | Flags calls to `setAlarm` and `scheduleEvery`               | Persisted bounds, crash recovery, overlapping triggers |
| `no-unmanaged-interval`                                                        | Flags bare and browser-global `setInterval` calls           | Recursive timers, deadlines, hidden tabs, cancellation |
| [Query-plan example](examples/check-query-plan.js)                             | Rejects unreviewed `SCAN` operations, including index scans | Actual rows read on populated paths                    |
| [Cost review skill](skills/cloudflare-cost-review/SKILL.md)                    | Traces recurring work and identifies missing bounds         | Findings need evidence from your implementation        |
| [Bounded-work guide](skills/cloudflare-cost-review/references/bounded-work.md) | Covers alarms, retries, cron, queries, fan-out, and polling | Your schedule, schema, and recovery requirements       |

The lint rules are review gates. A suppression is a written claim, not proof that a job stops.

## Add the skill

```sh
npx skills add philippreiner/anti-cloudflare-cost --skill cloudflare-cost-review
```

Then ask your agent:

> Review our recurring Cloudflare work with cloudflare-cost-review. Identify each trigger, persisted bound, exhaustion outcome, and verification gap.

Or ask it to vendor and configure the lint rules. The skill preserves your existing lint configuration and local changes.

## Add the lint rules manually

Clone this repository and copy `src/` into your project, for example:

```sh
git clone https://github.com/philippreiner/anti-cloudflare-cost.git
mkdir -p tools/oxlint/anti-cloudflare-cost
cp -R anti-cloudflare-cost/src/. tools/oxlint/anti-cloudflare-cost/
```

Install matching versions of `oxlint` and `@oxlint/plugins`. This repository is tested with **1.80.0** of both, on Node 22 and 24. If your project already uses Oxlint, match its resolved version and validate compatibility before upgrading. Oxlint currently marks its [JavaScript plugin API as alpha](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins).

```sh
npm install --save-dev --save-exact oxlint@1.80.0 @oxlint/plugins@1.80.0
```

Merge the following into your `.oxlintrc.json`. Preserve existing plugins, rules, and overrides. Replace `src/client/**` with the files that actually run in your browser.

```json
{
  "jsPlugins": [
    {
      "name": "anti-cloudflare-cost",
      "specifier": "./tools/oxlint/anti-cloudflare-cost/index.js"
    }
  ],
  "rules": {
    "anti-cloudflare-cost/require-alarm-review": "error"
  },
  "overrides": [
    {
      "files": ["src/client/**"],
      "rules": {
        "anti-cloudflare-cost/no-unmanaged-interval": "error"
      }
    }
  ]
}
```

The interval rule is opt-in for browser files. Keep Node maintenance timers outside that scope. Run your existing lint command; add `npx oxlint src` to CI if you do not have one.

### Review and suppress locally

```js
// oxlint-disable-next-line anti-cloudflare-cost/require-alarm-review -- retry attempts are persisted, capped at 8; exhaustion records failure and leaves the alarm unarmed
await this.ctx.storage.setAlarm(nextAttemptAt);
```

Only add the comment after inspecting that behavior and its failure path. A maximum backoff interval slows an infinite loop; it does not end it. A terminal-state field is useful only if execution actually reaches it.

For intentional ongoing work, name its persisted rate or work budget and its stop control. A heartbeat is different from retrying a failed operation forever.

These rules match syntax, not types or control flow. An unrelated object's `setAlarm` method may also be flagged. Bracketed string properties and optional calls are covered; aliases, wrappers, and dynamically computed method names need human or agent review. Suppression reasons are a team convention; the plugin does not validate their truth or require Oxlint to retain them.

## Keep the recovery cron, check its work

A fixed cron schedule bounds the number of ticks. It does not bound the work inside a tick, the lifetime of a job, or the rows a query visits. Choose a cadence from your recovery needs, then review claims, retries, and query plans.

Use [check-query-plan.js](examples/check-query-plan.js) in a **local** D1 integration suite:

```js
await checkQueryPlan(
  env.DB,
  "SELECT id FROM jobs WHERE status = ? AND due_at <= ? ORDER BY due_at LIMIT ?",
  ["queued", now, 20],
);
```

[check-idle-work.js](examples/check-idle-work.js) captures the SQL prepared by your real claim or sweep operation and checks it with its bound parameters:

```js
await checkIdleWork(env.DB, () => claimDueJobs(env.DB, { limit: 20 }));
```

This is local test instrumentation. Use the same D1 object as the operation, with no concurrent work. The small example assumes one binding per prepared statement and captures prepared queries, including ones not executed; adapt instrumentation at your database boundary for statement reuse or other execution paths. Keep scan exceptions scoped to one query or single-query operation. Cover due work as well as the idle path. A new cron job adds its queries to that suite.

An exception belongs to one query and one exact scan detail, with a reason:

```js
await checkQueryPlan(env.DB, "SELECT id FROM settings", [], {
  "SCAN settings": "Singleton settings table, enforced by its schema.",
});
```

A configuration table can grow with tenant count. That makes its scan an explicit trade-off, not automatically free. Avoid global table allowlists.

**An indexed query can still be expensive.** `SEARCH` can read many matching entries. `SCAN ... USING INDEX` is still a scan. `LIMIT 20` limits returned rows, not necessarily examined rows. Measure `meta.rows_read` using representative local D1 fixtures where this matters. SQLite's [query-plan output can change between versions](https://www.sqlite.org/eqp.html); review changed plans rather than accepting new exceptions automatically.

The runnable example tests use Node's real SQLite engine through a small D1-shaped adapter. They prove that the example detects a missing index and an index scan, allows a selective lookup, keeps exceptions local, and restores database instrumentation after failures. They do not establish D1 billing or production query plans.

## Work on this repo

```sh
npm ci
npm run check
```

Tests run the plugin through the actual Oxlint CLI and exercise query plans against local SQLite. No Cloudflare account, token, or deployed resources are needed. GitHub Actions runs the same checks on Node 22 and 24.

## Scope

Start with these two rules and the review guide. Retry budgets, idempotency, webhook feedback loops, queue redelivery, and storage batching depend on application state and cannot be proven by matching a method name. The guide covers them without pretending lint can verify them.

The MIT license applies to this repository. See [LICENSE](LICENSE).
