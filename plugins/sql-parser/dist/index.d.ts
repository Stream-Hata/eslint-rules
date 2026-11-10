import type { ProgramNode, StatementNode } from './ast.js';
import type { CommentToken, Token } from './tokenizer.js';
export { ParseError, SqlParser } from './parser.js';
export { computeLineIndents } from './lineIndent.js';
export type { LineIndentIssue, LineIndentResult } from './lineIndent.js';
export { checkSql, looksLikeSql } from './sqlChecks.js';
export type { CheckSqlResult, SqlCheckOptions, SqlIssue } from './sqlChecks.js';
export * from './ast.js';
export type { Token, CommentToken, TokenizeError } from './tokenizer.js';
export { tokenize } from './tokenizer.js';
interface ParserOptions {
  filePath?: string;
}
export interface SqlAst extends ProgramNode {
  body: StatementNode[];
  tokens: Token[];
  comments: CommentToken[];
}
export declare function parseForESLint(
  code: string,
  _options?: ParserOptions,
): {
  ast: SqlAst;
  services: Record<string, never>;
  visitorKeys: Record<string, string[]>;
  scopeManager: null;
};
export declare function parse(code: string): SqlAst;
export declare const meta: {
  name: string;
  version: string;
};
declare const _default: {
  meta: {
    name: string;
    version: string;
  };
  parseForESLint: typeof parseForESLint;
  parse: typeof parse;
};
export default _default;
