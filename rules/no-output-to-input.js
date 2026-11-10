'use strict';

const NATIVE_TAGS = [
	'html', 'head', 'body', 'title', 'base', 'link', 'meta', 'style', 'script', 'noscript', 'template', 'slot', 'iframe', 'object', 'param', 'embed',
	'form', 'label', 'input', 'button', 'select', 'option', 'optgroup', 'datalist', 'textarea', 'fieldset', 'legend', 'details', 'summary', 'dialog',
	'table', 'caption', 'colgroup', 'col', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th',
	'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'canvas', 'cite', 'code', 'data', 'dd', 'del', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main', 'map', 'mark', 'menu', 'meter', 'nav', 'ol', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'search', 'section', 'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup', 'time', 'track', 'u', 'ul', 'var', 'video', 'wbr',
	'svg', 'g', 'path', 'rect', 'circle', 'line', 'polygon', 'polyline', 'text', 'tspan', 'defs', 'use', 'mask', 'stop',
];

const DEFAULT_OPTIONS = {
	nativeTags: NATIVE_TAGS,
	ignoreEvents: [],
	ignoreInputs: [],
	ignoreOutputs: [],
};

const EVENT_RE = /^\(([^\[\]]+)\)$/;
const INPUT_RE = /^\[([^\[\]()]+)\]$/;
const SKIP_INPUT_PREFIX = /^(attr|class|style)\./;

