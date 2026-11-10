'use strict';

const DEFAULT_OPTIONS = {
	subjectTypes: ['Subject', 'BehaviorSubject', 'ReplaySubject', 'AsyncSubject', 'Observable'],
	observableFactories: ['of', 'from', 'merge', 'combineLatest', 'forkJoin', 'concat', 'zip', 'race', 'interval', 'timer', 'defer', 'iif', 'throwError', 'empty', 'never', 'EMPTY', 'NEVER'],
	flagPipeOnObservables: true,
};

const unwrap = (node) => {
	let n = node;

	while (n && ['TSAsExpression', 'TSNonNullExpression', 'TSTypeAssertion', 'TSSatisfiesExpression'].includes(n.type)) {
		n = n.expression;
	}

	return n;
};

module.exports = {
	meta: {
		type: 'problem',
		fixable: null,
		docs: {
			description: 'Forbids Angular signal misuse: passing Subjects/Observables into signal() and pointless signal -> observable -> signal round-trips.',
		},
		messages: {
			subjectInSignal: 'Do not initialize signal() with a {{type}}; pass a plain value or convert the stream with toSignal().',
			observableInSignal: 'Do not pass an observable ({{what}}) into signal(); signal() expects a plain value, not a stream.',
			signalRoundTrip: 'Do not wrap toObservable(signal) into toSignal(); this converts a signal to an observable and back. Use the signal directly.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					subjectTypes: { type: 'array', items: { type: 'string' } },
					observableFactories: { type: 'array', items: { type: 'string' } },
					flagPipeOnObservables: { type: 'boolean' },
				},
				additionalProperties: false,
			},
		],
	},
	create(context) {
		const options = { ...DEFAULT_OPTIONS, ...(context.options[0] ?? {}) };

		const isCallTo = (node, name) => {
			return node?.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === name;
		};

		const describeObservable = (node) => {
			const n = unwrap(node);

			if (!n) return null;

			if (n.type === 'NewExpression' && n.callee?.type === 'Identifier') {
				return options.subjectTypes.includes(n.callee.name) ? { kind: 'subject', what: n.callee.name } : null;
			}

			if (n.type === 'CallExpression') {
				if (n.callee.type === 'Identifier') {
					if (options.observableFactories.includes(n.callee.name)) {
						return { kind: 'observable', what: `${n.callee.name}(...)` };
					}
					if (options.subjectTypes.includes(n.callee.name)) {
						return { kind: 'subject', what: n.callee.name };
					}
				}

				if (n.callee.type === 'MemberExpression') {
					const prop = n.callee.property;

					if (prop?.type === 'Identifier' && prop.name === 'asObservable') {
						return { kind: 'observable', what: 'asObservable()' };
					}

					if (options.flagPipeOnObservables && prop?.type === 'Identifier' && prop.name === 'pipe') {
						const object = n.callee.object;

						if (object?.type === 'Identifier' && object.name.endsWith('$')) {
							return { kind: 'observable', what: `${object.name}.pipe(...)` };
						}
					}
				}
			}

			if (n.type === 'Identifier' && (n.name === 'EMPTY' || n.name === 'NEVER')) {
				return { kind: 'observable', what: n.name };
			}

			return null;
		};

		return {
			CallExpression(node) {
				if (isCallTo(node, 'signal')) {
					const [arg] = node.arguments;
					const desc = arg ? describeObservable(arg) : null;

					if (desc) {
						context.report({
							node,
							messageId: desc.kind === 'subject' ? 'subjectInSignal' : 'observableInSignal',
							data: { type: desc.what, what: desc.what },
						});
					}
				}

				if (isCallTo(node, 'toSignal')) {
					const [arg] = node.arguments;

					if (arg && isCallTo(unwrap(arg), 'toObservable')) {
						context.report({
							node,
							messageId: 'signalRoundTrip',
						});
					}
				}
			},
		};
	},
};
