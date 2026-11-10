const { format } = require('sql-formatter');
const { checkSql, looksLikeSql } = require('../plugins/sql-parser');

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
					tags: { type: 'array', items: { type: 'string' } },
					strings: { type: 'boolean' },
				},
				additionalProperties: false,
			},
		],
	},
	create(context) {
		const options = context.options[0] || {};
		const tags = Array.isArray(options.tags) ? options.tags.map((tag) => tag.toLowerCase()) : ['sql'];
		const sourceCode = context.sourceCode;

		function checkSqlText(sql, startOffset) {
			if (sql.trim().length === 0) {
				return;
			}
			const formatted =
				options.indent === true
					? format(sql, {
							language: 'postgresql',
							tabWidth: 2,
							useTabs: true,
							keywordCases: 'preserve',
							linesBetweenQueries: 1,
						})
					: null;

			const { issues } = checkSql(sql, formatted, options);
			for (const issue of issues) {
				const globalStart = startOffset + issue.offset;
				const globalEnd = globalStart + Math.max(issue.length, 1);
				const report = {
					loc: {
						start: sourceCode.getLocFromIndex(globalStart),
						end: sourceCode.getLocFromIndex(globalEnd),
					},
					message: issue.message,
				};
				if (issue.fixText !== null) {
					report.fix = (fixer) =>
						fixer.replaceTextRange([globalStart, globalStart + issue.length], issue.fixText);
				}
				context.report(report);
			}
		}

		function isSqlTagged(node) {
			const parent = node.parent;
			if (parent === null || parent === undefined) {
				return false;
			}
			if (parent.type !== 'TaggedTemplateExpression') {
				return false;
			}
			const tag = parent.tag;
			if (tag.type !== 'Identifier') {
				return false;
			}
			return tags.includes(tag.name.toLowerCase());
		}

		return {
			TemplateLiteral(node) {
				if (node.expressions.length > 0) {
					return;
				}
				const start = node.range[0] + 1;
				const end = node.range[1] - 1;
				if (end <= start) {
					return;
				}
				const sql = sourceCode.getText().slice(start, end);
				if (!isSqlTagged(node) && !looksLikeSql(sql)) {
					return;
				}
				checkSqlText(sql, start);
			},
			Literal(node) {
				if (options.strings !== true || typeof node.value !== 'string') {
					return;
				}
				const start = node.range[0] + 1;
				const end = node.range[1] - 1;
				if (end <= start) {
					return;
				}
				const sql = sourceCode.getText().slice(start, end);
				if (!looksLikeSql(sql)) {
					return;
				}
				checkSqlText(sql, start);
			},
		};
	},
};