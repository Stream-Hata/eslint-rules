const { format } = require('sql-formatter');
const { checkSql } = require('../plugins/sql-parser');

function locFromOffset(text, offset) {
	let line = 1;
	let column = 0;
	for (let i = 0; i < offset; i += 1) {
		if (text.charAt(i) === '\n') {
			line += 1;
			column = 0;
		} else {
			column += 1;
		}
	}
	return { line, column: column + 1 };
}

module.exports = {
	meta: {
		type: 'problem',
		fixable: 'code',
		schema: [
			{
				type: 'object',
				properties: {
					indent: { type: 'boolean' },
					noSelectStar: { type: 'boolean' },
					requireWhereInDml: { type: 'boolean' },
					uppercaseKeywords: { type: 'boolean' },
					identifierCase: { type: 'string', enum: ['snake_case'] },
					trailingWhitespace: { type: 'boolean' },
				},
				additionalProperties: false,
			},
		],
	},
	create(context) {
		return {
			Program() {
				const options = context.options[0] || {};
				const sourceCode = context.sourceCode;
				const text = sourceCode.getText();
				if (text.trim().length === 0) {
					return;
				}

				const formatted =
					options.indent === true
						? format(text, {
								language: 'postgresql',
								tabWidth: 2,
								useTabs: true,
								keywordCases: 'preserve',
								linesBetweenQueries: 1,
							})
						: null;

				const { issues } = checkSql(text, formatted, options);
				for (const issue of issues) {
					const start = locFromOffset(text, issue.offset);
					const end = locFromOffset(text, issue.offset + Math.max(issue.length, 1));
					const report = {
						loc: { start, end },
						message: issue.message,
					};
					if (issue.fixText !== null) {
						report.fix = (fixer) =>
							fixer.replaceTextRange([issue.offset, issue.offset + issue.length], issue.fixText);
					}
					context.report(report);
				}
			},
		};
	},
};