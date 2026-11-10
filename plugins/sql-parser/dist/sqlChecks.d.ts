export interface SqlIssue {
  offset: number;
  length: number;
  message: string;
  fixText: string | null;
}
export interface SqlCheckOptions {
  indent?: boolean;
  noSelectStar?: boolean;
  requireWhereInDml?: boolean;
  uppercaseKeywords?: boolean;
  identifierCase?: 'snake_case';
  trailingWhitespace?: boolean;
}
export interface CheckSqlResult {
  isSql: boolean;
  issues: SqlIssue[];
}
export declare function checkSql(
  sql: string,
  formatted: string | null,
  options: SqlCheckOptions,
): CheckSqlResult;
export declare function looksLikeSql(sql: string): boolean;
