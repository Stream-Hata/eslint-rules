import type {
	AlterTableStatementNode,
	BetweenExpressionNode,
	BinaryExpressionNode,
	CaseExpressionNode,
	ColumnDefNode,
	ColumnRefNode,
	CreateTableStatementNode,
	DeleteStatementNode,
	DropTableStatementNode,
	ExpressionNode,
	FromClauseNode,
	FunctionCallNode,
	IdentifierNode,
	InExpressionNode,
	InsertStatementNode,
	IsNullExpressionNode,
	JoinClauseNode,
	LikeExpressionNode,
	LimitClauseNode,
	LiteralNode,
	LogicalExpressionNode,
	OrderByItemNode,
	RowValueNode,
	SelectItemNode,
	SelectStatementNode,
	SetItemNode,
	StarNode,
	StatementNode,
	TableRefNode,
	UnaryExpressionNode,
	UpdateStatementNode,
	WhenClauseNode,
} from './ast.js';
import type { CommentToken, Position, SourceLocation, Token } from './tokenizer.js';
import { tokenize } from './tokenizer.js';

const COMPARISON_OPERATORS = new Set(['=', '<>', '!=', '<', '<=', '>', '>=']);
const ADDITIVE_OPERATORS = new Set(['+', '-']);
const MULTIPLICATIVE_OPERATORS = new Set(['*', '/', '%']);
const JOIN_START_KEYWORDS = new Set(['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS']);
const NON_ALIAS_KEYWORDS = new Set([
	'FROM',
	'WHERE',
	'GROUP',
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
	'ASC',
	'DESC',
	'WHEN',
	'THEN',
	'ELSE',
	'END',
	'SET',
	'VALUES',
	'SELECT',
	'UNION',
]);

export class ParseError extends SyntaxError {
	public readonly lineNumber: number;
	public readonly column: number;
	public readonly index: number;

	public constructor(message: string, loc: Position, index: number) {
		super(message);
		this.name = 'ParseError';
		this.lineNumber = loc.line;
		this.column = loc.column + 1;
		this.index = index;
	}
}

interface Span {
	range: [number, number];
	loc: SourceLocation;
}

export class SqlParser {
	private readonly tokens: Token[];
	private readonly eofToken: Token;
	private index = 0;

	public constructor(
		private readonly code: string,
		tokens: Token[],
	) {
		this.tokens = tokens;
		this.eofToken = {
			type: 'punctuator',
			value: '',
			range: [code.length, code.length],
			loc: {
				start: endPositionOf(code),
				end: endPositionOf(code),
			},
		};
	}

	public parseProgram(): StatementNode[] {
		const body: StatementNode[] = [];
		while (!this.atEnd()) {
			if (this.matchPunctuator(';')) {
				continue;
			}
			body.push(this.parseStatement());
			if (!this.atEnd() && !this.isPunctuator(';')) {
				this.raise(`Expected ";" between statements but found "${this.current().value}"`);
			}
			this.matchPunctuator(';');
		}
		return body;
	}

	private parseStatement(): StatementNode {
		if (this.isKeyword('SELECT')) {
			return this.parseSelect();
		}
		if (this.isKeyword('INSERT')) {
			return this.parseInsert();
		}
		if (this.isKeyword('UPDATE')) {
			return this.parseUpdate();
		}
		if (this.isKeyword('DELETE')) {
			return this.parseDelete();
		}
		if (this.isKeyword('CREATE')) {
			return this.parseCreateTable();
		}
		if (this.isKeyword('DROP')) {
			return this.parseDropTable();
		}
		if (this.isKeyword('ALTER')) {
			return this.parseAlterTable();
		}
		this.raise(`Unexpected token "${this.current().value}" — expected a statement`);
	}

