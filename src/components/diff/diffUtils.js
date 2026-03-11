import { diffLines } from 'diff';

/** Number of unchanged context lines to show around each change */
export const CONTEXT_LINES = 3;

/**
 * Compute a side-by-side aligned diff using the `diff` library.
 * Returns an array of rows:
 *   { type: 'same'|'modified'|'removed'|'added', leftNum, rightNum, left, right }
 *
 * 'modified' rows pair a removed line with an added line on the same row.
 */
export function computeAlignedDiff(originalText, translatedText) {
  const orig = normalizeEndings(originalText);
  const trans = normalizeEndings(translatedText);

  if (orig === trans) {
    const lines = orig.split('\n');
    return lines.map((line, i) => ({
      type: 'same', left: line, right: line, leftNum: i + 1, rightNum: i + 1,
    }));
  }

  const changes = diffLines(orig, trans);
  const rows = [];
  let leftNum = 1;
  let rightNum = 1;

  let i = 0;
  while (i < changes.length) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      // Unchanged hunk
      const lines = stripTrailingNewline(change.value).split('\n');
      for (const line of lines) {
        rows.push({ type: 'same', left: line, right: line, leftNum: leftNum++, rightNum: rightNum++ });
      }
      i++;
    } else if (change.removed && i + 1 < changes.length && changes[i + 1].added) {
      // Paired removed+added → align side-by-side as "modified"
      const removedLines = stripTrailingNewline(change.value).split('\n');
      const addedLines = stripTrailingNewline(changes[i + 1].value).split('\n');
      const maxLen = Math.max(removedLines.length, addedLines.length);
      for (let k = 0; k < maxLen; k++) {
        const hasLeft = k < removedLines.length;
        const hasRight = k < addedLines.length;
        if (hasLeft && hasRight) {
          rows.push({
            type: 'modified',
            left: removedLines[k],
            right: addedLines[k],
            leftNum: leftNum++,
            rightNum: rightNum++,
          });
        } else if (hasLeft) {
          rows.push({ type: 'removed', left: removedLines[k], right: '', leftNum: leftNum++, rightNum: null });
        } else {
          rows.push({ type: 'added', left: '', right: addedLines[k], leftNum: null, rightNum: rightNum++ });
        }
      }
      i += 2;
    } else if (change.removed) {
      const lines = stripTrailingNewline(change.value).split('\n');
      for (const line of lines) {
        rows.push({ type: 'removed', left: line, right: '', leftNum: leftNum++, rightNum: null });
      }
      i++;
    } else {
      // added
      const lines = stripTrailingNewline(change.value).split('\n');
      for (const line of lines) {
        rows.push({ type: 'added', left: '', right: line, leftNum: null, rightNum: rightNum++ });
      }
      i++;
    }
  }
  return rows;
}

/**
 * Collapse unchanged sections, keeping CONTEXT_LINES around changes.
 */
export function collapseDiffRows(rows) {
  if (rows.length === 0) return [];

  const isChanged = rows.map(r => r.type !== 'same');
  const showLine = new Set();

  for (let i = 0; i < rows.length; i++) {
    if (isChanged[i]) {
      for (let k = Math.max(0, i - CONTEXT_LINES); k <= Math.min(rows.length - 1, i + CONTEXT_LINES); k++) {
        showLine.add(k);
      }
    }
  }

  const result = [];
  let collapsed = 0;
  for (let i = 0; i < rows.length; i++) {
    if (showLine.has(i)) {
      if (collapsed > 0) {
        result.push({ type: 'collapse', count: collapsed });
        collapsed = 0;
      }
      result.push(rows[i]);
    } else {
      collapsed++;
    }
  }
  if (collapsed > 0) {
    result.push({ type: 'collapse', count: collapsed });
  }
  return result;
}

/**
 * Parse CSV text into rows and detect headers.
 * Simple parser: handles quoted fields with commas/newlines.
 */
