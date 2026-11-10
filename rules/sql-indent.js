const { format } = require('sql-formatter');
const { computeLineIndents } = require('../plugins/sql-parser');

function indentKind(indent) {
	if (indent.length === 0) {
		return 'no indentation';
	}
	return indent.includes('\t') ? 'tabs' : 'spaces';
}

module.exports = {
	meta: {
		type: 'layout',
		fixable: 'code',
		messages: {
			unexpectedIndent:
				'Unexpected indentation: expected {{expected}} but found {{actual}}.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					language: {
						type: 'string',
					},
					tabWidth: {
						type: 'number',
					},
					useTabs: {
						type: 'boolean',
					},
					keywordCases: {
						type: 'string',
						enum: ['preserve', 'upper', 'lower'],
					},
					linesBetweenQueries: {
						type: 'number',
					},
				},
				additionalProperties: false,
			},
		],
	},
	create(context) {
		return {
			Program(node) {
				const options = context.options[0] || {};
				const sourceCode = context.sourceCode;
				const text = sourceCode.getText();
				if (text.trim().length === 0) {
					return;
				}

				const formatted = format(text, {
					language: 'postgresql',
					tabWidth: 2,
					useTabs: true,
					keywordCases: 'preserve',
					linesBetweenQueries: 1,
					...options,
				});

				const { issues } = computeLineIndents(text, formatted);
				for (const issue of issues) {
					context.report({
						node,
						loc: {
							start: { line: issue.line, column: 1 },
							end: { line: issue.line, column: issue.actualIndent.length + 1 },
						},
						messageId: 'unexpectedIndent',
						data: {
							expected: `${issue.expectedIndent.length} ${indentKind(issue.expectedIndent)}`,
							actual: `${issue.actualIndent.length} ${indentKind(issue.actualIndent)}`,
						},
						fix(fixer) {
							return fixer.replaceTextRange(
								[issue.startOffset, issue.startOffset + issue.actualIndent.length],
								issue.expectedIndent,
							);
						},
					});
				}
			},
		};
	},
};