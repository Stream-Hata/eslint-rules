import { describe, expect, it } from 'vitest';
import type {
  AlterTableStatementNode,
  CreateTableStatementNode,
  DeleteStatementNode,
  ExpressionNode,
  InsertStatementNode,
  SelectStatementNode,
  StatementNode,
  UpdateStatementNode,
} from '../src';
import { parse } from '../src';
import { ParseError } from '../src';

function firstStatement<T extends StatementNode = StatementNode>(code: string): T {
  const { body } = parse(code);
  expect(body).toHaveLength(1);
  return body[0] as T;
}

describe('parser — SELECT', () => {
  it('parses a basic select with star', () => {
    const stmt = firstStatement<SelectStatementNode>('SELECT * FROM users');
    expect(stmt).toMatchObject({ type: 'SelectStatement', distinct: false });
    expect(stmt).toMatchObject({
      columns: [{ type: 'SelectItem', expr: { type: 'Star' } }],
    });
    expect(stmt.from).toMatchObject({
      type: 'FromClause',
      items: [{ type: 'TableRef', name: { name: 'users' }, alias: null, schema: null }],
    });
  });

  it('parses DISTINCT and aliases', () => {
    const stmt = firstStatement<SelectStatementNode>(
      'SELECT DISTINCT u.id AS user_id, u.name name FROM users u',
    );
    expect(stmt.distinct).toBe(true);
    expect(stmt.columns[0]).toMatchObject({
      expr: { type: 'ColumnRef', parts: ['u', 'id'] },
      alias: { name: 'user_id' },
    });
    expect(stmt.columns[1]!.alias).toMatchObject({ name: 'name' });
    expect(stmt.from).toMatchObject({
      items: [{ type: 'TableRef', name: { name: 'users' }, alias: { name: 'u' } }],
    });
  });

  it('parses schema-qualified table names', () => {
    const stmt = firstStatement<SelectStatementNode>('SELECT * FROM public.accounts');
    expect(stmt.from).toMatchObject({
      items: [{ type: 'TableRef', schema: { name: 'public' }, name: { name: 'accounts' } }],
    });
  });

  it('parses joins', () => {
    const stmt = firstStatement<SelectStatementNode>(
      'SELECT * FROM users u INNER JOIN orders o ON u.id = o.user_id LEFT OUTER JOIN items i ON i.oid = o.id',
    );
    const items = stmt.from!.items;
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({
      type: 'JoinClause',
      kind: 'INNER',
      table: { name: { name: 'orders' } },
      on: { type: 'BinaryExpression', operator: '=' },
    });
    expect(items[2]).toMatchObject({
      type: 'JoinClause',
      kind: 'LEFT',
      on: { type: 'BinaryExpression' },
    });
  });

  it('parses WHERE with logical and comparison operators', () => {
    const stmt = firstStatement<SelectStatementNode>(
      "SELECT id FROM t WHERE age >= 18 AND (country = 'RU' OR flag <> 0)",
    );
    expect(stmt.where).toMatchObject({
      type: 'LogicalExpression',
      operator: 'AND',
      left: { type: 'BinaryExpression', operator: '>=' },
      right: { type: 'ParenExpression' },
    });
  });

  it('parses IN, BETWEEN, LIKE, IS NULL', () => {
    const stmt = firstStatement<SelectStatementNode>(
      "SELECT * FROM t WHERE id IN (1, 2, 3) AND score BETWEEN 10 AND 20 AND name LIKE 'a%' AND deleted IS NULL",
    );
    const andOperands: string[] = [];
    const collect = (node: { type: string; left?: unknown; right?: unknown }): void => {
      if (
        node.type === 'LogicalExpression' &&
        node.left !== undefined &&
        node.right !== undefined
      ) {
        collect(node.left as { type: string; left?: unknown; right?: unknown });
        collect(node.right as { type: string; left?: unknown; right?: unknown });
        return;
      }
      andOperands.push(node.type);
    };
    collect(stmt.where!);
    expect(andOperands).toEqual([
      'InExpression',
      'BetweenExpression',
      'LikeExpression',
      'IsNullExpression',
    ]);
    expect(stmt.where).toMatchObject({
      type: 'LogicalExpression',
      operator: 'AND',
    });
  });

  it('parses NOT IN and IS NOT NULL', () => {
    const stmt = firstStatement<SelectStatementNode>(
      'SELECT * FROM t WHERE id NOT IN (1) AND x IS NOT NULL',
    );
    expect(stmt.where).toMatchObject({ left: { type: 'InExpression', not: true } });
    const right = (stmt.where as { right: ExpressionNode }).right;
    expect(right).toMatchObject({ type: 'IsNullExpression', not: true });
  });

  it('parses GROUP BY, HAVING, ORDER BY, LIMIT with OFFSET', () => {
    const stmt = firstStatement<SelectStatementNode>(
      'SELECT dept, COUNT(*) FROM emp GROUP BY dept HAVING COUNT(*) > 5 ORDER BY dept DESC LIMIT 10 OFFSET 2',
    );
    expect(stmt.groupBy).toHaveLength(1);
    expect(stmt.having).toMatchObject({ type: 'BinaryExpression', operator: '>' });
    expect(stmt.orderBy[0]).toMatchObject({ direction: 'DESC' });
    expect(stmt.limit).toMatchObject({
      limit: { type: 'Literal', value: 10 },
      offset: { type: 'Literal', value: 2 },
    });
  });

  it('parses MySQL-style LIMIT offset, count', () => {
    const stmt = firstStatement<SelectStatementNode>('SELECT * FROM t LIMIT 5, 10');
    expect(stmt.limit).toMatchObject({
      limit: { type: 'Literal', value: 10 },
      offset: { type: 'Literal', value: 5 },
    });
  });

  it('parses function calls including COUNT(DISTINCT x) and COUNT(*)', () => {
    const stmt = firstStatement<SelectStatementNode>(
      'SELECT COUNT(*), COUNT(DISTINCT id), LOWER(name) FROM t',
    );
    expect(stmt.columns[0]!.expr).toMatchObject({
      type: 'FunctionCall',
      name: 'COUNT',
      distinct: false,
      args: { type: 'Star' },
    });
    expect(stmt.columns[1]!.expr).toMatchObject({
      type: 'FunctionCall',
      name: 'COUNT',
      distinct: true,
    });
    expect(stmt.columns[2]!.expr).toMatchObject({ type: 'FunctionCall', name: 'LOWER' });
  });

  it('parses CASE expressions', () => {
    const stmt = firstStatement<SelectStatementNode>(
      "SELECT CASE WHEN score >= 90 THEN 'A' WHEN score >= 80 THEN 'B' ELSE 'C' END AS grade FROM t",
    );
    expect(stmt.columns[0]!.expr).toMatchObject({
      type: 'CaseExpression',
      operand: null,
      whenClauses: [
        { when: { type: 'BinaryExpression' }, then: { type: 'Literal' } },
        { when: { type: 'BinaryExpression' }, then: { type: 'Literal' } },
      ],
      elseClause: { type: 'Literal', value: 'C' },
    });
  });

  it('parses IN with a subquery', () => {
    const stmt = firstStatement<SelectStatementNode>(
      'SELECT * FROM a WHERE id IN (SELECT id FROM b)',
    );
    expect(stmt.where).toMatchObject({
      type: 'InExpression',
      list: { type: 'SelectStatement' },
    });
  });

  it('parses arithmetic expressions with precedence', () => {
    const stmt = firstStatement<SelectStatementNode>('SELECT 1 + 2 * 3 AS n FROM t');
    expect(stmt.columns[0]!.expr).toMatchObject({
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Literal', value: 1 },
      right: { type: 'BinaryExpression', operator: '*', left: { value: 2 }, right: { value: 3 } },
    });
  });

  it('parses NOT as unary', () => {
    const stmt = firstStatement<SelectStatementNode>('SELECT * FROM t WHERE NOT active');
    expect(stmt.where).toMatchObject({
      type: 'UnaryExpression',
      operator: 'NOT',
      argument: { type: 'ColumnRef', parts: ['active'] },
    });
  });
});

