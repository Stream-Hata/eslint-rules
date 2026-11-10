export interface LineIndentIssue {
	line: number;
	startOffset: number;
	actualIndent: string;
	expectedIndent: string;
}

export interface LineIndentResult {
	issues: LineIndentIssue[];
}

function leadingWhitespace(line: string): string {
	const match = /^[ \t]*/.exec(line);
	if (match === null) {
		return '';
	}
	return match[0];
}

function firstToken(line: string): string | null {
	const match = /^[ \t]*(\S+)/.exec(line);
	if (match === null) {
		return null;
	}
	return match[1] ?? null;
}

/**
 * Computes the desired leading whitespace for every source line by aligning each
 * line to the canonical (formatted) SQL structure. Only leading whitespace is
 * compared — line breaks and content are never touched.
 */
export function computeLineIndents(source: string, formatted: string): LineIndentResult {
	const sourceLines = source.split('\n');
	const formattedLines = formatted.split('\n');
	const issues: LineIndentIssue[] = [];
	let formattedIndex = 0;
	let offset = 0;

	for (let index = 0; index < sourceLines.length; index += 1) {
		const line = sourceLines[index] ?? '';
		const lineLength = line.length;
		if (line.trim().length === 0) {
			offset += lineLength + 1;
			continue;
		}

		const token = firstToken(line);
		while (
			formattedIndex < formattedLines.length &&
			firstToken(formattedLines[formattedIndex] ?? '') !== token
		) {
			formattedIndex += 1;
		}
		if (formattedIndex >= formattedLines.length) {
			offset += lineLength + 1;
			continue;
		}

		const expectedIndent = leadingWhitespace(formattedLines[formattedIndex] ?? '');
		const actualIndent = leadingWhitespace(line);
		if (actualIndent !== expectedIndent) {
			issues.push({
				line: index + 1,
				startOffset: offset,
				actualIndent,
				expectedIndent,
			});
		}
		formattedIndex += 1;
		offset += lineLength + 1;
	}

	return { issues };
}
