# eslint-sql-parser

Custom ESLint parser for `.sql` files. Contains a from-scratch SQL tokenizer and a
recursive-descent parser that produces an ESTree-compatible AST so ESLint rules can
visit and lint SQL statements.

## Features

- SQL tokenizer with `range`/`loc` position tracking, `--` and `/* */` comments, quoted
  identifiers, string/number literals.
- Parser supporting:
  - `SELECT` — `DISTINCT`, aliases, schema-qualified tables, joins (`INNER`/`LEFT`/`RIGHT`/
    `FULL`/`CROSS` + `ON`), `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT ... OFFSET`,
    MySQL-style `LIMIT a, b`.
  - Expressions — arithmetic, comparison, `AND`/`OR`/`NOT`, `IN`, `BETWEEN`, `LIKE`,
    `IS [NOT] NULL`, function calls (`COUNT(*)`, `COUNT(DISTINCT x)`), `CASE`, subqueries
    (`EXISTS (...)`, `IN (SELECT ...)`).
  - `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`, `DROP TABLE`.
- Standard ESLint custom-parser contract: `parseForESLint()`, `visitorKeys`, `meta`, and
  parse errors with `lineNumber`/`column`.

## Install

```bash
npm install --save-dev eslint-sql-parser
```

## Usage

Configure ESLint (flat config):

```js
// eslint.config.js
import sqlParser from 'eslint-sql-parser';

export default [
  {
    files: ['**/*.sql'],
    languageOptions: { parser: sqlParser },
    rules: {
      // core rules work against the SQL AST:
      'no-restricted-syntax': [
        'error',
        { selector: 'SelectStatement', message: 'raw SELECT is banned' },
      ],
    },
  },
];
```

Lint a file:

```bash
npx eslint "src/**/*.sql"
```

## Writing rules

Rules traverse the SQL AST via `visitorKeys`. Statement node types:

`SelectStatement`, `InsertStatement`, `UpdateStatement`, `DeleteStatement`,
`CreateTableStatement`, `DropTableStatement`.

Expression node types:

`Literal`, `Identifier`, `ColumnRef`, `Star`, `BinaryExpression`, `LogicalExpression`,
`UnaryExpression`, `InExpression`, `BetweenExpression`, `LikeExpression`,
`IsNullExpression`, `FunctionCall`, `CaseExpression`, `ParenExpression`.

Example rule that flags `SELECT *`:

```js
export default {
  meta: { type: 'problem', messages: { noStar: 'Avoid SELECT *' } },
  create(context) {
    return {
      SelectItem(node) {
        if (node.expr.type === 'Star') {
          context.report({ node, messageId: 'noStar' });
        }
      },
    };
  },
};
```

## API

- `parseForESLint(code, options)` — ESLint parser entry point.
- `parse(code)` — returns `{ body, tokens, comments }`.
- `tokenize(code)` — returns tokens and comments.
- `ParseError` — thrown on syntax errors, carries `lineNumber`, `column`, `index`.

## Development

```bash
npm install
npm test        # vitest — tokenizer, parser, ESLint integration
npm run lint    # eslint (typescript-eslint strict)
npm run typecheck
npm run build   # emits dist/ (ESM + .d.ts)
```
