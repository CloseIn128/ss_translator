/**
 * Tests for the shared diff utilities (diffUtils.js).
 *
 * These tests verify:
 * - parseCsvForDiff: CSV parsing for table diff
 */
import {
  parseCsvForDiff,
} from '../../../src/components/diff/diffUtils';

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

  it('handles multiline quoted fields', () => {
    const csv = 'name,desc\nfoo,"line1\nline2"\nbar,baz';
    const result = parseCsvForDiff(csv);
    expect(result.headers).toEqual(['name', 'desc']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['foo', 'line1\nline2']);
    expect(result.rows[1]).toEqual(['bar', 'baz']);
  });

  it('does not produce phantom row from trailing newline', () => {
    const csv = 'name,value\nfoo,bar\n';
    const result = parseCsvForDiff(csv);
    expect(result.headers).toEqual(['name', 'value']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(['foo', 'bar']);
  });
});