describe('parser — DML statements', () => {
  it('parses INSERT with columns and multiple rows', () => {
    const stmt = firstStatement<InsertStatementNode>(
      "INSERT INTO users (id, name) VALUES (1, 'a'), (2, 'b')",
    );
    expect(stmt).toMatchObject({
      type: 'InsertStatement',
      table: { name: { name: 'users' } },
      columns: [{ name: 'id' }, { name: 'name' }],
      rows: [
        {
          type: 'RowValue',
          items: [
            { type: 'Literal', value: 1 },
            { type: 'Literal', value: 'a' },
          ],
        },
        {
          type: 'RowValue',
          items: [
            { type: 'Literal', value: 2 },
            { type: 'Literal', value: 'b' },
          ],
        },
      ],
    });
  });

  it('parses UPDATE with SET and WHERE', () => {
    const stmt = firstStatement<UpdateStatementNode>(
      "UPDATE users SET name = 'x', age = age + 1 WHERE id = 1",
    );
    expect(stmt).toMatchObject({
      type: 'UpdateStatement',
      table: { name: { name: 'users' } },
      set: [
        { column: { name: 'name' }, value: { type: 'Literal' } },
        { column: { name: 'age' }, value: { type: 'BinaryExpression' } },
      ],
      where: { type: 'BinaryExpression', operator: '=' },
    });
  });

  it('parses DELETE', () => {
    const stmt = firstStatement<DeleteStatementNode>('DELETE FROM logs WHERE ts < NOW()');
    expect(stmt).toMatchObject({
      type: 'DeleteStatement',
      table: { name: { name: 'logs' } },
      where: { type: 'BinaryExpression', operator: '<' },
    });
  });
});