const extractWriteTargets = (expr) => {
	const names = new Set();
	let m;

	const setRe = /([a-zA-Z_$][\w$]*)\.(?:set|update)\s*\(/g;

	while ((m = setRe.exec(expr))) {
		names.add(m[1]);
	}

	const assignRe = /(?<![\w$.])([a-zA-Z_$][\w$]*)\s*=\s*\$event/g;

	while ((m = assignRe.exec(expr))) {
		names.add(m[1]);
	}

	const thisAssignRe = /this\.([a-zA-Z_$][\w$]*)\s*=\s*\$event/g;

	while ((m = thisAssignRe.exec(expr))) {
		names.add(m[1]);
	}

	return names;
};

const extractIdentifiers = (expr) => {
	return new Set(expr.match(/[a-zA-Z_$][\w$]*/g) ?? []);
};

const unwrapChain = (node) => {
	let n = node;

	while (n && (n.type === 'ChainExpression' || n.type === 'TSNonNullExpression')) {
		n = n.expression;
	}

	return n;
};

const getOutputName = (base) => {
	const n = unwrapChain(base);

	if (n.type === 'MemberExpression' && n.property?.type === 'Identifier') {
		return n.property.name;
	}

	if (n.type === 'Identifier') return n.name;

	return null;
};

const getWriteTarget = (recv) => {
	const n = unwrapChain(recv);

	if (n.type === 'MemberExpression' && n.property?.type === 'Identifier') {
		return n.property.name;
	}

	return null;
};

const findSignalWrites = (node) => {
	const writes = [];

	const walk = (n) => {
		if (!n || typeof n !== 'object') return;

		if (
			n.type === 'CallExpression'
			&& n.callee?.type === 'MemberExpression'
			&& n.callee.property?.type === 'Identifier'
			&& (n.callee.property.name === 'set' || n.callee.property.name === 'update')
		) {
			const target = getWriteTarget(n.callee.object);

			if (target) writes.push(target);
		}

		if (
			n.type === 'AssignmentExpression'
			&& n.left?.type === 'MemberExpression'
			&& n.left.object?.type === 'ThisExpression'
			&& n.left.property?.type === 'Identifier'
		) {
			writes.push(n.left.property.name);
		}

		for (const key of Object.keys(n)) {
			if (key === 'parent') continue;

			const v = n[key];

			if (Array.isArray(v)) {
				v.forEach(walk);
			} else {
				walk(v);
			}
		}
	};

	walk(node);

	return writes;
};

module.exports = {
	meta: {
		type: 'problem',
		fixable: null,
		docs: {
			description: 'Forbids forwarding @Output values into component @Inputs (templates and subscriptions). Use a shared service/store instead.',
		},
		messages: {
			outputToInput: 'Do not forward the output value into a component input ({{name}}); this couples components through the parent and breaks reactivity. Use a shared service/store instead.',
			modelBridge: 'Do not manually re-implement a model() two-way binding; use [({{inputName}})] instead, or a shared service/store.',
			outputSubscription: 'Do not subscribe to the output "{{output}}" and write its value into a signal/input ({{target}}); use a shared service/store instead.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					nativeTags: { type: 'array', items: { type: 'string' } },
					ignoreEvents: { type: 'array', items: { type: 'string' } },
					ignoreInputs: { type: 'array', items: { type: 'string' } },
					ignoreOutputs: { type: 'array', items: { type: 'string' } },
				},
				additionalProperties: false,
			},
		],
	},
	create(context) {
		const options = { ...DEFAULT_OPTIONS, ...(context.options[0] ?? {}) };
		const nativeTags = new Set(options.nativeTags.map((t) => t.toLowerCase()));
		const ignoreEvents = new Set(options.ignoreEvents);
		const ignoreInputs = new Set(options.ignoreInputs);
		const ignoreOutputs = new Set(options.ignoreOutputs);

		const isNativeTag = (tag) => nativeTags.has(tag.toLowerCase());

		const writeTargets = new Set();
		const reads = [];

		const outputNames = new Set();
		const subscriptions = [];

		return {
			Tag(node) {
				if (!Array.isArray(node.attributes) || isNativeTag(node.name)) return;

				const tagWrites = new Map();
				const tagReads = [];

				for (const attr of node.attributes) {
					const key = attr.key?.value ?? '';
					const expr = attr.value?.value ?? '';

					const eventMatch = key.match(EVENT_RE);

					if (eventMatch && expr) {
						if (!ignoreEvents.has(eventMatch[1])) {
							for (const name of extractWriteTargets(expr)) {
								if (!tagWrites.has(name)) tagWrites.set(name, new Set());

								tagWrites.get(name).add(eventMatch[1]);
							}
						}

						continue;
					}

					const inputMatch = key.match(INPUT_RE);

					if (inputMatch && expr && !ignoreInputs.has(inputMatch[1]) && !SKIP_INPUT_PREFIX.test(inputMatch[1])) {
						for (const name of extractIdentifiers(expr)) {
							tagReads.push({ node: attr, name, inputName: inputMatch[1] });
						}
					}
				}

				for (const read of tagReads) {
					if (tagWrites.has(read.name) && tagWrites.get(read.name).has(`${read.inputName}Change`)) {
						context.report({
							node: read.node,
							messageId: 'modelBridge',
							data: { inputName: read.inputName },
						});
					} else {
						reads.push(read);
					}
				}

				for (const name of tagWrites.keys()) {
					writeTargets.add(name);
				}
			},
			PropertyDefinition(node) {
				if (node.key?.type !== 'Identifier') return;

				const name = node.key.name;
				const hasOutputDecorator = (node.decorators ?? []).some((d) => {
					const e = d.expression;

					return (
						(e?.type === 'Identifier' && e.name === 'Output')
						|| (e?.type === 'CallExpression' && e.callee?.type === 'Identifier' && e.callee.name === 'Output')
					);
				});

				if (hasOutputDecorator) {
					outputNames.add(name);

					return;
				}

				const v = node.value;

				if (
					v?.type === 'CallExpression'
					&& v.callee?.type === 'Identifier'
					&& ['output', 'outputFromObservable', 'model'].includes(v.callee.name)
				) {
					outputNames.add(name);
				}
			},
			CallExpression(node) {
				if (
					node.callee?.type === 'MemberExpression'
					&& node.callee.property?.type === 'Identifier'
					&& node.callee.property.name === 'subscribe'
				) {
					let base = node.callee.object;

					while (
						base?.type === 'CallExpression'
						&& base.callee?.type === 'MemberExpression'
						&& base.callee.property?.type === 'Identifier'
						&& base.callee.property.name === 'pipe'
					) {
						base = base.callee.object;
					}

					const outputName = getOutputName(base);

					if (outputName) {
						subscriptions.push({ node, outputName, callback: node.arguments[0] });
					}
				}
			},
			'Program:exit'() {
				for (const read of reads) {
					if (writeTargets.has(read.name)) {
						context.report({
							node: read.node,
							messageId: 'outputToInput',
							data: { name: read.name },
						});
					}
				}

				for (const sub of subscriptions) {
					if (!outputNames.has(sub.outputName) || ignoreOutputs.has(sub.outputName)) continue;

					const writes = sub.callback ? findSignalWrites(sub.callback) : [];

					if (writes.length) {
						context.report({
							node: sub.node,
							messageId: 'outputSubscription',
							data: { output: sub.outputName, target: [...new Set(writes)].join(', ') },
						});
					}
				}
			},
		};
	},
};