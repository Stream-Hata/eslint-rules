"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.meta = exports.tokenize = exports.looksLikeSql = exports.checkSql = exports.computeLineIndents = exports.SqlParser = exports.ParseError = void 0;
exports.parseForESLint = parseForESLint;
exports.parse = parse;
const parser_js_1 = require("./parser.js");
var parser_js_2 = require("./parser.js");
Object.defineProperty(exports, "ParseError", { enumerable: true, get: function () { return parser_js_2.ParseError; } });
Object.defineProperty(exports, "SqlParser", { enumerable: true, get: function () { return parser_js_2.SqlParser; } });
var lineIndent_js_1 = require("./lineIndent.js");
Object.defineProperty(exports, "computeLineIndents", { enumerable: true, get: function () { return lineIndent_js_1.computeLineIndents; } });
var sqlChecks_js_1 = require("./sqlChecks.js");
Object.defineProperty(exports, "checkSql", { enumerable: true, get: function () { return sqlChecks_js_1.checkSql; } });
Object.defineProperty(exports, "looksLikeSql", { enumerable: true, get: function () { return sqlChecks_js_1.looksLikeSql; } });
__exportStar(require("./ast.js"), exports);
var tokenizer_js_1 = require("./tokenizer.js");
Object.defineProperty(exports, "tokenize", { enumerable: true, get: function () { return tokenizer_js_1.tokenize; } });
const VISITOR_KEYS = {
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
function endLocOf(code) {
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
function buildProgram(code) {
    const { body, tokens, comments } = (0, parser_js_1.parse)(code);
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
function parseForESLint(code, _options) {
    return {
        ast: buildProgram(code),
        services: {},
        visitorKeys: VISITOR_KEYS,
        scopeManager: null,
    };
}
function parse(code) {
    return buildProgram(code);
}
exports.meta = {
    name: 'eslint-sql-parser',
    version: '0.1.0',
};
exports.default = {
    meta: exports.meta,
    parseForESLint,
    parse,
};