	private parseSelect(): SelectStatementNode {
		const start = this.expectKeyword('SELECT');
		const distinct = this.matchKeyword('DISTINCT');
		const columns = this.parseSelectList();
		const from = this.isKeyword('FROM') ? this.parseFromClause() : null;
		const where = this.matchKeyword('WHERE') ? this.parseExpression() : null;
		const groupBy = this.parseGroupBy();
		const having = this.matchKeyword('HAVING') ? this.parseExpression() : null;
		const orderBy = this.parseOrderBy();
		const limit = this.parseLimit();
		return {
			type: 'SelectStatement',
			distinct,
			columns,
			from,
			where,
			groupBy,
			having,
			orderBy,
			limit,
			...this.span(start, this.previous()),
		};
	}

	private parseSelectList(): SelectItemNode[] {
		const items: SelectItemNode[] = [];
		do {
			const start = this.current();
			const expr = this.parseExpression();
			let alias: IdentifierNode | null = null;
			if (this.matchKeyword('AS')) {
				alias = this.parseIdentifierNode();
			} else if (this.canBeAlias()) {
				alias = this.parseIdentifierNode();
			}
			items.push({
				type: 'SelectItem',
				expr,
				alias,
				...this.span(start, this.previous()),
			});
		} while (this.matchPunctuator(','));
		return items;
	}

	private parseFromClause(): FromClauseNode {
		const start = this.expectKeyword('FROM');
		const items: (TableRefNode | JoinClauseNode)[] = [this.parseTableRef()];
		for (;;) {
			if (this.matchPunctuator(',')) {
				items.push(this.parseTableRef());
				continue;
			}
			if (this.isJoinStart()) {
				items.push(this.parseJoinClause());
				continue;
			}
			break;
		}
		return {
			type: 'FromClause',
			items,
			...this.span(start, this.previous()),
		};
	}

	private isJoinStart(): boolean {
		const token = this.current();
		return token.type === 'keyword' && JOIN_START_KEYWORDS.has(token.value.toUpperCase());
	}

	private parseJoinClause(): JoinClauseNode {
		const start = this.current();
		let kind: JoinClauseNode['kind'] = 'INNER';
		if (this.matchKeyword('INNER')) {
			kind = 'INNER';
			this.expectKeyword('JOIN');
		} else if (this.matchKeyword('LEFT')) {
			kind = 'LEFT';
			this.matchKeyword('OUTER');
			this.expectKeyword('JOIN');
		} else if (this.matchKeyword('RIGHT')) {
			kind = 'RIGHT';
			this.matchKeyword('OUTER');
			this.expectKeyword('JOIN');
		} else if (this.matchKeyword('FULL')) {
			kind = 'FULL';
			this.matchKeyword('OUTER');
			this.expectKeyword('JOIN');
		} else if (this.matchKeyword('CROSS')) {
			kind = 'CROSS';
			this.expectKeyword('JOIN');
		} else {
			this.expectKeyword('JOIN');
		}
		const table = this.parseTableRef();
		const on = this.matchKeyword('ON') ? this.parseExpression() : null;
		return {
			type: 'JoinClause',
			kind,
			table,
			on,
			...this.span(start, this.previous()),
		};
	}

	private parseTableRef(): TableRefNode {
		const start = this.current();
		const first = this.parseIdentifierNode();
		let schema: IdentifierNode | null = null;
		let name = first;
		if (this.matchPunctuator('.')) {
			schema = first;
			name = this.parseIdentifierNode();
		}
		let alias: IdentifierNode | null = null;
		if (this.matchKeyword('AS')) {
			alias = this.parseIdentifierNode();
		} else if (this.canBeAlias()) {
			alias = this.parseIdentifierNode();
		}
		return {
			type: 'TableRef',
			schema,
			name,
			alias,
			...this.span(start, this.previous()),
		};
	}

	private parseGroupBy(): ExpressionNode[] {
		if (!this.isKeyword('GROUP')) {
			return [];
		}
		this.advance();
		this.expectKeyword('BY');
		return this.parseExpressionList();
	}

