import { describe, expect, it } from 'vitest';
import { tokenize } from '../src';

describe('tokenizer', () => {
  it('tokenizes a simple SELECT statement', () => {
    const { tokens, comments } = tokenize('SELECT id FROM users');
    expect(tokens.map((t) => [t.type, t.value])).toEqual([
      ['keyword', 'SELECT'],
      ['identifier', 'id'],
      ['keyword', 'FROM'],
      ['identifier', 'users'],
    ]);
    expect(comments).toEqual([]);
  });

  it('distinguishes keywords case-insensitively but preserves case', () => {
    const { tokens } = tokenize('select Id from USERS');
    expect(tokens[0]).toMatchObject({ type: 'keyword', value: 'select' });
    expect(tokens[1]).toMatchObject({ type: 'identifier', value: 'Id' });
    expect(tokens[3]).toMatchObject({ type: 'identifier', value: 'USERS' });
  });

  it('tracks line and column positions', () => {
    const { tokens } = tokenize('SELECT id\nFROM users');
    expect(tokens[1]).toMatchObject({
      value: 'id',
      range: [7, 9],
      loc: { start: { line: 1, column: 7 }, end: { line: 1, column: 9 } },
    });
    expect(tokens[3]).toMatchObject({
      value: 'users',
      loc: { start: { line: 2, column: 5 }, end: { line: 2, column: 10 } },
    });
  });

  it('tokenizes string literals with escaped quotes', () => {
    const { tokens } = tokenize("SELECT 'it''s' AS label");
    expect(tokens[1]).toMatchObject({ type: 'string', value: "it's" });
    expect(tokens[1]!.range).toEqual([7, 14]);
  });

  it('tokenizes numbers including decimals and exponents', () => {
    const { tokens } = tokenize('SELECT 42, 3.14, 1e-3');
    expect(tokens.map((t) => [t.type, t.value])).toEqual([
      ['keyword', 'SELECT'],
      ['number', '42'],
      ['punctuator', ','],
      ['number', '3.14'],
      ['punctuator', ','],
      ['number', '1e-3'],
    ]);
  });

  it('tokenizes quoted and backtick identifiers', () => {
    const { tokens } = tokenize('SELECT "order", `weird col` FROM t');
    expect(tokens[1]).toMatchObject({ type: 'identifier', value: 'order' });
    expect(tokens[3]).toMatchObject({ type: 'identifier', value: 'weird col' });
  });

  it('tokenizes multi-char operators', () => {
    const { tokens } = tokenize('WHERE a <> b AND c <= d AND e >= f AND g != h');
    const ops = tokens.filter((t) => t.type === 'operator').map((t) => t.value);
    expect(ops).toEqual(['<>', '<=', '>=', '!=']);
  });

  it('collects line and block comments', () => {
    const { tokens, comments } = tokenize('SELECT 1 -- inline\n/* block */ FROM t');
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({ type: 'Line', value: '-- inline' });
    expect(comments[1]).toMatchObject({ type: 'Block', value: '/* block */' });
    expect(tokens).toHaveLength(4);
  });

  it('throws on unterminated string literal', () => {
    expect(() => tokenize("SELECT 'oops")).toThrow(/Unterminated string literal/);
  });

  it('throws on unexpected character', () => {
    expect(() => tokenize('SELECT @')).toThrow(/Unexpected character/);
  });
});
