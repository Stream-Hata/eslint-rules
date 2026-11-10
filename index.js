'use strict';

module.exports = {
	rules: {
		'component-imports-unused': require('./rules/component-imports-unused'),
		'html-format': require('./rules/html-format'),
		'no-output-to-input': require('./rules/no-output-to-input'),
		'no-signal-misuse': require('./rules/no-signal-misuse'),
		'sql-format': require('./rules/sql-format'),
		'sql-indent': require('./rules/sql-indent'),
		'sql-in-ts': require('./rules/sql-in-ts'),
		'sql-rules': require('./rules/sql-rules'),
	},
	parsers: {
		sql: require('./plugins/sql-parser/dist'),
	},
};