	private parseOrderBy(): OrderByItemNode[] {
		if (!this.isKeyword('ORDER')) {
			return [];
		}
		this.advance();
		this.expectKeyword('BY');
		const items: OrderByItemNode[] = [];
		do {
			const itemStart = this.current();
			const expr = this.parseExpression();
			let direction: 'ASC' | 'DESC' | null = null;
			if (this.matchKeyword('ASC')) {
				direction = 'ASC';
			} else if (this.matchKeyword('DESC')) {
				direction = 'DESC';
			}
			items.push({
				type: 'OrderByItem',
				expr,
				direction,
				...this.span(itemStart, this.previous()),
			});
		} while (this.matchPunctuator(','));
		return items;
	}

	private parseLimit(): LimitClauseNode | null {
		if (!this.isKeyword('LIMIT')) {
			return null;
		}
		const start = this.advance();
		const first = this.parseExpression();
		let limit = first;
		let offset: ExpressionNode | null = null;
		if (this.matchPunctuator(',')) {
			offset = first;
			limit = this.parseExpression();
		} else if (this.matchKeyword('OFFSET')) {
			offset = this.parseExpression();
		}
		return {
			type: 'LimitClause',
			limit,
			offset,
			...this.span(start, this.previous()),
		};
	}

	private parseInsert(): InsertStatementNode {
		const start = this.expectKeyword('INSERT');
		this.expectKeyword('INTO');
		const table = this.parseTableRef();
		let columns: IdentifierNode[] | null = null;
		if (this.matchPunctuator('(')) {
			columns = [];
			do {
				if (this.isPunctuator(')')) {
					break;
				}
				columns.push(this.parseIdentifierNode());
			} while (this.matchPunctuator(','));
			this.expectPunctuator(')');
		}
		this.expectKeyword('VALUES');
		const rows: RowValueNode[] = [];
		do {
			const rowStart = this.expectPunctuator('(');
			const items: ExpressionNode[] = [];
			if (!this.isPunctuator(')')) {
				do {
					items.push(this.parseExpression());
				} while (this.matchPunctuator(','));
			}
			this.expectPunctuator(')');
			rows.push({
				type: 'RowValue' as const,
				items,
				...this.span(rowStart, this.previous()),
			});
		} while (this.matchPunctuator(','));
		return {
			type: 'InsertStatement',
			table,
			columns,
			rows,
			...this.span(start, this.previous()),
		};
	}

	private parseUpdate(): UpdateStatementNode {
		const start = this.expectKeyword('UPDATE');
		const table = this.parseTableRef();
		this.expectKeyword('SET');
		const set: SetItemNode[] = [];
		do {
			const itemStart = this.current();
			const column = this.parseIdentifierNode();
			this.expectOperator('=');
			const value = this.parseExpression();
			set.push({
				type: 'SetItem',
				column,
				value,
				...this.span(itemStart, this.previous()),
			});
		} while (this.matchPunctuator(','));
		const where = this.matchKeyword('WHERE') ? this.parseExpression() : null;
		return {
			type: 'UpdateStatement',
			table,
			set,
			where,
			...this.span(start, this.previous()),
		};
	}

	private parseDelete(): DeleteStatementNode {
		const start = this.expectKeyword('DELETE');
		this.expectKeyword('FROM');
		const table = this.parseTableRef();
		const where = this.matchKeyword('WHERE') ? this.parseExpression() : null;
		return {
			type: 'DeleteStatement',
			table,
			where,
			...this.span(start, this.previous()),
		};
	}

	private parseCreateTable(): CreateTableStatementNode {
		const start = this.expectKeyword('CREATE');
		this.expectKeyword('TABLE');
		let ifNotExists = false;
		if (this.matchKeyword('IF')) {
			this.expectKeyword('NOT');
			this.expectKeyword('EXISTS');
			ifNotExists = true;
		}
		const table = this.parseTableRef();
		this.expectPunctuator('(');
		const columns: ColumnDefNode[] = [];
		do {
			if (this.isPunctuator(')')) {
				break;
			}
			columns.push(this.parseColumnDef());
		} while (this.matchPunctuator(','));
		this.expectPunctuator(')');
		return {
			type: 'CreateTableStatement',
			ifNotExists,
			table,
			columns,
			...this.span(start, this.previous()),
		};
	}

