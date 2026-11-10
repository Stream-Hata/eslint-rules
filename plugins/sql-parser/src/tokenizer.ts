export interface Position {
	line: number;
	column: number;
}

export interface SourceLocation {
	start: Position;
	end: Position;
}

export type TokenType = 'keyword' | 'identifier' | 'string' | 'number' | 'operator' | 'punctuator';

export interface Token {
	type: TokenType;
	value: string;
	range: [number, number];
	loc: SourceLocation;
}

export interface CommentToken {
	type: 'Line' | 'Block';
	value: string;
	range: [number, number];
	loc: SourceLocation;
}

const KEYWORDS = new Set([
	'SELECT',
	'FROM',
	'WHERE',
	'AS',
	'DISTINCT',
	'GROUP',
	'BY',
	'HAVING',
	'ORDER',
	'LIMIT',
	'OFFSET',
	'JOIN',
	'INNER',
	'LEFT',
	'RIGHT',
	'FULL',
	'OUTER',
	'CROSS',
	'ON',
	'AND',
	'OR',
	'NOT',
	'IN',
	'BETWEEN',
	'LIKE',
	'IS',
	'NULL',
	'TRUE',
	'FALSE',
	'INSERT',
	'INTO',
	'VALUES',
	'UPDATE',
	'SET',
	'DELETE',
	'CREATE',
	'TABLE',
	'IF',
	'EXISTS',
	'DROP',
	'ASC',
	'DESC',
	'CASE',
	'WHEN',
	'THEN',
	'ELSE',
	'END',
	'ALTER',
	'ADD',
	'COLUMN',
	'CASCADE',
	'RESTRICT',
]);

const MULTI_CHAR_OPERATORS = ['<>', '!=', '<=', '>='];

const SINGLE_CHAR_OPERATORS = new Set(['=', '<', '>', '+', '-', '*', '/', '%', '||']);

const PUNCTUATORS = new Set([',', '.', '(', ')', ';']);

export interface TokenizeResult {
	tokens: Token[];
	comments: CommentToken[];
}

export class TokenizeError extends Error {
	public readonly loc: Position;

	public constructor(message: string, loc: Position) {
		super(message);
		this.name = 'TokenizeError';
		this.loc = loc;
	}
}

function isIdentifierStart(ch: string): boolean {
	return /[A-Z_]/i.test(ch);
}

function isIdentifierPart(ch: string): boolean {
	return /[\w$]/.test(ch);
}

function isDigit(ch: string): boolean {
	return ch >= '0' && ch <= '9';
}

function classifyWord(word: string): TokenType {
	return KEYWORDS.has(word.toUpperCase()) ? 'keyword' : 'identifier';
}

