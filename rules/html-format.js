'use strict';

const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

const HTML_ATTRS = new Set([
	// global
	'accesskey',
	'autocapitalize',
	'autofocus',
	'class',
	'contenteditable',
	'dir',
	'draggable',
	'enterkeyhint',
	'exportparts',
	'hidden',
	'id',
	'inert',
	'inputmode',
	'is',
	'itemid',
	'itemprop',
	'itemref',
	'itemscope',
	'itemtype',
	'lang',
	'nonce',
	'part',
	'popover',
	'slot',
	'spellcheck',
	'style',
	'tabindex',
	'title',
	'translate',
	// element-specific
	'accept',
	'accept-charset',
	'action',
	'align',
	'alt',
	'async',
	'autocomplete',
	'autoplay',
	'bgcolor',
	'border',
	'capture',
	'challenge',
	'charset',
	'checked',
	'cite',
	'color',
	'cols',
	'colspan',
	'content',
	'controls',
	'coords',
	'crossorigin',
	'csp',
	'data',
	'datetime',
	'decoding',
	'default',
	'defer',
	'disabled',
	'download',
	'enctype',
	'for',
	'form',
	'formaction',
	'formenctype',
	'formmethod',
	'formnovalidate',
	'formtarget',
	'headers',
	'height',
	'high',
	'href',
	'hreflang',
	'http-equiv',
	'integrity',
	'kind',
	'label',
	'list',
	'loading',
	'loop',
	'low',
	'max',
	'maxlength',
	'media',
	'method',
	'min',
	'minlength',
	'multiple',
	'muted',
	'name',
	'novalidate',
	'open',
	'optimum',
	'pattern',
	'ping',
	'placeholder',
	'playsinline',
	'poster',
	'preload',
	'readonly',
	'referrerpolicy',
	'rel',
	'required',
	'reversed',
	'role',
	'rows',
	'rowspan',
	'sandbox',
	'scope',
	'scoped',
	'selected',
	'shape',
	'size',
	'sizes',
	'span',
	'src',
	'srcdoc',
	'srclang',
	'srcset',
	'start',
	'step',
	'summary',
	'target',
	'type',
	'usemap',
	'value',
	'width',
	'wrap',
]);

const DEFAULT_OPTIONS = {
	indent: 2,
	attributeIndent: 2,
	multilineAttributes: 'auto', // 'always' | 'auto' | 'never'
	maxAttributeLineLength: 100,
	collapseBlankLines: true,
	trimTrailingWhitespace: true,
	mergeFlagAttributes: false,
	sortAttributes: true,
};