	private parseColumnDef(): ColumnDefNode {
		const start = this.current();
		const name = this.parseIdentifierNode();
		const typeStartIndex = this.index;
		let depth = 0;
		while (!this.atEnd()) {
			const token = this.current();
			if (depth === 0 && (this.isPunctuator(',') || this.isPunctuator(')'))) {
				break;
			}
			if (token.type === 'punctuator' && token.value === '(') {
				depth += 1;
			} else if (token.type === 'punctuator' && token.value === ')') {
				depth -= 1;
			}
			this.advance();
		}
		if (this.index === typeStartIndex) {
			this.raise('Expected a column data type');
		}
		const typeEnd = this.previous();
		const typeStartToken = this.tokens[typeStartIndex];
		if (typeStartToken === undefined) {
			this.raise('Expected a column data type');
		}
		const dataType = this.code.slice(typeStartToken.range[0], typeEnd.range[1]).trim();
		return {
			type: 'ColumnDef',
			name,
			dataType,
			...this.span(start, typeEnd),
		};
	}

	private parseDropTable(): DropTableStatementNode {
		const start = this.expectKeyword('DROP');
		this.expectKeyword('TABLE');
		let ifExists = false;
		if (this.matchKeyword('IF')) {
			this.expectKeyword('EXISTS');
			ifExists = true;
		}
		const table = this.parseTableRef();
		return {
			type: 'DropTableStatement',
			ifExists,
			table,
			...this.span(start, this.previous()),
		};
	}

	private parseAlterTable(): AlterTableStatementNode {
		const start = this.expectKeyword('ALTER');
		this.expectKeyword('TABLE');
		const table = this.parseTableRef();
		let action: 'ADD COLUMN' | 'ALTER COLUMN' | 'DROP COLUMN';
		if (this.matchKeyword('ADD')) {
			this.matchKeyword('COLUMN');
			action = 'ADD COLUMN';
		} else if (this.matchKeyword('DROP')) {
			this.matchKeyword('COLUMN');
			action = 'DROP COLUMN';
		} else {
			this.expectKeyword('ALTER');
			this.matchKeyword('COLUMN');
			action = 'ALTER COLUMN';
		}
		const column = this.parseIdentifierNode();

		let dataType: string | null = null;
		if (action !== 'DROP COLUMN') {
			const typeStartIndex = this.index;
			while (!this.atEnd() && !this.isPunctuator(';')) {
				this.advance();
			}
			if (this.index > typeStartIndex) {
				const typeEnd = this.previous();
				const typeStartToken = this.tokens[typeStartIndex];
				if (typeStartToken !== undefined) {
					dataType = this.code.slice(typeStartToken.range[0], typeEnd.range[1]).trim();
				}
			}
		} else {
			this.matchKeyword('CASCADE');
			this.matchKeyword('RESTRICT');
		}

		return {
			type: 'AlterTableStatement',
			table,
			action,
			column,
			dataType,
			...this.span(start, this.previous()),
		};
	}

	private parseExpression(): ExpressionNode {
		return this.parseOr();
	}

	private parseExpressionList(): ExpressionNode[] {
		const list: ExpressionNode[] = [];
		do {
			list.push(this.parseExpression());
		} while (this.matchPunctuator(','));
		return list;
	}

	private parseOr(): ExpressionNode {
		const start = this.current();
		let left = this.parseAnd();
		while (this.matchKeyword('OR')) {
			const right = this.parseAnd();
			const node: LogicalExpressionNode = {
				type: 'LogicalExpression',
				operator: 'OR',
				left,
				right,
				...this.span(start, this.previous()),
			};
			left = node;
		}
		return left;
	}

	private parseAnd(): ExpressionNode {
		const start = this.current();
		let left = this.parseNot();
		while (this.matchKeyword('AND')) {
			const right = this.parseNot();
			const node: LogicalExpressionNode = {
				type: 'LogicalExpression',
				operator: 'AND',
				left,
				right,
				...this.span(start, this.previous()),
			};
			left = node;
		}
		return left;
	}

