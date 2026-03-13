import { parseCSV, serializeCSV, parseCSVRow } from '../../../electron/services/csvParser';

describe('parseCSVRow', () => {
  it('parses a simple row', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCSVRow('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCSVRow('a,"say ""hello""",c')).toEqual(['a', 'say "hello"', 'c']);
  });

  it('handles empty fields', () => {
    expect(parseCSVRow('a,,c')).toEqual(['a', '', 'c']);
  });

  it('handles trailing comma producing extra empty field', () => {
    expect(parseCSVRow('a,b,')).toEqual(['a', 'b', '']);
  });
});

describe('parseCSV', () => {
  it('parses CSV with headers and rows', () => {
    const csv = 'id,name,description\n1,Ship,"A fast ship"\n2,Weapon,"A big gun"';
    const { headers, rows } = parseCSV(csv);

    expect(headers).toEqual(['id', 'name', 'description']);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('1');
    expect(rows[0].name).toBe('Ship');
    expect(rows[0].description).toBe('A fast ship');
    expect(rows[1].id).toBe('2');
    expect(rows[1].name).toBe('Weapon');
  });

  it('preserves comment rows', () => {
    const csv = 'id,name\n# this is a comment\n1,Ship';
    const { rows } = parseCSV(csv);

    expect(rows[0]._comment).toBe('# this is a comment');
    expect(rows[1].id).toBe('1');
  });

  it('preserves empty rows', () => {
    const csv = 'id,name\n\n1,Ship';
    const { rows } = parseCSV(csv);

    expect(rows[0]._empty).toBe(true);
    expect(rows[1].id).toBe('1');
  });

  it('handles empty CSV', () => {
    const { headers, rows } = parseCSV('');
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });

  it('handles CSV with only headers', () => {
    const { headers, rows } = parseCSV('id,name');
    expect(headers).toEqual(['id', 'name']);
    expect(rows).toEqual([]);
  });
});

describe('serializeCSV', () => {
  it('serializes headers and rows back to CSV', () => {
    const data = {
      headers: ['id', 'name'],
      rows: [
        { id: '1', name: 'Ship', _lineIndex: 1 },
        { id: '2', name: 'Weapon', _lineIndex: 2 },
      ],
    };
    expect(serializeCSV(data)).toBe('id,name\n1,Ship\n2,Weapon');
  });

  it('quotes fields containing commas', () => {
    const data = {
      headers: ['id', 'description'],
      rows: [
        { id: '1', description: 'fast, deadly', _lineIndex: 1 },
      ],
    };
    expect(serializeCSV(data)).toBe('id,description\n1,"fast, deadly"');
  });

  it('preserves comment and empty rows', () => {
    const data = {
      headers: ['id'],
      rows: [
        { _comment: '# A comment', _lineIndex: 1 },
        { _empty: true, _lineIndex: 2 },
        { id: '1', _lineIndex: 3 },
      ],
    };
    expect(serializeCSV(data)).toBe('id\n# A comment\n\n1');
  });

  it('roundtrips parse then serialize', () => {
    const original = 'id,name,desc\n1,Ship,"Fast, deadly"\n# comment\n\n2,Gun,Big';
    const parsed = parseCSV(original);
    const serialized = serializeCSV(parsed);
    expect(serialized).toBe(original);
  });
});
