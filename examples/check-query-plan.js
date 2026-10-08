/** Check one D1 statement in a local integration test, with query-local exceptions. */
export async function checkQueryPlan(
  db,
  query,
  params = [],
  allowedScans = {},
) {
  const { results } = await db
    .prepare(`EXPLAIN QUERY PLAN ${query}`)
    .bind(...params)
    .all();
  const scans = results
    .map(({ detail }) => detail)
    .filter((detail) => /^SCAN\b/.test(detail));
  const unexpected = scans.filter(
    (detail) =>
      !Object.hasOwn(allowedScans, detail) || !allowedScans[detail].trim(),
  );
  if (unexpected.length)
    throw new Error(
      `Unreviewed query scans: ${unexpected.join("; ")}\n${query}`,
    );
  return results;
}
