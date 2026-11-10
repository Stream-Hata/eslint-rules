import type { ExpressionNode, StatementNode } from './ast.js';
import { computeLineIndents } from './lineIndent.js';
import { parse } from './parser.js';
import { tokenize } from './tokenizer.js';

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

const STATEMENT_OPENERS = new Set([
	'SELECT',
	'INSERT',
	'UPDATE',
	'DELETE',
	'CREATE',
	'ALTER',
	'DROP',
	'WITH',
]);

function indentKind(indent: string): string {
	if (indent.length === 0) {
		return 'no indentation';
	}
	return indent.includes('\t') ? 'tabs' : 'spaces';
}

function addTrailingWhitespaceIssues(sql: string, issues: SqlIssue[]): void {
	const lines = sql.split('\n');
	let offset = 0;
	for (const line of lines) {
		const match = /[ \t]+$/.exec(line);
		if (match !== null) {
			issues.push({
				offset: offset + match.index,
				length: match[0].length,
				message: 'Trailing whitespace.',
				fixText: '',
			});
		}
		offset += line.length + 1;
	}
}

function addUppercaseKeywordIssues(sql: string, issues: SqlIssue[]): void {
	const { tokens } = tokenize(sql);
	for (const token of tokens) {
		if (token.type !== 'keyword') {
			continue;
		}
		const upper = token.value.toUpperCase();
		if (token.value !== upper) {
			issues.push({
				offset: token.range[0],
				length: token.range[1] - token.range[0],
				message: `Keyword "${token.value}" should be uppercase ("${upper}").`,
				fixText: upper,
			});
		}
	}
}

function addIndentIssues(sql: string, formatted: string, issues: SqlIssue[]): void {
	const { issues: lineIssues } = computeLineIndents(sql, formatted);
	for (const lineIssue of lineIssues) {
		issues.push({
			offset: lineIssue.startOffset,
			length: lineIssue.actualIndent.length,
			message: `Unexpected indentation: expected ${lineIssue.expectedIndent.length} ${indentKind(
				lineIssue.expectedIndent,
			)} but found ${lineIssue.actualIndent.length} ${indentKind(lineIssue.actualIndent)}.`,
			fixText: lineIssue.expectedIndent,
		});
	}
}

function isQuotedIdentifier(sql: string, node: { range: [number, number] }): boolean {
	const ch = sql.charAt(node.range[0]);
	return ch === '"' || ch === '`';
}

function addAstIssues(
	sql: string,
	body: StatementNode[],
	options: SqlCheckOptions,
	issues: SqlIssue[],
): void {
	if (options.noSelectStar === true) {
		const visit = (node: unknown): void => {
			if (node === null || typeof node !== 'object') {
				return;
			}
			const obj = node as Record<string, unknown>;
			const type = obj.type;
			if (type === 'SelectItem') {
				const expr = obj.expr as ExpressionNode | undefined;
				if (expr !== undefined && expr.type === 'Star') {
					issues.push({
						offset: expr.range[0],
						length: expr.range[1] - expr.range[0],
						message: 'Avoid SELECT * — list the columns explicitly.',
						fixText: null,
					});
				}
			}
			if (type === 'ColumnRef') {
				const parts = obj.parts as string[] | undefined;
				const range = obj.range as [number, number] | undefined;
				if (
					parts !== undefined &&
					range !== undefined &&
					parts.length > 1 &&
					parts[parts.length - 1] === '*'
				) {
					issues.push({
						offset: range[0],
						length: range[1] - range[0],
						message: 'Avoid table.* — list the columns explicitly.',
						fixText: null,
					});
				}
			}
			for (const key of Object.keys(obj)) {
				const value = obj[key];
				if (Array.isArray(value)) {
					for (const item of value) {
						visit(item);
					}
				} else {
					visit(value);
				}
			}
		};
		for (const statement of body) {
			visit(statement);
		}
	}

	if (options.requireWhereInDml === true) {
		for (const statement of body) {
			if (
				(statement.type === 'UpdateStatement' || statement.type === 'DeleteStatement') &&
				statement.where === null
			) {
				issues.push({
					offset: statement.range[0],
					length: statement.range[1] - statement.range[0],

					message: `${statement.type === 'UpdateStatement' ? 'UPDATE' : 'DELETE'} without a WHERE clause affects all rows.`,
					fixText: null,
				});
			}
		}
	}

	if (options.identifierCase === 'snake_case') {
		const visit = (node: unknown): void => {
			if (node === null || typeof node !== 'object') {
				return;
			}
			const obj = node as Record<string, unknown>;
			if (obj.type === 'Identifier') {
				const name = obj.name as string | undefined;
				const range = obj.range as [number, number] | undefined;
				if (
					name !== undefined &&
					range !== undefined &&
					!isQuotedIdentifier(sql, { range }) &&
					!/^[a-z_][a-z0-9_]*$/.test(name)
				) {
					issues.push({
						offset: range[0],
						length: range[1] - range[0],
						message: `Identifier "${name}" should use snake_case.`,
						fixText: null,
					});
				}
			}
			for (const key of Object.keys(obj)) {
				const value = obj[key];
				if (Array.isArray(value)) {
					for (const item of value) {
						visit(item);
					}
				} else {
					visit(value);
				}
			}
		};
		for (const statement of body) {
			visit(statement);
		}
	}
}

export interface CheckSqlResult {
	isSql: boolean;
	issues: SqlIssue[];
}

export function checkSql(
	sql: string,
	formatted: string | null,
	options: SqlCheckOptions,
): CheckSqlResult {
	const issues: SqlIssue[] = [];
	let isSql = true;

	if (options.trailingWhitespace === true) {
		addTrailingWhitespaceIssues(sql, issues);
	}
	if (options.uppercaseKeywords === true) {
		addUppercaseKeywordIssues(sql, issues);
	}

	if (options.indent === true) {
		if (formatted === null) {
			throw new Error('checkSql: formatted output is required when options.indent is enabled');
		}
		addIndentIssues(sql, formatted, issues);
	}

	try {
		const { body } = parse(sql);
		addAstIssues(sql, body, options, issues);
	} catch {
		isSql = false;
	}

	return { isSql, issues };
}

export function looksLikeSql(sql: string): boolean {
	const match = /^\s*([A-Z]+)/i.exec(sql);
	if (match === null) {
		return false;
	}
	const first = match[1];
	if (first === undefined) {
		return false;
	}
	return STATEMENT_OPENERS.has(first.toUpperCase());
}