	private parseNot(): ExpressionNode {
		if (this.isKeyword('NOT')) {
			const start = this.advance();
			const argument = this.parseNot();
			const node: UnaryExpressionNode = {
				type: 'UnaryExpression',
				operator: 'NOT',
				argument,
				...this.span(start, this.previous()),
			};
			return node;
		}
		return this.parseComparison();
	}

	private parseComparison(): ExpressionNode {
		const start = this.current();
		let left = this.parseAdditive();
		for (;;) {
			if (this.isKeyword('IS')) {
				const opStart = this.advance();
				const not = this.matchKeyword('NOT');
				this.expectKeyword('NULL');
				const node: IsNullExpressionNode = {
					type: 'IsNullExpression',
					not,
					expr: left,
					...this.span(opStart, this.previous()),
				};
				left = node;
				continue;
			}

			let not = false;
			if (
				this.isKeyword('NOT') &&
				(this.isNextKeyword('IN') || this.isNextKeyword('BETWEEN') || this.isNextKeyword('LIKE'))
			) {
				this.advance();
				not = true;
			}

			if (this.isKeyword('IN')) {
				const opStart = this.advance();
				this.expectPunctuator('(');
				let list: ExpressionNode[] | SelectStatementNode;
				if (this.isKeyword('SELECT')) {
					list = this.parseSelect();
				} else {
					list = [];
					if (!this.isPunctuator(')')) {
						do {
							list.push(this.parseExpression());
						} while (this.matchPunctuator(','));
					}
				}
				this.expectPunctuator(')');
				const node: InExpressionNode = {
					type: 'InExpression',
					not,
					expr: left,
					list,
					...this.span(opStart, this.previous()),
				};
				left = node;
				continue;
			}

			if (this.isKeyword('BETWEEN')) {
				const opStart = this.advance();
				const lower = this.parseAdditive();
				this.expectKeyword('AND');
				const upper = this.parseAdditive();
				const node: BetweenExpressionNode = {
					type: 'BetweenExpression',
					not,
					expr: left,
					lower,
					upper,
					...this.span(opStart, this.previous()),
				};
				left = node;
				continue;
			}

			if (this.isKeyword('LIKE')) {
				const opStart = this.advance();
				const pattern = this.parseAdditive();
				const node: LikeExpressionNode = {
					type: 'LikeExpression',
					not,
					expr: left,
					pattern,
					...this.span(opStart, this.previous()),
				};
				left = node;
				continue;
			}

			const operator = this.matchAnyOperator(COMPARISON_OPERATORS);
			if (operator !== null) {
				const right = this.parseAdditive();
				const node: BinaryExpressionNode = {
					type: 'BinaryExpression',
					operator,
					left,
					right,
					...this.span(start, this.previous()),
				};
				left = node;
				continue;
			}

			break;
		}
		return left;
	}

	private parseAdditive(): ExpressionNode {
		const start = this.current();
		let left = this.parseMultiplicative();
		for (;;) {
			const operator = this.matchAnyOperator(ADDITIVE_OPERATORS);
			if (operator === null) {
				return left;
			}
			const right = this.parseMultiplicative();
			left = {
				type: 'BinaryExpression',
				operator,
				left,
				right,
				...this.span(start, this.previous()),
			};
		}
	}

	private parseMultiplicative(): ExpressionNode {
		const start = this.current();
		let left = this.parseUnary();
		for (;;) {
			const operator = this.matchAnyOperator(MULTIPLICATIVE_OPERATORS);
			if (operator === null) {
				return left;
			}
			const right = this.parseUnary();
			left = {
				type: 'BinaryExpression',
				operator,
				left,
				right,
				...this.span(start, this.previous()),
			};
		}
	}

	private parseUnary(): ExpressionNode {
		if (this.isOperator('-') || this.isOperator('+')) {
			const start = this.advance();
			const argument = this.parseUnary();
			const operator = start.value === '-' ? '-' : '+';
			const node: UnaryExpressionNode = {
				type: 'UnaryExpression',
				operator,
				argument,
				...this.span(start, this.previous()),
			};
			return node;
		}
		return this.parsePrimary();
	}