export function parseCsvForDiff(text) {
  if (!text || !text.trim()) return { headers: [], rows: [] };
  const lines = normalizeEndings(text).split('\n');
  const parsedRows = lines.map(line => parseCsvLine(line));
  if (parsedRows.length === 0) return { headers: [], rows: [] };
  return { headers: parsedRows[0], rows: parsedRows.slice(1) };
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
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
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Strip comments from relaxed JSON text (line comments // and block comments).
 * Preserves string content.
 */
export function stripJsonComments(text) {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < text.length) {
    if (inString) {
      if (text[i] === '\\') {
        result += text[i] + (text[i + 1] || '');
        i += 2;
        continue;
      }
      if (text[i] === stringChar) {
        inString = false;
      }
      result += text[i];
      i++;
    } else {
      if (text[i] === '"') {
        inString = true;
        stringChar = '"';
        result += text[i];
        i++;
      } else if (text[i] === '/' && text[i + 1] === '/') {
        // Line comment - skip until newline
        while (i < text.length && text[i] !== '\n') i++;
      } else if (text[i] === '/' && text[i + 1] === '*') {
        // Block comment
        i += 2;
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
        i += 2;
      } else if (text[i] === '#') {
        // Hash comment
        while (i < text.length && text[i] !== '\n') i++;
      } else {
        result += text[i];
        i++;
      }
    }
  }
  return result;
}

/**
 * Tokenize JSON text for syntax highlighting.
 * Returns array of { type: 'key'|'string'|'number'|'boolean'|'null'|'brace'|'comment'|'text', value }.
 */
export function tokenizeJson(text) {
  const tokens = [];
  let i = 0;

  while (i < text.length) {
    // Whitespace
    if (/\s/.test(text[i])) {
      let ws = '';
      while (i < text.length && /\s/.test(text[i])) { ws += text[i]; i++; }
      tokens.push({ type: 'text', value: ws });
      continue;
    }
    // Line comment
    if (text[i] === '/' && text[i + 1] === '/') {
      let comment = '';
      while (i < text.length && text[i] !== '\n') { comment += text[i]; i++; }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }
    // Block comment
    if (text[i] === '/' && text[i + 1] === '*') {
      let comment = '/*';
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        comment += text[i]; i++;
      }
      if (i < text.length) { comment += '*/'; i += 2; }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }
    // Hash comment
    if (text[i] === '#') {
      let comment = '';
      while (i < text.length && text[i] !== '\n') { comment += text[i]; i++; }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }
    // String
    if (text[i] === '"') {
      let str = '"';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') { str += text[i]; i++; }
        if (i < text.length) { str += text[i]; i++; }
      }
      if (i < text.length) { str += '"'; i++; }
      tokens.push({ type: 'string', value: str });
      continue;
    }
    // Braces, brackets, colon, comma
    if ('{}[]:,'.includes(text[i])) {
      tokens.push({ type: 'brace', value: text[i] });
      i++;
      continue;
    }
    // Numbers, booleans, null
    const rest = text.slice(i);
    const numMatch = rest.match(/^-?(\d+\.?\d*([eE][+-]?\d+)?)/);
    if (numMatch) {
      tokens.push({ type: 'number', value: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }
    if (rest.startsWith('true') && !/\w/.test(rest[4] || '')) {
      tokens.push({ type: 'boolean', value: 'true' }); i += 4; continue;
    }
    if (rest.startsWith('false') && !/\w/.test(rest[5] || '')) {
      tokens.push({ type: 'boolean', value: 'false' }); i += 5; continue;
    }
    if (rest.startsWith('null') && !/\w/.test(rest[4] || '')) {
      tokens.push({ type: 'null', value: 'null' }); i += 4; continue;
    }
    // Unquoted key or other text (relaxed JSON allows unquoted keys)
    let word = '';
    while (i < text.length && !/[\s{}[\]:,"/]/.test(text[i])) {
      word += text[i]; i++;
    }
    if (word) tokens.push({ type: 'key', value: word });
  }
  return tokens;
}

function normalizeEndings(text) {
  return (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripTrailingNewline(text) {
  // diff library includes trailing newline in values; strip it for line splitting
  if (text.endsWith('\n')) return text.slice(0, -1);
  return text;
}