export function tokenize(code: string): TokenizeResult {
	const tokens: Token[] = [];
	const comments: CommentToken[] = [];
	let pos = 0;
	let line = 1;
	let column = 0;

	const advance = (count: number): void => {
		for (let i = 0; i < count; i += 1) {
			if (code[pos + i] === '\n') {
				line += 1;
				column = 0;
			} else {
				column += 1;
			}
		}
		pos += count;
	};

	const makeLoc = (startLine: number, startColumn: number): SourceLocation => ({
		start: { line: startLine, column: startColumn },
		end: { line, column },
	});

	const pushToken = (
		type: TokenType,
		value: string,
		startPos: number,
		startLine: number,
		startColumn: number,
	): void => {
		tokens.push({
			type,
			value,
			range: [startPos, pos],
			loc: makeLoc(startLine, startColumn),
		});
	};

	while (pos < code.length) {
		const ch = code.charAt(pos);
		const startPos = pos;
		const startLine = line;
		const startColumn = column;

		if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
			advance(1);
			continue;
		}

		if (ch === '-' && code[pos + 1] === '-') {
			advance(2);
			while (pos < code.length && code[pos] !== '\n') {
				advance(1);
			}
			comments.push({
				type: 'Line',
				value: code.slice(startPos, pos),
				range: [startPos, pos],
				loc: makeLoc(startLine, startColumn),
			});
			continue;
		}

		if (ch === '/' && code[pos + 1] === '*') {
			advance(2);
			while (pos < code.length && !(code[pos] === '*' && code[pos + 1] === '/')) {
				advance(1);
			}
			if (pos >= code.length) {
				throw new TokenizeError('Unterminated block comment', {
					line: startLine,
					column: startColumn,
				});
			}
			advance(2);
			comments.push({
				type: 'Block',
				value: code.slice(startPos, pos),
				range: [startPos, pos],
				loc: makeLoc(startLine, startColumn),
			});
			continue;
		}

		if (ch === '\'') {
			advance(1);
			let value = '';
			while (pos < code.length) {
				const cur = code.charAt(pos);
				if (cur === '\'') {
					if (code[pos + 1] === '\'') {
						value += '\'';
						advance(2);
						continue;
					}
					advance(1);
					break;
				}
				value += cur;
				advance(1);
			}
			if (code[pos - 1] !== '\'') {
				throw new TokenizeError('Unterminated string literal', {
					line: startLine,
					column: startColumn,
				});
			}
			pushToken('string', value, startPos, startLine, startColumn);
			continue;
		}

		if (ch === '"' || ch === '`') {
			const quote = ch;
			advance(1);
			let value = '';
			let closed = false;
			while (pos < code.length) {
				const cur = code.charAt(pos);
				if (cur === quote) {
					advance(1);
					closed = true;
					break;
				}
				value += cur;
				advance(1);
			}
			if (!closed) {
				throw new TokenizeError('Unterminated quoted identifier', {
					line: startLine,
					column: startColumn,
				});
			}
			pushToken('identifier', value, startPos, startLine, startColumn);
			continue;
		}

		if (isDigit(ch) || (ch === '.' && isDigit(code[pos + 1] ?? ''))) {
			let value = '';
			if (ch === '.') {
				value += '.';
				advance(1);
			}
			while (pos < code.length && isDigit(code.charAt(pos))) {
				value += code.charAt(pos);
				advance(1);
			}
			if (code[pos] === '.' && !value.includes('.')) {
				value += '.';
				advance(1);
				while (pos < code.length && isDigit(code.charAt(pos))) {
					value += code.charAt(pos);
					advance(1);
				}
			}
			if (code[pos] === 'e' || code[pos] === 'E') {
				const expStart = pos;
				const expSign = code[pos + 1] === '+' || code[pos + 1] === '-';
				const digitsStart = pos + (expSign ? 2 : 1);
				if (isDigit(code[digitsStart] ?? '')) {
					value += code.slice(pos, digitsStart);
					advance(digitsStart - pos);
					while (pos < code.length && isDigit(code.charAt(pos))) {
						value += code.charAt(pos);
						advance(1);
					}
				} else {
					advance(expStart - pos);
				}
			}
			pushToken('number', value, startPos, startLine, startColumn);
			continue;
		}

		if (isIdentifierStart(ch)) {
			let value = '';
			while (pos < code.length && isIdentifierPart(code.charAt(pos))) {
				value += code.charAt(pos);
				advance(1);
			}
			pushToken(classifyWord(value), value, startPos, startLine, startColumn);
			continue;
		}

		const twoChar = code.slice(pos, pos + 2);
		if (MULTI_CHAR_OPERATORS.includes(twoChar)) {
			advance(2);
			pushToken('operator', twoChar, startPos, startLine, startColumn);
			continue;
		}

		if (SINGLE_CHAR_OPERATORS.has(ch)) {
			advance(1);
			pushToken('operator', ch, startPos, startLine, startColumn);
			continue;
		}

		if (PUNCTUATORS.has(ch)) {
			advance(1);
			pushToken('punctuator', ch, startPos, startLine, startColumn);
			continue;
		}

		throw new TokenizeError(`Unexpected character "${ch}"`, {
			line: startLine,
			column: startColumn,
		});
	}

	return { tokens, comments };
}