	private parsePrimary(): ExpressionNode {
		const token = this.current();

		if (token.type === 'number') {
			this.advance();
			const node: LiteralNode = {
				type: 'Literal',
				value: Number(token.value),
				raw: token.value,
				...this.span(token, token),
			};
			return node;
		}

		if (token.type === 'string') {
			this.advance();
			const node: LiteralNode = {
				type: 'Literal',
				value: token.value,
				raw: this.code.slice(token.range[0], token.range[1]),
				...this.span(token, token),
			};
			return node;
		}

		if (this.isKeyword('NULL') || this.isKeyword('TRUE') || this.isKeyword('FALSE')) {
			this.advance();
			const keyword = token.value.toUpperCase();
			const value = keyword === 'NULL' ? null : keyword === 'TRUE';
			const node: LiteralNode = {
				type: 'Literal',
				value,
				raw: token.value,
				...this.span(token, token),
			};
			return node;
		}

		if (this.isKeyword('CASE')) {
			return this.parseCase();
		}

		if (this.isKeyword('EXISTS')) {
			const start = this.advance();
			this.expectPunctuator('(');
			const subquery = this.parseSelect();
			this.expectPunctuator(')');
			return {
				...subquery,
				...this.span(start, this.previous()),
			};
		}

		if (this.isPunctuator('(')) {
			const start = this.advance();
			if (this.isKeyword('SELECT')) {
				const subquery = this.parseSelect();
				this.expectPunctuator(')');
				return {
					...subquery,
					...this.span(start, this.previous()),
				};
			}
			const expr = this.parseExpression();
			this.expectPunctuator(')');
			return {
				type: 'ParenExpression',
				expr,
				...this.span(start, this.previous()),
			};
		}

		if (this.isOperator('*')) {
			const star = this.advance();
			const node: StarNode = {
				type: 'Star',
				...this.span(star, star),
			};
			return node;
		}

		if (token.type === 'identifier') {
			return this.parseIdentifierExpression();
		}

		this.raise(`Unexpected token "${token.value}" in expression`);
	}

	private parseIdentifierExpression(): ExpressionNode {
		const start = this.current();
		const first = this.parseIdentifierNode();

		if (!this.isPunctuator('.')) {
			if (this.isPunctuator('(')) {
				return this.parseFunctionCall(start, first);
			}
			const node: ColumnRefNode = {
				type: 'ColumnRef',
				parts: [first.name],
				...this.span(start, this.previous()),
			};
			return node;
		}

		const parts = [first.name];
		while (this.matchPunctuator('.')) {
			if (this.isOperator('*')) {
				this.advance();
				parts.push('*');
				break;
			}
			parts.push(this.parseIdentifierNode().name);
		}
		const node: ColumnRefNode = {
			type: 'ColumnRef',
			parts,
			...this.span(start, this.previous()),
		};
		return node;
	}

	private parseFunctionCall(start: Token, name: IdentifierNode): FunctionCallNode {
		this.expectPunctuator('(');
		let distinct = false;
		let args: ExpressionNode[] | StarNode;
		if (this.matchKeyword('DISTINCT')) {
			distinct = true;
		}
		if (this.isOperator('*')) {
			const star = this.advance();
			const starNode: StarNode = {
				type: 'Star',
				...this.span(star, star),
			};
			args = starNode;
		} else if (this.isPunctuator(')')) {
			args = [];
		} else {
			args = this.parseExpressionList();
		}
		this.expectPunctuator(')');
		const node: FunctionCallNode = {
			type: 'FunctionCall',
			name: name.name,
			distinct,
			args,
			...this.span(start, this.previous()),
		};
		return node;
	}

