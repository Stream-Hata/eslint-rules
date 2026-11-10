import type { ProgramNode, StatementNode } from './ast.js';
import type { CommentToken, Token } from './tokenizer.js';
import { parse as parseSql } from './parser.js';

export * from './ast.js';
export { computeLineIndents } from './lineIndent.js';
export type { LineIndentIssue, LineIndentResult } from './lineIndent.js';
export { ParseError, SqlParser } from './parser.js';
export { checkSql, looksLikeSql } from './sqlChecks.js';
export type { CheckSqlResult, SqlCheckOptions, SqlIssue } from './sqlChecks.js';
export type { CommentToken, Token, TokenizeError } from './tokenizer.js';
export { tokenize } from './tokenizer.js';

const VISITOR_KEYS: Record<string, string[]> = {
	Program: ['body'],
	SelectStatement: ['columns', 'from', 'where', 'groupBy', 'having', 'orderBy', 'limit'],
	SelectItem: ['expr', 'alias'],
	FromClause: ['items'],
	TableRef: ['schema', 'name', 'alias'],
	JoinClause: ['table', 'on'],
	OrderByItem: ['expr'],
	LimitClause: ['limit', 'offset'],
	InsertStatement: ['table', 'columns', 'rows'],
	RowValue: ['items'],
	UpdateStatement: ['table', 'set', 'where'],
	SetItem: ['column', 'value'],
	DeleteStatement: ['table', 'where'],
	CreateTableStatement: ['table', 'columns'],
	ColumnDef: ['name'],
	DropTableStatement: ['table'],
	AlterTableStatement: ['table', 'column'],
	Literal: [],
	Identifier: [],
	Star: [],
	ColumnRef: [],
	BinaryExpression: ['left', 'right'],
	LogicalExpression: ['left', 'right'],
	UnaryExpression: ['argument'],
	InExpression: ['expr', 'list'],
	BetweenExpression: ['expr', 'lower', 'upper'],
	LikeExpression: ['expr', 'pattern'],
	IsNullExpression: ['expr'],
	FunctionCall: ['args'],
	WhenClause: ['when', 'then'],
	CaseExpression: ['operand', 'whenClauses', 'elseClause'],
	ParenExpression: ['expr'],
};

interface ParserOptions {
	filePath?: string;
}

export interface SqlAst extends ProgramNode {
	body: StatementNode[];
	tokens: Token[];
	comments: CommentToken[];
}

function endLocOf(code: string): { line: number; column: number } {
	let line = 1;
	let column = 0;
	for (const ch of code) {
		if (ch === '\n') {
			line += 1;
			column = 0;
		} else {
			column += 1;
		}
	}
	return { line, column };
}

function buildProgram(code: string): SqlAst {
	const { body, tokens, comments } = parseSql(code);
	const firstToken = tokens[0];
	const lastToken = tokens[tokens.length - 1];
	return {
		type: 'Program',
		body,
		tokens,
		comments,
		range: [0, code.length],
		loc: {
			start: firstToken?.loc.start ?? { line: 1, column: 0 },
			end: lastToken?.loc.end ?? endLocOf(code),
		},
	};
}

export function parseForESLint(
	code: string,
	_options?: ParserOptions,
): {
	ast: SqlAst;
	services: Record<string, never>;
	visitorKeys: Record<string, string[]>;
	scopeManager: null;
} {
	return {
		ast: buildProgram(code),
		services: {},
		visitorKeys: VISITOR_KEYS,
		scopeManager: null,
	};
}

export function parse(code: string): SqlAst {
	return buildProgram(code);
}

export const meta = {
	name: 'eslint-sql-parser',
	version: '0.1.0',
};

export default {
	meta,
	parseForESLint,
	parse,
};
