export interface Position {
  line: number;
  column: number;
}
export interface SourceLocation {
  start: Position;
  end: Position;
}
export type TokenType = 'keyword' | 'identifier' | 'string' | 'number' | 'operator' | 'punctuator';
export interface Token {
  type: TokenType;
  value: string;
  range: [number, number];
  loc: SourceLocation;
}
export interface CommentToken {
  type: 'Line' | 'Block';
  value: string;
  range: [number, number];
  loc: SourceLocation;
}
export interface TokenizeResult {
  tokens: Token[];
  comments: CommentToken[];
}
export declare class TokenizeError extends Error {
  readonly loc: Position;
  constructor(message: string, loc: Position);
}
export declare function tokenize(code: string): TokenizeResult;