describe('parser — DDL statements', () => {
  it('parses CREATE TABLE with column types', () => {
    const stmt = firstStatement<CreateTableStatementNode>(
      'CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY, name VARCHAR(255) NOT NULL, created TIMESTAMP DEFAULT NOW())',
    );
    expect(stmt).toMatchObject({
      type: 'CreateTableStatement',
      ifNotExists: true,
      table: { name: { name: 'users' } },
    });
    expect(stmt.columns.map((c) => [c.name.name, c.dataType])).toEqual([
      ['id', 'INT PRIMARY KEY'],
      ['name', 'VARCHAR(255) NOT NULL'],
      ['created', 'TIMESTAMP DEFAULT NOW()'],
    ]);
  });

  it('parses DROP TABLE', () => {
    const stmt = firstStatement('DROP TABLE IF EXISTS old_users');
    expect(stmt).toMatchObject({
      type: 'DropTableStatement',
      ifExists: true,
      table: { name: { name: 'old_users' } },
    });
  });

  it('parses ALTER TABLE ... ALTER COLUMN with a new data type', () => {
    const stmt = firstStatement<AlterTableStatementNode>(
      "ALTER TABLE users ALTER COLUMN username varchar(50) NOT NULL DEFAULT ''",
    );
    expect(stmt).toMatchObject({
      type: 'AlterTableStatement',
      table: { name: { name: 'users' } },
      action: 'ALTER COLUMN',
      column: { name: 'username' },
      dataType: "varchar(50) NOT NULL DEFAULT ''",
    });
  });

  it('parses ALTER TABLE ... ADD COLUMN and DROP COLUMN', () => {
    const add = firstStatement<AlterTableStatementNode>('ALTER TABLE t ADD COLUMN x INT');
    expect(add).toMatchObject({ action: 'ADD COLUMN', column: { name: 'x' }, dataType: 'INT' });
    const drop = firstStatement<AlterTableStatementNode>('ALTER TABLE t DROP COLUMN y CASCADE');
    expect(drop).toMatchObject({ action: 'DROP COLUMN', column: { name: 'y' }, dataType: null });
  });

  it('accepts a trailing comma in CREATE TABLE column lists', () => {
    const stmt = firstStatement<CreateTableStatementNode>('CREATE TABLE t (a INT, b VARCHAR(10),)');
    expect(stmt.columns.map((c) => c.name.name)).toEqual(['a', 'b']);
  });
});

describe('parser — multiple statements and errors', () => {
  it('parses multiple statements separated by semicolons', () => {
    const { body } = parse('SELECT 1; SELECT 2;');
    expect(body.map((s) => s.type)).toEqual(['SelectStatement', 'SelectStatement']);
  });

  it('allows comments between statements', () => {
    const { body, comments } = parse('-- first\nSELECT 1;\n/* second */ SELECT 2;');
    expect(body).toHaveLength(2);
    expect(comments).toHaveLength(2);
  });

  it('throws a ParseError with lineNumber and column on syntax error', () => {
    expect(() => parse('SELECT FROM users')).toThrow(ParseError);
    try {
      parse('SELECT FROM users');
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as ParseError;
      expect(e.lineNumber).toBe(1);
      expect(e.column).toBeGreaterThan(0);
      expect(e.message).toMatch(/FROM/);
    }
  });

  it('throws on unterminated statement', () => {
    expect(() => parse('SELECT * FROM')).toThrow(ParseError);
  });

  it('throws on an empty CASE', () => {
    expect(() => parse('SELECT CASE END FROM t')).toThrow(ParseError);
  });
});

describe('parser — ranges and locations', () => {
  it('produces ranges that slice back to the source', () => {
    const code = 'SELECT id FROM users WHERE id = 5';
    const { body } = parse(code);
    const where = (body[0] as SelectStatementNode).where!;
    expect(code.slice(where.range[0], where.range[1])).toBe('id = 5');
    expect(where.loc.start.line).toBe(1);
  });

  it('Program covers the full source', () => {
    const code = 'SELECT 1;\nSELECT 2;';
    const ast = parse(code);
    expect(ast.range).toEqual([0, code.length]);
  });
});
