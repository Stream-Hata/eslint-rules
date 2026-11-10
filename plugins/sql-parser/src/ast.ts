import type { CommentToken, SourceLocation, Token } from './tokenizer.js';

export interface BaseNode {
	type: string;
	range: [number, number];
	loc: SourceLocation;
}

export type LiteralValue = string | number | boolean | null;

export interface LiteralNode extends BaseNode {
	type: 'Literal';
	value: LiteralValue;
	raw: string;
}

export interface IdentifierNode extends BaseNode {
	type: 'Identifier';
	name: string;
}

export interface StarNode extends BaseNode {
	type: 'Star';
}

export interface ColumnRefNode extends BaseNode {
	type: 'ColumnRef';
	parts: string[];
}

export interface BinaryExpressionNode extends BaseNode {
	type: 'BinaryExpression';
	operator: string;
	left: ExpressionNode;
	right: ExpressionNode;
}

export interface LogicalExpressionNode extends BaseNode {
	type: 'LogicalExpression';
	operator: 'AND' | 'OR';
	left: ExpressionNode;
	right: ExpressionNode;
}

export interface UnaryExpressionNode extends BaseNode {
	type: 'UnaryExpression';
	operator: 'NOT' | '-' | '+';
	argument: ExpressionNode;
}

export interface InExpressionNode extends BaseNode {
	type: 'InExpression';
	not: boolean;
	expr: ExpressionNode;
	list: ExpressionNode[] | SelectStatementNode;
}

export interface BetweenExpressionNode extends BaseNode {
	type: 'BetweenExpression';
	not: boolean;
	expr: ExpressionNode;
	lower: ExpressionNode;
	upper: ExpressionNode;
}

export interface LikeExpressionNode extends BaseNode {
	type: 'LikeExpression';
	not: boolean;
	expr: ExpressionNode;
	pattern: ExpressionNode;
}

export interface IsNullExpressionNode extends BaseNode {
	type: 'IsNullExpression';
	not: boolean;
	expr: ExpressionNode;
}

export interface FunctionCallNode extends BaseNode {
	type: 'FunctionCall';
	name: string;
	distinct: boolean;
	args: ExpressionNode[] | StarNode;
}

export interface WhenClauseNode extends BaseNode {
	type: 'WhenClause';
	when: ExpressionNode;
	then: ExpressionNode;
}

export interface CaseExpressionNode extends BaseNode {
	type: 'CaseExpression';
	operand: ExpressionNode | null;
	whenClauses: WhenClauseNode[];
	elseClause: ExpressionNode | null;
}

export interface ParenExpressionNode extends BaseNode {
	type: 'ParenExpression';
	expr: ExpressionNode;
}

export type ExpressionNode =
	| LiteralNode
	| IdentifierNode
	| StarNode
	| ColumnRefNode
	| BinaryExpressionNode
	| LogicalExpressionNode
	| UnaryExpressionNode
	| InExpressionNode
	| BetweenExpressionNode
	| LikeExpressionNode
	| IsNullExpressionNode
	| FunctionCallNode
	| CaseExpressionNode
	| ParenExpressionNode
	| SelectStatementNode;

export interface TableRefNode extends BaseNode {
	type: 'TableRef';
	schema: IdentifierNode | null;
	name: IdentifierNode;
	alias: IdentifierNode | null;
}

export interface JoinClauseNode extends BaseNode {
	type: 'JoinClause';
	kind: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
	table: TableRefNode;
	on: ExpressionNode | null;
}

export interface FromClauseNode extends BaseNode {
	type: 'FromClause';
	items: (TableRefNode | JoinClauseNode)[];
}

export interface SelectItemNode extends BaseNode {
	type: 'SelectItem';
	expr: ExpressionNode;
	alias: IdentifierNode | null;
}

export interface OrderByItemNode extends BaseNode {
	type: 'OrderByItem';
	expr: ExpressionNode;
	direction: 'ASC' | 'DESC' | null;
}

export interface LimitClauseNode extends BaseNode {
	type: 'LimitClause';
	limit: ExpressionNode;
	offset: ExpressionNode | null;
}

export interface SelectStatementNode extends BaseNode {
	type: 'SelectStatement';
	distinct: boolean;
	columns: SelectItemNode[];
	from: FromClauseNode | null;
	where: ExpressionNode | null;
	groupBy: ExpressionNode[];
	having: ExpressionNode | null;
	orderBy: OrderByItemNode[];
	limit: LimitClauseNode | null;
}

export interface RowValueNode extends BaseNode {
	type: 'RowValue';
	items: ExpressionNode[];
}

export interface InsertStatementNode extends BaseNode {
	type: 'InsertStatement';
	table: TableRefNode;
	columns: IdentifierNode[] | null;
	rows: RowValueNode[];
}

export interface SetItemNode extends BaseNode {
	type: 'SetItem';
	column: IdentifierNode;
	value: ExpressionNode;
}

export interface UpdateStatementNode extends BaseNode {
	type: 'UpdateStatement';
	table: TableRefNode;
	set: SetItemNode[];
	where: ExpressionNode | null;
}

export interface DeleteStatementNode extends BaseNode {
	type: 'DeleteStatement';
	table: TableRefNode;
	where: ExpressionNode | null;
}

export interface ColumnDefNode extends BaseNode {
	type: 'ColumnDef';
	name: IdentifierNode;
	dataType: string;
}

export interface CreateTableStatementNode extends BaseNode {
	type: 'CreateTableStatement';
	ifNotExists: boolean;
	table: TableRefNode;
	columns: ColumnDefNode[];
}

export interface DropTableStatementNode extends BaseNode {
	type: 'DropTableStatement';
	ifExists: boolean;
	table: TableRefNode;
}

export interface AlterTableStatementNode extends BaseNode {
	type: 'AlterTableStatement';
	table: TableRefNode;
	action: 'ADD COLUMN' | 'ALTER COLUMN' | 'DROP COLUMN';
	column: IdentifierNode;
	dataType: string | null;
}

export type StatementNode =
	| SelectStatementNode
	| InsertStatementNode
	| UpdateStatementNode
	| DeleteStatementNode
	| CreateTableStatementNode
	| DropTableStatementNode
	| AlterTableStatementNode;

export interface ProgramNode extends BaseNode {
	type: 'Program';
	body: StatementNode[];
	tokens: Token[];
	comments: CommentToken[];
}
