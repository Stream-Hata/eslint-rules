export interface LineIndentIssue {
  line: number;
  startOffset: number;
  actualIndent: string;
  expectedIndent: string;
}
export interface LineIndentResult {
  issues: LineIndentIssue[];
}
/**
 * Computes the desired leading whitespace for every source line by aligning each
 * line to the canonical (formatted) SQL structure. Only leading whitespace is
 * compared — line breaks and content are never touched.
 */
export declare function computeLineIndents(source: string, formatted: string): LineIndentResult;
