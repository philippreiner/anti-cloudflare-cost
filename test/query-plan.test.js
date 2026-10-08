import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { checkQueryPlan } from "../examples/check-query-plan.js";

// Real local SQLite supplies the planner; only its result envelope adapts to D1.
function localD1(sqlite) {
  return {
    prepare(query) {
      return {
        bind(...params) {
          return {
            async all() {
              return { results: sqlite.prepare(query).all(...params) };
            },
          };
        },
      };
    },
  };
}

test("selective sweep passes and missing index fails", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`CREATE TABLE jobs (id INTEGER PRIMARY KEY, status TEXT, due_at INTEGER);
      CREATE INDEX jobs_due ON jobs(status, due_at);
      WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000)
      INSERT INTO jobs SELECT x, 'completed', 0 FROM n;
      INSERT INTO jobs VALUES(1001, 'queued', 10), (1002, 'queued', 100);`);
    const query =
      "SELECT id FROM jobs WHERE status = ? AND due_at <= ? ORDER BY due_at LIMIT ?";
    const params = ["queued", 20, 10];
    const db = localD1(sqlite);
    const plan = await checkQueryPlan(db, query, params);
    assert.ok(plan.some(({ detail }) => detail.startsWith("SEARCH jobs")));
    assert.deepEqual(
      sqlite
        .prepare(query)
        .all(...params)
        .map(({ id }) => id),
      [1001],
    );
    sqlite.exec("DROP INDEX jobs_due");
    await assert.rejects(
      checkQueryPlan(db, query, params),
      /Unreviewed query scans: SCAN jobs/,
    );
  } finally {
    sqlite.close();
  }
});

test("an index scan still needs review and exceptions stay query-local", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(
      "CREATE TABLE jobs (id INTEGER PRIMARY KEY, status TEXT, due_at INTEGER); CREATE INDEX jobs_due ON jobs(status, due_at)",
    );
    const db = localD1(sqlite);
    const query = "SELECT status FROM jobs ORDER BY status, due_at";
    await assert.rejects(
      checkQueryPlan(db, query),
      /SCAN jobs USING COVERING INDEX jobs_due/,
    );
    const plan = await checkQueryPlan(db, query, [], {
      "SCAN jobs USING COVERING INDEX jobs_due":
        "Explicit inventory read in this example only.",
    });
    assert.equal(plan[0].detail, "SCAN jobs USING COVERING INDEX jobs_due");
    await assert.rejects(checkQueryPlan(db, query), /Unreviewed query scans/);
    await assert.rejects(
      checkQueryPlan(db, query, [], {
        "SCAN jobs USING COVERING INDEX jobs_due": " ",
      }),
      /Unreviewed query scans/,
    );
  } finally {
    sqlite.close();
  }
});

test("idle operation checks its actual SQL and restores prepare after failure", async () => {
  const { checkIdleWork } = await import("../examples/check-idle-work.js");
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(
      "CREATE TABLE jobs (id INTEGER PRIMARY KEY, status TEXT); INSERT INTO jobs VALUES(1, 'queued')",
    );
    const db = localD1(sqlite);
    const prepare = db.prepare;
    const work = async () => {
      await db
        .prepare("SELECT id FROM jobs WHERE status = ?")
        .bind("queued")
        .all();
    };
    await assert.rejects(
      checkIdleWork(db, work),
      /Unreviewed query scans: SCAN jobs/,
    );
    assert.equal(db.prepare, prepare);
    sqlite.exec("CREATE INDEX jobs_status ON jobs(status)");
    const statements = await checkIdleWork(db, work);
    assert.equal(statements.length, 1);
    assert.deepEqual(statements[0].params, ["queued"]);
    assert.ok(
      statements[0].plan.some(({ detail }) => detail.startsWith("SEARCH jobs")),
    );
    await assert.rejects(
      checkIdleWork(db, async () => {
        throw new Error("operation failed");
      }),
      /operation failed/,
    );
    assert.equal(db.prepare, prepare);
    await assert.rejects(
      checkIdleWork(db, async () => {}),
      /issued no SQL/,
    );
  } finally {
    sqlite.close();
  }
});
