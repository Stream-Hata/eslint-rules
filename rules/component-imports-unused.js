'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_OPTIONS = {
	decorators: ['Component', 'Directive', 'Pipe', 'NgModule'],
	checkUnusedInArrays: ['imports'],
	templateUsage: true,
	codeUsage: true,
	cleanEmptyArrays: true,
	emptyArrays: ['imports', 'providers', 'schemas', 'exports', 'declarations', 'bootstrap'],
	// Пайпы используются в шаблоне по имени пайпа, а не по имени класса.
	// Чтобы правило не удаляло рабочие пайпы, укажите их явно: 'DecimalPipe': ['number', 'decimal']
	pipeNames: {},
	// Консервативный режим для пайпов без записи в pipeNames: не удалять.
	conservativePipes: true,
	// Сортировать элементы массивов после очистки.
	sortArrays: ['imports'],
	// Группировать по происхождению модуля: angular / external / local.
	importGroups: true,
};

const pascalToKebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const pascalToCamel = (name) => name.charAt(0).toLowerCase() + name.slice(1);

const MODULE_TEMPLATE_FORMS = {
	CommonModule: [
		'ngIf',
		'ngFor',
		'ngClass',
		'ngStyle',
		'ngSwitch',
		'ngSwitchCase',
		'ngSwitchDefault',
		'ngTemplateOutlet',
		'ngComponentOutlet',
		'ngPlural',
		'async',
	],
	FormsModule: ['ngModel', 'ngModelChange', 'ngForm', 'ngModelGroup', 'ngFormOptions'],
	ReactiveFormsModule: [
		'formControl',
		'formControlName',
		'formGroup',
		'formGroupName',
		'formArrayName',
	],
};

const templateForms = (name, pipeNames) => {
	const forms = [name, pascalToKebab(name), pascalToCamel(name)];

	if (MODULE_TEMPLATE_FORMS[name]) {
		forms.push(...MODULE_TEMPLATE_FORMS[name]);
	}

	if (name.endsWith('Directive')) {
		const base = name.slice(0, -'Directive'.length);
		forms.push(pascalToCamel(base), pascalToKebab(base), base);
	}

	if (name.endsWith('Pipe') && pipeNames[name]) {
		forms.push(...pipeNames[name]);
	}

	// Taiga-таблицы: импорт TuiTableTh, а в шаблоне атрибут tuiTh.
	if (name.startsWith('TuiTable') && name.length > 'TuiTable'.length) {
		const suffix = name.slice('TuiTable'.length);
		forms.push(`tui${suffix}`, `tui-${suffix.toLowerCase()}`);
	}

	return forms;
};

