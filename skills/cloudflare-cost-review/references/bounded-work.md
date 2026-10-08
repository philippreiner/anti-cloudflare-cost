# Bounded Cloudflare work

For each path that can run again without a person, identify its trigger, maximum work per trigger, lifetime or ongoing-work budget, and observable exhaustion outcome. Show the storage fields and writes that enforce the bound. Distinguish enforced bounds from intentions in comments.

## Alarms and retries

- Persist attempts or expiry before the work can throw. An in-memory counter resets on eviction and cannot bound future wakes.
- Check admission before external effects. A retry that performs the effect before incrementing its counter may escape the bound on every failure.
- Stop scheduling on completion, cancellation, or exhaustion. Record an outcome that an operator can find and recover from.
- Use backoff to control rate; keep an independent attempt cap, deadline, or explicit ongoing-work budget.
- Check overlapping wake paths. An incoming event should not reset the budget or repeatedly move an armed alarm earlier.
- Distinguish application retries from platform retries. Cloudflare can [retry a throwing alarm](https://developers.cloudflare.com/durable-objects/api/alarms/); account for this when evaluating the stored bound.
- Workflow step retries and cron redispatches are separate layers. Recreating or restarting an errored instance can reset the budget. Trace the product-level attempt or expiry through both.
- Ongoing subscriptions or heartbeats need a persisted rate/work budget and a stop control. Explain their continued use rather than forcing a finite lifetime on an intentional service.

## Cron and claims

A fixed schedule bounds ticks, not work. Bound claims, pages, spawned jobs, and provider calls per tick. Fence concurrent claims in the database write, and make repeated effects idempotent. A row retried on each tick needs its own persisted lifetime bound and exhaustion writer.

Keep a recovery sweep when it repairs lost dispatches or abandoned claims. Changing its frequency is a product latency decision. Establish whether it finds real work or just checks for it before changing the schedule.

## D1 reads

Review the filters, joins, and ordering of recurring and hot-path queries. Check actual statements with `EXPLAIN QUERY PLAN`, including the bound parameter values. Plan scans can traverse a table or an index. A query returning a few rows can still examine many.

Use exceptions attached to one query, one plan detail, and a reason. A configuration table still grows with configuration and tenants. A query-plan check is a regression signal, not a spending bound; keep representative populated fixtures for rows-read measurements. D1 exposes [rows read and written in statement metadata](https://developers.cloudflare.com/d1/worker-api/return-object/).

## Feedback loops and fan-out

Inbound mail, webhooks, queue messages, and external callbacks can cause another event. Follow the complete cycle. Enforce a persisted budget by subject or operation, and keep identity stable across redeliveries. Filtering automatic messages helps but cannot replace a budget.

Limit how much work one event starts. Paginate user-sized collections with a stored cursor and deadline or finite endpoint. Verify that the next page advances and that an error cannot replay a page forever.

## Storage and browser polling

Batch related Durable Object writes where the API and atomicity requirements allow it. Check the actual storage calls and changed-key count. A low request count can hide frequent storage operations.

Browser polling pauses in hidden tabs, serializes requests, has a deadline, and stops on terminal outcomes or teardown. Hidden-tab handling does not cancel a request already in flight. A recursive `setTimeout` can create the same recurring work as `setInterval`; inspect both. Prefer the existing client library's polling lifecycle where it already owns the request.

## Operational evidence

Billing alerts are notifications, not a spending cap. Review [billable usage](https://developers.cloudflare.com/billing/manage/billable-usage/) and product metrics after changes to recurring work. Establish an operational way to stop the work without deleting product data. Keep production reads, writes, migrations, and deployments under the repository's authorization rules.

Report code-level findings separately from observed usage. A passing lint rule or a quiet metric graph cannot prove the other. Name any path whose cost remains unmeasured.