const opensAngularBlock = (trimmed) => {
	return (
		/^@(?:if|for|switch|else)\b[^{]*\{\s*$/.test(trimmed)
		|| /^\}\s*@else\b[^{]*\{\s*$/.test(trimmed)
	);
};

const findTagEnd = (text) => {
	let inDq = false;
	let inSq = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];

		if (ch === '"' && !inSq) {
			inDq = !inDq;
		} else if (ch === "'" && !inDq) {
			inSq = !inSq;
		} else if (ch === '>' && !inDq && !inSq) {
			return i;
		}
	}

	return -1;
};

const parseTag = (tagText) => {
	const match = tagText.match(/^<([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)>$/);

	if (!match) return null;

	const name = match[1];
	const attrs = [];
	let rest = match[2].trim();

	while (rest) {
		const nameMatch = rest.match(/^([^\s=]+)/);

		if (!nameMatch) break;

		const attrName = nameMatch[1];
		rest = rest.slice(nameMatch[0].length).trim();
		let value = null;

		if (rest.startsWith('=')) {
			rest = rest.slice(1).trim();

			if (rest.startsWith('"')) {
				const end = rest.indexOf('"', 1);
				value = rest.slice(1, end);
				rest = rest.slice(end + 1).trim();
			} else if (rest.startsWith("'")) {
				const end = rest.indexOf("'", 1);
				value = rest.slice(1, end);
				rest = rest.slice(end + 1).trim();
			} else {
				const valueMatch = rest.match(/^([^\s]+)/);
				value = valueMatch?.[0] ?? '';
				rest = rest.slice(value.length).trim();
			}
		}

		attrs.push(value === null ? attrName : `${attrName}="${value}"`);
	}

	return { name, attrs, selfClosing: /\/\s*>$/.test(tagText) };
};

const isAngularBinding = (attr) => {
	const name = attr.split('=')[0].trim();

	return (
		/^\[/.test(name)
		|| /^\(/.test(name)
		|| /^\*/.test(name)
		|| /^#/.test(name)
		|| /^@/.test(name)
		|| /^let-/.test(name)
	);
};

const attrGroup = (attr) => {
	const name = attr.split('=')[0].trim();

	if (isAngularBinding(name)) return 2;
	if (HTML_ATTRS.has(name) || name.startsWith('aria-') || name.startsWith('data-')) return 1;

	return 3;
};

const sortAttributes = (attrs) => {
	return attrs.slice().sort((a, b) => attrGroup(a) - attrGroup(b));
};

const groupFlagAttributes = (attrs) => {
	const lines = [];
	let group = [];

	const flush = () => {
		if (group.length) {
			lines.push(group.join(' '));
			group = [];
		}
	};

	for (const attr of attrs) {
		if (!attr.includes('=')) {
			group.push(attr);
		} else {
			flush();
			lines.push(attr);
		}
	}
	flush();

	return lines;
};

const toMultilineTag = (tag, indentUnit, tail, options) => {
	const open = `<${tag.name}`;
	const close = tag.selfClosing ? '/>' : `>${tail}`;
	let attrs = tag.attrs.slice();

	if (options.sortAttributes) attrs = sortAttributes(attrs);
	if (options.mergeFlagAttributes) attrs = groupFlagAttributes(attrs);

	return [open, ...attrs.map((attr) => `${indentUnit}${attr}`), close].join('\n');
};

module.exports = {
	meta: {
		type: 'layout',
		fixable: 'whitespace',
		docs: {
			description: 'Normalizes Angular template formatting: configurable indentation, attribute wrapping and alignment, no trailing whitespace, no consecutive blank lines.',
		},
		messages: {
			indent: 'Expected indentation of {{expected}} spaces, found {{actual}}.',
			attributeIndent: 'Expected attribute indentation of {{expected}} spaces, found {{actual}}.',
			wrapped: 'Attributes of tag "{{name}}" should be wrapped.',
			attrLine: 'Attributes on the same line as the opening tag "{{name}}" should be wrapped.',
			tagEnd: 'Tag end should be merged with the closing tag "{{name}}".',
			attrGroup: 'Attributes should be grouped and ordered: HTML attributes, then Angular bindings, then the rest.',
			trailing: 'Trailing whitespace is not allowed.',
			blankLine: 'Consecutive blank lines are not allowed.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					indent: { anyOf: [{ type: 'number', minimum: 0 }, { const: 'tab' }] },
					attributeIndent: { anyOf: [{ type: 'number', minimum: 0 }, { const: 'tab' }] },
					multilineAttributes: { enum: ['always', 'auto', 'never'] },
					maxAttributeLineLength: { type: 'number', minimum: 1 },
					collapseBlankLines: { type: 'boolean' },
					trimTrailingWhitespace: { type: 'boolean' },
					mergeFlagAttributes: { type: 'boolean' },
					sortAttributes: { type: 'boolean' },
				},
				additionalProperties: false,
			},
		],
	},
	create(context) {
		const options = { ...DEFAULT_OPTIONS, ...(context.options[0] ?? {}) };
		const sourceCode = context.sourceCode ?? context.getSourceCode();
		const fullText = sourceCode.getText();
		const lines = fullText.split('\n');
		const lineCount = lines.length;

		const problems = [];

		let depth = 0;
		let prevBlank = false;
		let multilineTagDepth = null;
		let multilineAttrs = null;
		let multilineComplex = false;
		let multilineStartLine = 0;
		let tagEndLine = null;

		const lineStart = (line) => {
			const offset = lines.slice(0, line - 1).reduce((acc, l) => acc + l.length + 1, 0);
			return Math.min(offset, fullText.length);
		};

		const indentUnit = options.indent === 'tab' ? '\t' : ' '.repeat(options.indent);
		const attrIndentUnit = options.attributeIndent === 'tab' ? '\t' : ' '.repeat(options.attributeIndent);
		const indentSize = options.indent === 'tab' ? 1 : options.indent;
		const attrIndentSize = options.attributeIndent === 'tab' ? 1 : options.attributeIndent;

		const indentWidth = (text) => {
			const match = text.match(/^[ \t]*/)[0];

			if (options.indent === 'tab') return (match.match(/\t/g) ?? []).length;

			return match.replace(/\t/g, ' '.repeat(options.indent)).length;
		};

		const wrongIndent = (match) => (options.indent === 'tab' ? / /.test(match) : match.includes('\t'));

		lines.forEach((raw, idx) => {
			const lineNo = idx + 1;
			const trimmed = raw.trim();
			const indentMatch = raw.match(/^[ \t]*/)[0];
			const actualIndent = indentWidth(raw);
			const hasWrongIndent = wrongIndent(indentMatch);
			const hasTrailing = /[ \t]+$/.test(raw);

			if (trimmed === '') {
				if (options.collapseBlankLines && prevBlank) {
					problems.push({ line: lineNo, column: 1, messageId: 'blankLine', removeLine: true });
				} else if (options.trimTrailingWhitespace && hasTrailing) {
					problems.push({ line: lineNo, column: 1, messageId: 'trailing', removeTrailing: true });
				}
				prevBlank = true;
				return;
			}
			prevBlank = false;

			if (multilineTagDepth !== null && /^>/.test(trimmed) && !/^>\s*$/.test(trimmed)) {
				multilineComplex = true;
			}

			const startsClosingTag = /^<\//.test(trimmed);
			const startsBlockClose = /^\}/.test(trimmed);
			const endsMultilineTag = /^>/.test(trimmed)
				|| (multilineTagDepth !== null && /^[^<]*>\s*$/.test(trimmed) && !trimmed.includes('{'));
			const startsMultilineTag = /^<[a-zA-Z][a-zA-Z0-9-]*(\s[^>]*)?$/.test(trimmed) && !trimmed.includes('>');
			const tagEnd = findTagEnd(trimmed);
			const tagTail = tagEnd >= 0 ? trimmed.slice(tagEnd + 1) : '';
			const wrapTag = tagEnd >= 0
				&& /^<[a-zA-Z]/.test(trimmed)
				&& !trimmed.startsWith('</')
				&& (tagTail === '' || /^([^<]*)<\/[a-zA-Z][a-zA-Z0-9-]*>$/.test(tagTail));

			const tagBase = multilineTagDepth;

			if (startsClosingTag || startsBlockClose || endsMultilineTag) {
				depth = Math.max(0, depth - 1);
			}

			if (endsMultilineTag) {
				// Строка `>` (или последний атрибут с `>`): отступ = уровень тега.
				// Если тег НЕ закрыт в этой же строке (`</tag>` отсутствует),
				// контент тега остаётся на один уровень глубже.
				if (tagBase !== null && !/<\/[a-zA-Z]/.test(trimmed)) {
					depth = tagBase + 1;
				}

				if (multilineComplex && multilineStartLine > 0) {
					for (let i = problems.length - 1; i >= 0; i--) {
						if (problems[i].line >= multilineStartLine && problems[i].line <= lineNo) problems.splice(i, 1);
					}
				}
				multilineTagDepth = null;

				if (!multilineComplex && multilineAttrs && (options.sortAttributes || options.mergeFlagAttributes)) {
					let attrs = multilineAttrs.map((a) => a.text);
					let changed = false;

					if (options.sortAttributes) {
						const sorted = sortAttributes(attrs);

						if (sorted.join('\n') !== attrs.join('\n')) {
							attrs = sorted;
							changed = true;
						}
					}

					if (options.mergeFlagAttributes) {
						const merged = groupFlagAttributes(attrs);

						if (merged.join('\n') !== attrs.join('\n')) {
							attrs = merged;
							changed = true;
						}
					}

					if (changed) {
						const first = multilineAttrs[0].line;
						const last = multilineAttrs[multilineAttrs.length - 1].line;
						const attrIndent = ' '.repeat((tagBase ?? 0) * options.indent + options.attributeIndent);

						problems.push({
							line: first,
							column: 1,
							messageId: 'attrGroup',
							groupFrom: first,
							groupTo: last,
							groupText: attrs.map((a) => `${attrIndent}${a}`).join('\n'),
						});
					}
				}

				multilineAttrs = null;
				multilineComplex = false;
				multilineStartLine = 0;
			}

			if (trimmed === '>' && tagBase !== null && idx + 1 < lineCount) {
				let nextIdx = idx + 1;

				while (nextIdx < lineCount && lines[nextIdx].trim() === '') {
					nextIdx++;
				}

				const nextMatch = lines[nextIdx]?.trim().match(/^<\/([a-zA-Z][a-zA-Z0-9-]*)/);

				if (nextMatch) {
					tagEndLine = lineNo;
					problems.push({
						line: lineNo,
						column: 1,
						messageId: 'tagEnd',
						name: nextMatch[1],
						replaceLine: `${indentUnit.repeat(tagBase)}></${nextMatch[1]}>`,
						removeEndLine: nextIdx + 1,
					});
				}
			}

			if (multilineTagDepth !== null && !endsMultilineTag) {
				const expectedAttrIndent = multilineTagDepth * indentSize + attrIndentSize;

				if (multilineAttrs && !trimmed.startsWith('<')) {
					multilineAttrs.push({ line: lineNo, text: trimmed });
				}

				if (actualIndent !== expectedAttrIndent || hasWrongIndent) {
					problems.push({
						line: lineNo,
						column: 1,
						messageId: 'attributeIndent',
						expected: expectedAttrIndent,
						actual: actualIndent,
						fixIndent: true,
					});
				}
			}

			const expectedIndent = depth * indentSize;

			if (multilineTagDepth === null && !(endsMultilineTag && tagBase !== null) && tagEndLine !== lineNo && (actualIndent !== expectedIndent || hasWrongIndent)) {
				problems.push({
					line: lineNo,
					column: 1,
					messageId: 'indent',
					expected: expectedIndent,
					actual: actualIndent,
					fixIndent: true,
				});
			}

			if (tagBase !== null && endsMultilineTag && !startsClosingTag && tagEndLine !== lineNo) {
				const isTagClose = /^>/.test(trimmed) || /<\/[a-zA-Z]/.test(trimmed);
				const expectedTagIndent = isTagClose
					? tagBase * indentSize
					: tagBase * indentSize + attrIndentSize;

				if (actualIndent !== expectedTagIndent || hasWrongIndent) {
					problems.push({
						line: lineNo,
						column: 1,
						messageId: 'indent',
						expected: expectedTagIndent,
						actual: actualIndent,
						fixIndent: true,
					});
				}
			}

			if (options.trimTrailingWhitespace && hasTrailing) {
				problems.push({ line: lineNo, column: raw.length, messageId: 'trailing', removeTrailing: true });
			}

			if (startsMultilineTag) {
				multilineTagDepth = depth;
				multilineAttrs = [];
				multilineComplex = false;
				multilineStartLine = lineNo;
				depth++;
			}

			if (startsMultilineTag && /\s/.test(trimmed) && options.multilineAttributes !== 'never') {
				const name = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/)?.[1];
				const rest = trimmed.replace(/^<[a-zA-Z][a-zA-Z0-9-]*/, '').trim();
				const parsed = rest ? parseTag(`<${name} ${rest}>`) : null;

				if (name && parsed && parsed.attrs.length > 0) {
					const attrUnit = attrIndentUnit;
					let attrs = parsed.attrs.slice();

					if (options.sortAttributes) attrs = sortAttributes(attrs);
					if (options.mergeFlagAttributes) attrs = groupFlagAttributes(attrs);

					const replacement = [`<${name}`, ...attrs.map((attr) => `${indentMatch}${attrUnit}${attr}`)].join('\n');

					problems.push({
						line: lineNo,
						column: 1,
						messageId: 'attrLine',
						name,
						replaceLine: replacement,
					});
				}
			}

			if (wrapTag && options.multilineAttributes !== 'never') {
				const parsed = parseTag(trimmed.slice(0, tagEnd + 1));

				if (parsed && parsed.attrs.length > 0) {
					const shouldWrap = options.multilineAttributes === 'always'
						|| raw.length > options.maxAttributeLineLength;

					if (shouldWrap) {
						const attrUnit = attrIndentUnit;
						const replacement = `${indentMatch}${toMultilineTag(parsed, attrUnit, tagTail, options)}`;

						problems.push({
							line: lineNo,
							column: 1,
							messageId: 'wrapped',
							name: parsed.name,
							replaceLine: replacement,
						});
					}
				}
			}

			if (!endsMultilineTag && !startsClosingTag) {
				const tags = trimmed.match(/<[^>]*>/g) || [];
				let openCount = 0;
				let closeCount = 0;

				for (const tag of tags) {
					if (tag.startsWith('</')) {
						closeCount++;
						continue;
					}

					const name = tag.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/)?.[1]?.toLowerCase();

					if (name && !VOID_ELEMENTS.has(name) && !/\/\s*>$/.test(tag)) {
						openCount++;
					}
				}

				depth = Math.max(0, depth + openCount - closeCount);
			}

			if (opensAngularBlock(trimmed)) {
				depth++;
			}
		});

		for (const problem of problems) {
			const start = lineStart(problem.line);
			const end = Math.min(start + (lines[problem.line - 1]?.length ?? 0), fullText.length);

			context.report({
				loc: { line: problem.line, column: problem.column },
				messageId: problem.messageId,
				data: problem.messageId === 'indent'
					? { expected: problem.expected, actual: problem.actual }
					: problem.messageId === 'attributeIndent'
						? { expected: problem.expected, actual: problem.actual }
						: problem.messageId === 'wrapped' || problem.messageId === 'attrLine' || problem.messageId === 'tagEnd'
							? { name: problem.name }
							: undefined,
				fix(fixer) {
					if (problem.removeLine) {
						if (lineCount === 1) {
							return fixer.removeRange([0, end]);
						}
						const isLast = problem.line === lineCount;
						const removeEnd = isLast ? end : end + 1;
						return fixer.removeRange([start, removeEnd]);
					}

					if (problem.replaceLine !== undefined) {
						if (problem.removeEndLine !== undefined) {
							const ns = lineStart(problem.removeEndLine);
							const rawNext = lines[problem.removeEndLine - 1];
							const ne = Math.min(ns + (rawNext?.length ?? 0), fullText.length);

							return fixer.replaceTextRange([start, ne], problem.replaceLine);
						}

						return fixer.replaceTextRange([start, end], problem.replaceLine);
					}

					if (problem.groupFrom !== undefined) {
						const gs = lineStart(problem.groupFrom);
						const rawLast = lines[problem.groupTo - 1];
						const ge = Math.min(lineStart(problem.groupTo) + (rawLast?.length ?? 0), fullText.length);

						return fixer.replaceTextRange([gs, ge], problem.groupText);
					}

					const raw = lines[problem.line - 1];
					const indent = problem.fixIndent ? ' '.repeat(problem.expected) : raw.match(/^[ \t]*/)[0];
					const newLine = `${indent}${raw.trim()}`;

					return fixer.replaceTextRange([start, end], newLine);
				},
			});
		}

		return {};
	},
};