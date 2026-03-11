/**
 * Tests for the shared diff utilities (diffUtils.js).
 *
 * These tests verify:
 * - computeAlignedDiff: side-by-side diff with proper alignment
 * - collapseDiffRows: context collapsing
 * - parseCsvForDiff: CSV parsing for table diff
 * - stripJsonComments: relaxed JSON comment stripping
 * - tokenizeJson: JSON syntax highlighting tokenization
 */
import {
  computeAlignedDiff,
  collapseDiffRows,
  parseCsvForDiff,
  stripJsonComments,
  tokenizeJson,
  CONTEXT_LINES,
} from '../../../src/components/diff/diffUtils.js';

describe('computeAlignedDiff', () => {
  it('returns same lines for identical text', () => {
    const text = 'line1\nline2\nline3';
    const result = computeAlignedDiff(text, text);
    expect(result).toHaveLength(3);
    result.forEach((row, i) => {
      expect(row.type).toBe('same');
      expect(row.left).toBe(`line${i + 1}`);
      expect(row.right).toBe(`line${i + 1}`);
      expect(row.leftNum).toBe(i + 1);
      expect(row.rightNum).toBe(i + 1);
    });
  });

  it('aligns removed and added lines side-by-side as modified', () => {
    const original = 'hello\nworld';
    const translated = 'hello\n世界';
    const result = computeAlignedDiff(original, translated);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('same');
    expect(result[1].type).toBe('modified');
    expect(result[1].left).toBe('world');
    expect(result[1].right).toBe('世界');
    expect(result[1].leftNum).toBe(2);
    expect(result[1].rightNum).toBe(2);
  });

  it('handles added lines', () => {
    const original = 'line1';
    const translated = 'line1\nline2';
    const result = computeAlignedDiff(original, translated);
    expect(result.some(r => r.type === 'added')).toBe(true);
    const addedRow = result.find(r => r.type === 'added');
    expect(addedRow.right).toBe('line2');
  });

  it('handles removed lines', () => {
    const original = 'line1\nline2';
    const translated = 'line1';
    const result = computeAlignedDiff(original, translated);
    expect(result.some(r => r.type === 'removed')).toBe(true);
    const removedRow = result.find(r => r.type === 'removed');
    expect(removedRow.left).toBe('line2');
  });

  it('handles empty input', () => {
    const result = computeAlignedDiff('', '');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('same');
  });

  it('normalizes CRLF to LF', () => {
    const original = 'line1\r\nline2';
    const translated = 'line1\nline2';
    const result = computeAlignedDiff(original, translated);
    expect(result).toHaveLength(2);
    result.forEach(r => expect(r.type).toBe('same'));
  });
});

describe('collapseDiffRows', () => {
  it('collapses unchanged sections', () => {
    const rows = [];
    // 10 same lines, then 1 modified, then 10 same lines
    for (let i = 0; i < 10; i++) {
      rows.push({ type: 'same', left: `line${i}`, right: `line${i}`, leftNum: i + 1, rightNum: i + 1 });
    }
    rows.push({ type: 'modified', left: 'old', right: 'new', leftNum: 11, rightNum: 11 });
    for (let i = 11; i < 21; i++) {
      rows.push({ type: 'same', left: `line${i}`, right: `line${i}`, leftNum: i + 1, rightNum: i + 1 });
    }

    const collapsed = collapseDiffRows(rows);
    // Should have collapse sections and context lines around the change
    const collapseEntries = collapsed.filter(r => r.type === 'collapse');
    expect(collapseEntries.length).toBeGreaterThan(0);
    expect(collapsed.some(r => r.type === 'modified')).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(collapseDiffRows([])).toEqual([]);
  });

  it('does not collapse when all lines are changed', () => {
    const rows = [
      { type: 'modified', left: 'a', right: 'b', leftNum: 1, rightNum: 1 },
      { type: 'modified', left: 'c', right: 'd', leftNum: 2, rightNum: 2 },
    ];
    const collapsed = collapseDiffRows(rows);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.every(r => r.type === 'modified')).toBe(true);
  });
});

describe('parseCsvForDiff', () => {
  it('parses simple CSV', () => {
    const csv = 'name,value\nfoo,bar\nbaz,qux';
    const result = parseCsvForDiff(csv);
    expect(result.headers).toEqual(['name', 'value']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['foo', 'bar']);
    expect(result.rows[1]).toEqual(['baz', 'qux']);
  });

  it('handles quoted fields', () => {
    const csv = 'name,desc\nfoo,"hello, world"\nbar,"say ""hi"""';
    const result = parseCsvForDiff(csv);
    expect(result.rows[0][1]).toBe('hello, world');
    expect(result.rows[1][1]).toBe('say "hi"');
  });

  it('returns empty for empty input', () => {
    const result = parseCsvForDiff('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });
});

describe('stripJsonComments', () => {
  it('strips line comments', () => {
    const input = '{\n  "key": "value" // comment\n}';
    const result = stripJsonComments(input);
    expect(result).toContain('"key": "value"');
    expect(result).not.toContain('comment');
  });

  it('strips block comments', () => {
    const input = '{ /* block comment */ "key": "value" }';
    const result = stripJsonComments(input);
    expect(result).toContain('"key": "value"');
    expect(result).not.toContain('block comment');
  });

  it('strips hash comments', () => {
    const input = '{\n  # hash comment\n  "key": "value"\n}';
    const result = stripJsonComments(input);
    expect(result).not.toContain('hash comment');
  });

  it('preserves comments inside strings', () => {
    const input = '{"key": "value // not a comment"}';
    const result = stripJsonComments(input);
    expect(result).toContain('// not a comment');
  });
});

describe('tokenizeJson', () => {
  it('tokenizes JSON with strings and numbers', () => {
    const input = '{"key": 42}';
    const tokens = tokenizeJson(input);
    const types = tokens.map(t => t.type).filter(t => t !== 'text');
    expect(types).toContain('brace');
    expect(types).toContain('string');
    expect(types).toContain('number');
  });

  it('tokenizes booleans and null', () => {
    const input = '{"a": true, "b": false, "c": null}';
    const tokens = tokenizeJson(input);
    const types = tokens.map(t => t.type);
    expect(types).toContain('boolean');
    expect(types).toContain('null');
  });

  it('tokenizes comments', () => {
    const input = '// line comment\n{"key": "value"}';
    const tokens = tokenizeJson(input);
    expect(tokens.some(t => t.type === 'comment')).toBe(true);
  });

  it('tokenizes unquoted keys (relaxed JSON)', () => {
    const input = '{key: "value"}';
    const tokens = tokenizeJson(input);
    expect(tokens.some(t => t.type === 'key' && t.value === 'key')).toBe(true);
  });
});
