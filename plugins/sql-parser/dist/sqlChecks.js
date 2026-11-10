"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSql = checkSql;
exports.looksLikeSql = looksLikeSql;
const parser_js_1 = require("./parser.js");
const tokenizer_js_1 = require("./tokenizer.js");
const lineIndent_js_1 = require("./lineIndent.js");
const STATEMENT_OPENERS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'WITH']);
function indentKind(indent) {
    if (indent.length === 0) {
        return 'no indentation';
    }
    return indent.includes('\t') ? 'tabs' : 'spaces';
}
function addTrailingWhitespaceIssues(sql, issues) {
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
function addUppercaseKeywordIssues(sql, issues) {
    const { tokens } = (0, tokenizer_js_1.tokenize)(sql);
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
function addIndentIssues(sql, formatted, issues) {
    const { issues: lineIssues } = (0, lineIndent_js_1.computeLineIndents)(sql, formatted);
    for (const lineIssue of lineIssues) {
        issues.push({
            offset: lineIssue.startOffset,
            length: lineIssue.actualIndent.length,
            message: `Unexpected indentation: expected ${lineIssue.expectedIndent.length} ${indentKind(lineIssue.expectedIndent)} but found ${lineIssue.actualIndent.length} ${indentKind(lineIssue.actualIndent)}.`,
            fixText: lineIssue.expectedIndent,
        });
    }
}
function isQuotedIdentifier(sql, node) {
    const ch = sql.charAt(node.range[0]);
    return ch === '"' || ch === '`';
}
function addAstIssues(sql, body, options, issues) {
    if (options.noSelectStar === true) {
        const visit = (node) => {
            if (node === null || typeof node !== 'object') {
                return;
            }
            const obj = node;
            const type = obj.type;
            if (type === 'SelectItem') {
                const expr = obj.expr;
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
                const parts = obj.parts;
                const range = obj.range;
                if (parts !== undefined && range !== undefined && parts.length > 1 && parts[parts.length - 1] === '*') {
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
                }
                else {
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
            if ((statement.type === 'UpdateStatement' || statement.type === 'DeleteStatement') &&
                statement.where === null) {
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
        const visit = (node) => {
            if (node === null || typeof node !== 'object') {
                return;
            }
            const obj = node;
            if (obj.type === 'Identifier') {
                const name = obj.name;
                const range = obj.range;
                if (name !== undefined && range !== undefined && !isQuotedIdentifier(sql, { range }) && !/^[a-z_][a-z0-9_]*$/.test(name)) {
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
                }
                else {
                    visit(value);
                }
            }
        };
        for (const statement of body) {
            visit(statement);
        }
    }
}
function checkSql(sql, formatted, options) {
    const issues = [];
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
        const { body } = (0, parser_js_1.parse)(sql);
        addAstIssues(sql, body, options, issues);
    }
    catch {
        isSql = false;
    }
    return { isSql, issues };
}
function looksLikeSql(sql) {
    const match = /^\s*([A-Za-z]+)/.exec(sql);
    if (match === null) {
        return false;
    }
    const first = match[1];
    if (first === undefined) {
        return false;
    }
    return STATEMENT_OPENERS.has(first.toUpperCase());
}
