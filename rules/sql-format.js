const { format } = require('sql-formatter');
module.exports = {
	meta: {
		fixable: 'code',
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

				const src = context.sourceCode;
				const orig =  src.getText()
				const formatted = format(orig, {
					language: 'postgresql',
					tabWidth: 2,
					keywordCases: 'upper',
					linesBetweenQueries: 1,
					...options
				})

				if (orig.trim() !== formatted.trim()) {
					context.report({
						node,
						message: 'SQL file now formatted',
						fix: (fixer) => fixer.replaceTextRange(node.range, formatted)
					})
				}
			}
		}
	}
}
