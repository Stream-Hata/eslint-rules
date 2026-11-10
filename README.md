# @stream-hata/eslint-rules

[![codecov](https://codecov.io/gh/Stream-Hata/eslint-rules/branch/main/graph/badge.svg)](https://codecov.io/gh/Stream-Hata/eslint-rules)

Custom ESLint rules and the SQL parser shared by StreamHata projects.

The package is CommonJS and targets ESLint 9 flat config.

## Install

The package is not published to npm yet. Install it directly from GitHub:

```bash
pnpm add -D github:Stream-Hata/eslint-rules
```

Or pin a commit:

```bash
pnpm add -D github:Stream-Hata/eslint-rules#affe671
```

## Usage

```js
const streamHata = require('@stream-hata/eslint-rules');
const htmlFormat = require('@stream-hata/eslint-rules/rules/html-format');
const sqlParser = require('@stream-hata/eslint-rules/sql-parser');

module.exports = [
	{
		files: ['**/*.html'],
		plugins: {
			'stream-hata': {
				rules: {
					'html-format': htmlFormat,
				},
			},
		},
		rules: {
			'stream-hata/html-format': [
				'error',
				{
					indent: 2,
					attributeIndent: 2,
					multilineAttributes: 'auto',
					maxAttributeLineLength: 100,
					sortAttributes: true,
				},
			],
		},
	},
	{
		files: ['**/*.sql'],
		languageOptions: {
			parser: sqlParser,
		},
		rules: {
			'stream-hata/sql-rules': [
				'error',
				{
					noSelectStar: true,
					requireWhereInDml: true,
					uppercaseKeywords: true,
					identifierCase: 'snake_case',
				},
			],
		},
	},
];
```

`streamHata.rules` contains all rules keyed without the `stream-hata/` prefix.
`streamHata.parsers.sql` is the SQL parser.

## Rules

### `stream-hata/component-imports-unused`

Removes unused entries from Angular decorator arrays and drops empty arrays.

Options:

- `decorators` — decorators to inspect, default `Component`, `Directive`, `Pipe`, `NgModule`;
- `checkUnusedInArrays` — arrays to check, default `imports`;
- `templateUsage` — consider template usage, default `true`;
- `codeUsage` — consider usage in component code, default `true`;
- `cleanEmptyArrays` — remove empty arrays, default `true`;
- `emptyArrays` — arrays that may be removed when empty;
- `pipeNames` — map pipe class names to template pipe names;
- `conservativePipes` — keep pipes that cannot be matched safely;
- `sortArrays` — arrays that must be sorted;
- `importGroups` — keep import groups separated.

### `stream-hata/html-format`

Formats Angular templates: indentation, attribute wrapping/alignment, trailing spaces,
blank lines and optional attribute sorting.

Options:

- `indent` — number of spaces or `"tab"`, default `2`;
- `attributeIndent` — number of spaces or `"tab"`, default `2`;
- `multilineAttributes` — `"always"`, `"auto"` or `"never"`, default `"auto"`;
- `maxAttributeLineLength` — wrap threshold, default `100`;
- `collapseBlankLines` — default `true`;
- `trimTrailingWhitespace` — default `true`;
- `mergeFlagAttributes` — default `false`;
- `sortAttributes` — default `true`.

The rule skips complex multi-line Angular expressions to avoid corrupting templates.

### `stream-hata/no-output-to-input`

Forbids forwarding `@Output` values into component inputs and manual model bridges.

Use instead:

```html
<app-child [(value)]="value" />
```

or a shared service/store.

Options:

- `nativeTags` — tags treated as native;
- `ignoreEvents` — event names to ignore;
- `ignoreInputs` — input names to ignore;
- `ignoreOutputs` — output names to ignore.

### `stream-hata/no-signal-misuse`

Forbids:

- `signal(new Subject())` and `signal(of(...))`;
- `toSignal(toObservable(signal))` round-trips;
- piping `$`-suffixed observables into `signal()`.

Options:

- `subjectTypes` — Subject/Observable class names;
- `observableFactories` — known observable factories;
- `flagPipeOnObservables` — flag `.pipe()` on `$`-suffixed observables, default `true`.

### `stream-hata/sql-format`

Formats SQL with `sql-formatter`.

Options: `language`, `tabWidth`, `useTabs`.

### `stream-hata/sql-indent`

Checks SQL indentation.

Options: `language`, `tabWidth`, `useTabs`.

### `stream-hata/sql-rules`

SQL lint rules:

- `noSelectStar`;
- `requireWhereInDml`;
- `uppercaseKeywords`;
- `identifierCase` (`snake_case`);
- `trailingWhitespace`.

### `stream-hata/sql-in-ts`

Runs SQL rules for template literals in TypeScript.

Options: same as `stream-hata/sql-rules`, plus:

- `tags` — tagged template names, default `sql`;
- `strings` — also check plain strings.

## SQL parser

`@stream-hata/eslint-rules/sql-parser` provides:

- `parseForESLint(code, options)`;
- `parse(code)`;
- `tokenize(code)`;
- `ParseError`.

It produces an ESTree-compatible AST with `range`/`loc` and supports `SELECT`, `INSERT`,
`UPDATE`, `DELETE`, `CREATE TABLE`, `DROP TABLE`, joins, subqueries and common expressions.

See `plugins/sql-parser/README.md` for the full parser documentation.

## Development

The rule files are plain CommonJS. The SQL parser ships compiled `dist/` output and
TypeScript sources under `plugins/sql-parser/`.

```bash
cd plugins/sql-parser
npm run build
npm test
```

## License

MIT
