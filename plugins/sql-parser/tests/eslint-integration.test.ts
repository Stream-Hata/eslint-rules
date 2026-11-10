import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import sqlParser from '../src/index.js';

const OPTIONS = { filename: 'test.sql' };

function makeLinter(): Linter {
  return new Linter({ configType: 'flat' });
}

function sqlConfig(extra?: Record<string, unknown>): Record<string, unknown>[] {
  return [
    {
      files: ['**/*.sql'],
      languageOptions: { parser: sqlParser },
      rules: {},
      ...extra,
    },
  ];
}

describe('eslint integration', () => {
  it('lints a .sql file using the custom parser without parse errors', () => {
    const linter = makeLinter();
    const messages = linter.verify('SELECT id FROM users WHERE age >= 18', sqlConfig(), OPTIONS);
    expect(messages).toEqual([]);
  });

  it('reports parser errors with correct location', () => {
    const linter = makeLinter();
    const messages = linter.verify('SELECT FROM users', sqlConfig(), OPTIONS);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      fatal: true,
      ruleId: null,
      line: 1,
      column: 8,
      message: expect.stringContaining('FROM'),
    });
  });

  it('lets rules visit SQL AST nodes', () => {
    const linter = makeLinter();
    const seen: string[] = [];
    const visits: string[] = [];
    const rule = {
      create() {
        return {
          SelectStatement(node: { type: string }) {
            seen.push(node.type);
          },
          FunctionCall(node: { name: string }) {
            visits.push(node.name);
          },
        };
      },
    };
    const config = sqlConfig({
      plugins: {
        'sql-test': { rules: { visit: rule }, meta: { name: 'sql-test', version: '1.0.0' } },
      },
      rules: { 'sql-test/visit': 'error' },
    });
    const messages = linter.verify('SELECT COUNT(*) FROM users', config, OPTIONS);
    expect(messages).toEqual([]);
    expect(seen).toContain('SelectStatement');
    expect(visits).toContain('COUNT');
  });

  it('reports parser errors at the correct line across multiple lines', () => {
    const linter = makeLinter();
    const messages = linter.verify('SELECT *\nFROM t\nWHERE x = ', sqlConfig(), OPTIONS);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.line).toBe(3);
  });

  it('applies the SQL parser only to files matching the pattern', () => {
    const linter = makeLinter();
    const messages = linter.verify(
      'SELECT id FROM users',
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: sqlParser },
          rules: {},
        },
      ],
      { filename: 'test.ts' },
    );
    expect(messages).toEqual([]);
  });

  it('exposes the AST through sourceCode for rule authors', () => {
    const linter = makeLinter();
    let programType: string | null = null;
    const rule = {
      create(context: { sourceCode: { ast: { type: string } } }) {
        return {
          Program(node: { type: string }) {
            programType = context.sourceCode.ast.type;
            void node;
          },
        };
      },
    };
    const config = sqlConfig({
      plugins: {
        'sql-test': { rules: { probe: rule }, meta: { name: 'sql-test', version: '1.0.0' } },
      },
      rules: { 'sql-test/probe': 'error' },
    });
    const messages = linter.verify('SELECT 1', config, OPTIONS);
    expect(messages).toEqual([]);
    expect(programType).toBe('Program');
  });
});
