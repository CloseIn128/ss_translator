/**
 * Parse CSV text into rows and detect headers.
 * Stateful parser: handles quoted fields with commas and embedded newlines.
 */
export function parseCsvForDiff(text: string): { headers: string[]; rows: string[][] } {
  if (!text || !text.trim()) return { headers: [], rows: [] };

  const normalized = normalizeEndings(text);
  const rows: string[][] = [];
  let fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < normalized.length && normalized[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else if (ch === '\n') {
        fields.push(current);
        rows.push(fields);
        fields = [];
        current = '';
      } else {
        current += ch;
      }
    }
  }

  // Flush the last field/row if there is remaining data
  if (current.length > 0 || fields.length > 0) {
    fields.push(current);
    rows.push(fields);
  }

  if (rows.length === 0) return { headers: [], rows: [] };
  return { headers: rows[0], rows: rows.slice(1) };
}

function normalizeEndings(text: string): string {
  return (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