module.exports = {
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: {
			description: 'Removes unused entries from decorator arrays (imports, providers, etc.) and drops empty arrays from decorator metadata.',
		},
		messages: {
			unusedArrayEntry: 'Symbol "{{name}}" in the {{array}} array of the {{decorator}} decorator is not used and can be removed.',
			emptyArray: 'Empty {{array}} array in the {{decorator}} decorator can be removed.',
			sorted: 'Entries of the {{array}} array in the {{decorator}} decorator should be sorted and grouped.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					decorators: { type: 'array', items: { type: 'string' } },
					checkUnusedInArrays: { type: 'array', items: { type: 'string' } },
					templateUsage: { type: 'boolean' },
					codeUsage: { type: 'boolean' },
					cleanEmptyArrays: { type: 'boolean' },
					emptyArrays: { type: 'array', items: { type: 'string' } },
					pipeNames: {
						type: 'object',
						additionalProperties: { type: 'array', items: { type: 'string' } },
					},
					conservativePipes: { type: 'boolean' },
					sortArrays: { type: 'array', items: { type: 'string' } },
					importGroups: { type: 'boolean' },
				},
				additionalProperties: false,
			},
		],
	},
	create(context) {
		const options = { ...DEFAULT_OPTIONS, ...(context.options[0] ?? {}) };
		const sourceCode = context.sourceCode ?? context.getSourceCode();
		const filename = context.filename ?? context.getFilename();

		const isUnusedInCode = (name, arrayNode, fileText) => {
			let rest = fileText.slice(0, arrayNode.range[0]) + fileText.slice(arrayNode.range[1]);

			for (const stmt of sourceCode.ast.body) {
				if (stmt.type === 'ImportDeclaration') {
					rest = rest.replace(sourceCode.getText(stmt), '');
				}
			}

			return !rest.includes(name);
		};

		const getTemplateText = (objectExpression) => {
			let templateText = '';

			const templateProp = objectExpression.properties.find(
				(p) => p.type === 'Property' && !p.computed && p.key.type === 'Identifier' && p.key.name === 'template',
			);

			if (templateProp) {
				if (templateProp.value.type === 'Literal' && typeof templateProp.value.value === 'string') {
					templateText = templateProp.value.value;
				} else if (templateProp.value.type === 'TemplateLiteral') {
					templateText = templateProp.value.quasis.map((q) => q.value.cooked).join('');
				}
			}

			const templateUrlProp = objectExpression.properties.find(
				(p) => p.type === 'Property' && !p.computed && p.key.type === 'Identifier' && p.key.name === 'templateUrl',
			);

			if (templateUrlProp && templateUrlProp.value.type === 'Literal' && typeof templateUrlProp.value.value === 'string') {
				try {
					const target = path.resolve(path.dirname(filename), templateUrlProp.value.value);
					if (fs.existsSync(target)) {
						templateText += fs.readFileSync(target, 'utf-8');
					}
				} catch {
					// ignore unresolvable template files
				}
			}

			return templateText;
		};

		const removeProperty = (fixer, props, prop) => {
			const index = props.indexOf(prop);
			const prev = props[index - 1];
			const next = props[index + 1];

			if (next) {
				return fixer.removeRange([prop.range[0], next.range[0]]);
			}
			if (prev) {
				return fixer.removeRange([prev.range[1], prop.range[1]]);
			}
			return fixer.removeRange([prop.range[0], prop.range[1]]);
		};

		const getImportSources = () => {
			const sources = new Map();

			for (const stmt of sourceCode.ast.body) {
				if (stmt.type !== 'ImportDeclaration' || !stmt.source || stmt.source.type !== 'Literal') continue;

				for (const spec of stmt.specifiers ?? []) {
					if (spec.type === 'ImportSpecifier' && spec.local?.name) {
						sources.set(spec.local.name, String(stmt.source.value));
					}
				}
			}

			return sources;
		};

		const groupOf = (source, hasGroups) => {
			if (!hasGroups) return 0;
			if (/^@angular\//.test(source) || source === '@angular/core' || /^@ngrx\//.test(source)) return 0;
			if (source.startsWith('./') || source.startsWith('../')) return 2;
			return 1;
		};

		const isSorted = (names, sources, hasGroups) => {
			for (let i = 1; i < names.length; i++) {
				const prevSource = sources.get(names[i - 1]) ?? '';
				const currSource = sources.get(names[i]) ?? '';
				const prevGroup = groupOf(prevSource, hasGroups);
				const currGroup = groupOf(currSource, hasGroups);

				if (currGroup < prevGroup) return false;
				if (currGroup === prevGroup && names[i] < names[i - 1]) return false;
			}

			return true;
		};

		const sortedArrayText = (elements, sources, hasGroups) => {
			return elements
				.slice()
				.sort((a, b) => {
					const aSource = sources.get(a) ?? '';
					const bSource = sources.get(b) ?? '';
					const aGroup = groupOf(aSource, hasGroups);
					const bGroup = groupOf(bSource, hasGroups);

					return aGroup - bGroup || a.localeCompare(b);
				})
				.join(', ');
		};

		return {
			Decorator(node) {
				if (!node.expression || node.expression.type !== 'CallExpression') return;
				const callee = node.expression.callee;
				if (!callee || callee.type !== 'Identifier' || !options.decorators.includes(callee.name)) return;

				const [arg] = node.expression.arguments;
				if (!arg || arg.type !== 'ObjectExpression') return;

				const fileText = sourceCode.getText();
				const templateText = options.templateUsage ? getTemplateText(arg) : '';
				const sources = getImportSources();

				for (const prop of arg.properties) {
					if (prop.type !== 'Property' || prop.computed || prop.key.type !== 'Identifier') continue;

					const arrayName = prop.key.name;
					if (prop.value.type !== 'ArrayExpression') continue;

					if (options.checkUnusedInArrays.includes(arrayName)) {
						const arrayNode = prop.value;

						arrayNode.elements.forEach((element, index) => {
							if (!element || element.type !== 'Identifier') return;

							const name = element.name;

							const usedInTemplate = Boolean(templateText)
								&& templateForms(name, options.pipeNames).some((form) => templateText.includes(form));
							const usedInCode = options.codeUsage ? !isUnusedInCode(name, arrayNode, fileText) : true;

							const isPipe = name.endsWith('Pipe');
							const conservativePipe = isPipe && options.conservativePipes && !options.pipeNames[name];

							if (conservativePipe || usedInTemplate || usedInCode) return;

							context.report({
								node: element,
								messageId: 'unusedArrayEntry',
								data: { name, array: arrayName, decorator: callee.name },
								fix(fixer) {
									const prev = arrayNode.elements[index - 1];
									const next = arrayNode.elements[index + 1];

									if (next) {
										return fixer.removeRange([element.range[0], next.range[0]]);
									}
									if (prev) {
										return fixer.removeRange([prev.range[1], element.range[1]]);
									}
									return fixer.removeRange([element.range[0], element.range[1]]);
								},
							});
						});
					}

					if (options.cleanEmptyArrays && options.emptyArrays.includes(arrayName) && prop.value.elements.length === 0) {
						context.report({
							node: prop,
							messageId: 'emptyArray',
							data: { array: arrayName, decorator: callee.name },
							fix: (fixer) => removeProperty(fixer, arg.properties, prop),
						});
					}

					if (options.sortArrays.includes(arrayName) && prop.value.elements.length > 1) {
						const names = prop.value.elements.map((el) => (el.type === 'Identifier' ? el.name : null));
						const hasGroups = options.importGroups;

						if (names.every((n) => n !== null) && !isSorted(names, sources, hasGroups)) {
							const sorted = sortedArrayText(names, sources, hasGroups);

							context.report({
								node: prop.value,
								messageId: 'sorted',
								data: { array: arrayName, decorator: callee.name },
								fix: (fixer) => fixer.replaceText(prop.value, `[${sorted}]`),
							});
						}
					}
				}
			},
		};
	},
};