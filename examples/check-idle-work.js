import { checkQueryPlan } from "./check-query-plan.js";

/** Local tests only: use the same D1 object the operation receives, with no concurrent work. */
export async function checkIdleWork(db, work, allowedScans = {}) {
  const statements = [];
  const prepare = db.prepare;
  db.prepare = (query) => {
    const statement = prepare.call(db, query);
    const recorded = { query, params: [] };
    statements.push(recorded);
    const bind = statement.bind.bind(statement);
    statement.bind = (...params) => {
      recorded.params = params;
      return bind(...params);
    };
    return statement;
  };
  try {
    await work();
  } finally {
    db.prepare = prepare;
  }
  if (!statements.length)
    throw new Error(
      "Idle operation issued no SQL; check the database object and test path.",
    );
  for (const statement of statements)
    statement.plan = await checkQueryPlan(
      db,
      statement.query,
      statement.params,
      allowedScans,
    );
  return statements;
}
