/**
 * Starsector CSV Parser
 *
 * Starsector CSV files have specific conventions:
 * - First row is headers
 * - Fields may contain quoted strings with commas inside
 * - Some fields use "" for literal quotes
 * - Comment rows start with #
 * - Empty rows are allowed
 */

interface CSVRow {
  [key: string]: any;
  _lineIndex?: number;
  _empty?: boolean;
  _comment?: string;
}

interface ParsedCSV {
  headers: string[];
  rows: CSVRow[];
}

/**
 * Parse a CSV string into rows of objects
 */
export function parseCSV(text: string): ParsedCSV {
  const lines = splitCSVLines(text);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVRow(lines[0]);
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip empty lines
    if (!line) {
      rows.push({ _empty: true, _lineIndex: i });
      continue;
    }
    // Preserve comment lines
    if (line.startsWith('#')) {
      rows.push({ _comment: line, _lineIndex: i });
      continue;
    }

    const values = parseCSVRow(lines[i]);
    const row: CSVRow = { _lineIndex: i };
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Split CSV text into lines, respecting quoted fields that span multiple lines
 */
function splitCSVLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
      continue;
    }
    if (ch === '\r' && !inQuotes) {
      continue;
    }
    current += ch;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Parse a single CSV row into an array of values
 */
export function parseCSVRow(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ',') {
      values.push(current);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }
  values.push(current);
  return values;
}

/**
 * Serialize parsed CSV back to string
 */
export function serializeCSV(data: ParsedCSV): string {
  const { headers, rows } = data;
  const lines = [headers.join(',')];

  for (const row of rows) {
    if (row._empty) {
      lines.push('');
      continue;
    }
    if (row._comment) {
      lines.push(row._comment);
      continue;
    }
    const values = headers.map((h) => {
      const val = row[h] || '';
      // Quote fields that contain commas, quotes, or newlines
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}


