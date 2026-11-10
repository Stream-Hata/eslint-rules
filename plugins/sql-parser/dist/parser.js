"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlParser = exports.ParseError = void 0;
exports.parse = parse;
const tokenizer_js_1 = require("./tokenizer.js");
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
class ParseError extends SyntaxError {
    lineNumber;
    column;
    index;
    constructor(message, loc, index) {
        super(message);
        this.name = 'ParseError';
        this.lineNumber = loc.line;
        this.column = loc.column + 1;
        this.index = index;
    }
}
exports.ParseError = ParseError;
class SqlParser {
    code;
    tokens;
    eofToken;
    index = 0;
    constructor(code, tokens) {
        this.code = code;
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
    parseProgram() {
        const body = [];
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
    parseStatement() {
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
    parseSelect() {
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
    parseSelectList() {
        const items = [];
        do {
            const start = this.current();
            const expr = this.parseExpression();
            let alias = null;
            if (this.matchKeyword('AS')) {
                alias = this.parseIdentifierNode();
            }
            else if (this.canBeAlias()) {
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
    parseFromClause() {
        const start = this.expectKeyword('FROM');
        const items = [this.parseTableRef()];
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
    isJoinStart() {
        const token = this.current();
        return token.type === 'keyword' && JOIN_START_KEYWORDS.has(token.value.toUpperCase());
    }
    parseJoinClause() {
        const start = this.current();
        let kind = 'INNER';
        if (this.matchKeyword('INNER')) {
            kind = 'INNER';
            this.expectKeyword('JOIN');
        }
        else if (this.matchKeyword('LEFT')) {
            kind = 'LEFT';
            this.matchKeyword('OUTER');
            this.expectKeyword('JOIN');
        }
        else if (this.matchKeyword('RIGHT')) {
            kind = 'RIGHT';
            this.matchKeyword('OUTER');
            this.expectKeyword('JOIN');
        }
        else if (this.matchKeyword('FULL')) {
            kind = 'FULL';
            this.matchKeyword('OUTER');
            this.expectKeyword('JOIN');
        }
        else if (this.matchKeyword('CROSS')) {
            kind = 'CROSS';
            this.expectKeyword('JOIN');
        }
        else {
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
    parseTableRef() {
        const start = this.current();
        const first = this.parseIdentifierNode();
        let schema = null;
        let name = first;
        if (this.matchPunctuator('.')) {
            schema = first;
            name = this.parseIdentifierNode();
        }
        let alias = null;
        if (this.matchKeyword('AS')) {
            alias = this.parseIdentifierNode();
        }
        else if (this.canBeAlias()) {
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
    parseGroupBy() {
        if (!this.isKeyword('GROUP')) {
            return [];
        }
        this.advance();
        this.expectKeyword('BY');
        return this.parseExpressionList();
    }
    parseOrderBy() {
        if (!this.isKeyword('ORDER')) {
            return [];
        }
        this.advance();
        this.expectKeyword('BY');
        const items = [];
        do {
            const itemStart = this.current();
            const expr = this.parseExpression();
            let direction = null;
            if (this.matchKeyword('ASC')) {
                direction = 'ASC';
            }
            else if (this.matchKeyword('DESC')) {
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
    parseLimit() {
        if (!this.isKeyword('LIMIT')) {
            return null;
        }
        const start = this.advance();
        const first = this.parseExpression();
        let limit = first;
        let offset = null;
        if (this.matchPunctuator(',')) {
            offset = first;
            limit = this.parseExpression();
        }
        else if (this.matchKeyword('OFFSET')) {
            offset = this.parseExpression();
        }
        return {
            type: 'LimitClause',
            limit,
            offset,
            ...this.span(start, this.previous()),
        };
    }
    parseInsert() {
        const start = this.expectKeyword('INSERT');
        this.expectKeyword('INTO');
        const table = this.parseTableRef();
        let columns = null;
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
        const rows = [];
        do {
            const rowStart = this.expectPunctuator('(');
            const items = [];
            if (!this.isPunctuator(')')) {
                do {
                    items.push(this.parseExpression());
                } while (this.matchPunctuator(','));
            }
            this.expectPunctuator(')');
            rows.push({
                type: 'RowValue',
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
    parseUpdate() {
        const start = this.expectKeyword('UPDATE');
        const table = this.parseTableRef();
        this.expectKeyword('SET');
        const set = [];
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
    parseDelete() {
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
    parseCreateTable() {
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
        const columns = [];
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
    parseColumnDef() {
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
            }
            else if (token.type === 'punctuator' && token.value === ')') {
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
    parseDropTable() {
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
    parseAlterTable() {
        const start = this.expectKeyword('ALTER');
        this.expectKeyword('TABLE');
        const table = this.parseTableRef();
        let action;
        if (this.matchKeyword('ADD')) {
            this.matchKeyword('COLUMN');
            action = 'ADD COLUMN';
        }
        else if (this.matchKeyword('DROP')) {
            this.matchKeyword('COLUMN');
            action = 'DROP COLUMN';
        }
        else {
            this.expectKeyword('ALTER');
            this.matchKeyword('COLUMN');
            action = 'ALTER COLUMN';
        }
        const column = this.parseIdentifierNode();
        let dataType = null;
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
        }
        else {
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
    parseExpression() {
        return this.parseOr();
    }
    parseExpressionList() {
        const list = [];
        do {
            list.push(this.parseExpression());
        } while (this.matchPunctuator(','));
        return list;
    }
    parseOr() {
        const start = this.current();
        let left = this.parseAnd();
        while (this.matchKeyword('OR')) {
            const right = this.parseAnd();
            const node = {
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
    parseAnd() {
        const start = this.current();
        let left = this.parseNot();
        while (this.matchKeyword('AND')) {
            const right = this.parseNot();
            const node = {
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
    parseNot() {
        if (this.isKeyword('NOT')) {
            const start = this.advance();
            const argument = this.parseNot();
            const node = {
                type: 'UnaryExpression',
                operator: 'NOT',
                argument,
                ...this.span(start, this.previous()),
            };
            return node;
        }
        return this.parseComparison();
    }
    parseComparison() {
        const start = this.current();
        let left = this.parseAdditive();
        for (;;) {
            if (this.isKeyword('IS')) {
                const opStart = this.advance();
                const not = this.matchKeyword('NOT');
                this.expectKeyword('NULL');
                const node = {
                    type: 'IsNullExpression',
                    not,
                    expr: left,
                    ...this.span(opStart, this.previous()),
                };
                left = node;
                continue;
            }
            let not = false;
            if (this.isKeyword('NOT') &&
                (this.isNextKeyword('IN') || this.isNextKeyword('BETWEEN') || this.isNextKeyword('LIKE'))) {
                this.advance();
                not = true;
            }
            if (this.isKeyword('IN')) {
                const opStart = this.advance();
                this.expectPunctuator('(');
                let list;
                if (this.isKeyword('SELECT')) {
                    list = this.parseSelect();
                }
                else {
                    list = [];
                    if (!this.isPunctuator(')')) {
                        do {
                            list.push(this.parseExpression());
                        } while (this.matchPunctuator(','));
                    }
                }
                this.expectPunctuator(')');
                const node = {
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
                const node = {
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
                const node = {
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
                const node = {
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
    parseAdditive() {
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
    parseMultiplicative() {
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
    parseUnary() {
        if (this.isOperator('-') || this.isOperator('+')) {
            const start = this.advance();
            const argument = this.parseUnary();
            const operator = start.value === '-' ? '-' : '+';
            const node = {
                type: 'UnaryExpression',
                operator,
                argument,
                ...this.span(start, this.previous()),
            };
            return node;
        }
        return this.parsePrimary();
    }
    parsePrimary() {
        const token = this.current();
        if (token.type === 'number') {
            this.advance();
            const node = {
                type: 'Literal',
                value: Number(token.value),
                raw: token.value,
                ...this.span(token, token),
            };
            return node;
        }
        if (token.type === 'string') {
            this.advance();
            const node = {
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
            const node = {
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
            const node = {
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
    parseIdentifierExpression() {
        const start = this.current();
        const first = this.parseIdentifierNode();
        if (!this.isPunctuator('.')) {
            if (this.isPunctuator('(')) {
                return this.parseFunctionCall(start, first);
            }
            const node = {
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
        const node = {
            type: 'ColumnRef',
            parts,
            ...this.span(start, this.previous()),
        };
        return node;
    }
    parseFunctionCall(start, name) {
        this.expectPunctuator('(');
        let distinct = false;
        let args;
        if (this.matchKeyword('DISTINCT')) {
            distinct = true;
        }
        if (this.isOperator('*')) {
            const star = this.advance();
            const starNode = {
                type: 'Star',
                ...this.span(star, star),
            };
            args = starNode;
        }
        else if (this.isPunctuator(')')) {
            args = [];
        }
        else {
            args = this.parseExpressionList();
        }
        this.expectPunctuator(')');
        const node = {
            type: 'FunctionCall',
            name: name.name,
            distinct,
            args,
            ...this.span(start, this.previous()),
        };
        return node;
    }
    parseCase() {
        const start = this.expectKeyword('CASE');
        const operand = this.isKeyword('WHEN') ? null : this.parseExpression();
        const whenClauses = [];
        while (this.isKeyword('WHEN')) {
            const clauseStart = this.advance();
            const when = this.parseExpression();
            this.expectKeyword('THEN');
            const then = this.parseExpression();
            whenClauses.push({
                type: 'WhenClause',
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
    parseIdentifierNode() {
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
    isAllowedAsIdentifier(value) {
        return !NON_ALIAS_KEYWORDS.has(value.toUpperCase());
    }
    canBeAlias() {
        const token = this.current();
        if (token.type === 'identifier') {
            return true;
        }
        return false;
    }
    span(start, end) {
        return {
            range: [start.range[0], end.range[1]],
            loc: { start: start.loc.start, end: end.loc.end },
        };
    }
    atEnd() {
        return this.index >= this.tokens.length;
    }
    current() {
        return this.tokens[this.index] ?? this.eofToken;
    }
    previous() {
        return this.tokens[this.index - 1] ?? this.eofToken;
    }
    advance() {
        const token = this.current();
        if (this.index < this.tokens.length) {
            this.index += 1;
        }
        return token;
    }
    isPunctuator(value) {
        const token = this.current();
        return token.type === 'punctuator' && token.value === value;
    }
    matchPunctuator(value) {
        if (this.isPunctuator(value)) {
            this.advance();
            return true;
        }
        return false;
    }
    expectPunctuator(value) {
        if (!this.isPunctuator(value)) {
            this.raise(`Expected "${value}" but found "${this.current().value}"`);
        }
        return this.advance();
    }
    isOperator(value) {
        const token = this.current();
        return token.type === 'operator' && token.value === value;
    }
    matchAnyOperator(operators) {
        const token = this.current();
        if (token.type === 'operator' && operators.has(token.value)) {
            this.advance();
            return token.value;
        }
        return null;
    }
    expectOperator(value) {
        if (!this.isOperator(value)) {
            this.raise(`Expected "${value}" but found "${this.current().value}"`);
        }
        return this.advance();
    }
    isKeyword(value) {
        const token = this.current();
        return token.type === 'keyword' && token.value.toUpperCase() === value;
    }
    isNextKeyword(value) {
        const token = this.tokens[this.index + 1];
        return token?.type === 'keyword' && token.value.toUpperCase() === value;
    }
    matchKeyword(value) {
        if (this.isKeyword(value)) {
            this.advance();
            return true;
        }
        return false;
    }
    expectKeyword(value) {
        if (!this.isKeyword(value)) {
            this.raise(`Expected keyword "${value}" but found "${this.current().value}"`);
        }
        return this.advance();
    }
    raise(message) {
        const token = this.current();
        throw new ParseError(message, token.loc.start, token.range[0]);
    }
}
exports.SqlParser = SqlParser;
function endPositionOf(code) {
    let line = 1;
    let column = 0;
    for (const ch of code) {
        if (ch === '\n') {
            line += 1;
            column = 0;
        }
        else {
            column += 1;
        }
    }
    return { line, column };
}
function parse(code) {
    const { tokens, comments } = (0, tokenizer_js_1.tokenize)(code);
    const parser = new SqlParser(code, tokens);
    const body = parser.parseProgram();
    return { body, tokens, comments };
}