	private parseCase(): CaseExpressionNode {
		const start = this.expectKeyword('CASE');
		const operand = this.isKeyword('WHEN') ? null : this.parseExpression();
		const whenClauses: WhenClauseNode[] = [];
		while (this.isKeyword('WHEN')) {
			const clauseStart = this.advance();
			const when = this.parseExpression();
			this.expectKeyword('THEN');
			const then = this.parseExpression();
			whenClauses.push({
				type: 'WhenClause' as const,
				when,
				then,
				...this.span(clauseStart, this.previous()),
			});
		}
		if (whenClauses.length === 0) {
			this.raise('CASE expression requires at least one WHEN clause');
		}
		const elseClause = this.matchKeyword('ELSE') ? this.parseExpression() : null;
		this.expectKeyword('END');
		return {
			type: 'CaseExpression',
			operand,
			whenClauses,
			elseClause,
			...this.span(start, this.previous()),
		};
	}

	private parseIdentifierNode(): IdentifierNode {
		const token = this.current();
		if (token.type !== 'identifier' && token.type !== 'keyword') {
			this.raise(`Expected an identifier but found "${token.value}"`);
		}
		if (token.type === 'keyword' && !this.isAllowedAsIdentifier(token.value)) {
			this.raise(`Keyword "${token.value}" cannot be used as an identifier here`);
		}
		this.advance();
		return {
			type: 'Identifier',
			name: token.value,
			...this.span(token, token),
		};
	}

	private isAllowedAsIdentifier(value: string): boolean {
		return !NON_ALIAS_KEYWORDS.has(value.toUpperCase());
	}

	private canBeAlias(): boolean {
		const token = this.current();
		if (token.type === 'identifier') {
			return true;
		}
		return false;
	}

	private span(start: Token, end: Token): Span {
		return {
			range: [start.range[0], end.range[1]],
			loc: { start: start.loc.start, end: end.loc.end },
		};
	}

	private atEnd(): boolean {
		return this.index >= this.tokens.length;
	}

	private current(): Token {
		return this.tokens[this.index] ?? this.eofToken;
	}

	private previous(): Token {
		return this.tokens[this.index - 1] ?? this.eofToken;
	}

	private advance(): Token {
		const token = this.current();
		if (this.index < this.tokens.length) {
			this.index += 1;
		}
		return token;
	}

	private isPunctuator(value: string): boolean {
		const token = this.current();
		return token.type === 'punctuator' && token.value === value;
	}

	private matchPunctuator(value: string): boolean {
		if (this.isPunctuator(value)) {
			this.advance();
			return true;
		}
		return false;
	}

	private expectPunctuator(value: string): Token {
		if (!this.isPunctuator(value)) {
			this.raise(`Expected "${value}" but found "${this.current().value}"`);
		}
		return this.advance();
	}

	private isOperator(value: string): boolean {
		const token = this.current();
		return token.type === 'operator' && token.value === value;
	}

	private matchAnyOperator(operators: Set<string>): string | null {
		const token = this.current();
		if (token.type === 'operator' && operators.has(token.value)) {
			this.advance();
			return token.value;
		}
		return null;
	}

	private expectOperator(value: string): Token {
		if (!this.isOperator(value)) {
			this.raise(`Expected "${value}" but found "${this.current().value}"`);
		}
		return this.advance();
	}

	private isKeyword(value: string): boolean {
		const token = this.current();
		return token.type === 'keyword' && token.value.toUpperCase() === value;
	}

	private isNextKeyword(value: string): boolean {
		const token = this.tokens[this.index + 1];
		return token?.type === 'keyword' && token.value.toUpperCase() === value;
	}

	private matchKeyword(value: string): boolean {
		if (this.isKeyword(value)) {
			this.advance();
			return true;
		}
		return false;
	}

	private expectKeyword(value: string): Token {
		if (!this.isKeyword(value)) {
			this.raise(`Expected keyword "${value}" but found "${this.current().value}"`);
		}
		return this.advance();
	}

	private raise(message: string): never {
		const token = this.current();
		throw new ParseError(message, token.loc.start, token.range[0]);
	}
}

function endPositionOf(code: string): Position {
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

export interface ParseResult {
	body: StatementNode[];
	tokens: Token[];
	comments: CommentToken[];
}

export function parse(code: string): ParseResult {
	const { tokens, comments } = tokenize(code);
	const parser = new SqlParser(code, tokens);
	const body = parser.parseProgram();
	return { body, tokens, comments };
}
