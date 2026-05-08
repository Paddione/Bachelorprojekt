/**
 * Append `<table>.is_test_data = false` to a SELECT query.
 * `tableOrAlias` is the table name (or its alias) used in the FROM clause.
 *
 * Defense-in-depth helper — every prod-facing read on a seedable table calls it
 * so seeded test fixtures never leak into customer views.
 */
export function excludeTestData(sql: string, tableOrAlias: string): string {
  const filter = `${tableOrAlias}.is_test_data = false`;
  return /\bWHERE\b/i.test(sql)
    ? `${sql} AND ${filter}`
    : `${sql} WHERE ${filter}`;
}
