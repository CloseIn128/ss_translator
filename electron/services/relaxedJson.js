/**
 * Starsector Relaxed JSON Parser
 *
 * Starsector uses a relaxed JSON format that supports:
 * - # line comments
 * - Unquoted keys
 * - Trailing commas
 * - Single-line and multi-line strings
 *
 * This parser converts relaxed JSON to standard JSON while preserving
 * the original source for lossless round-tripping.
 */

/**
 * Strip comments and normalize relaxed JSON to parseable JSON
 * @param {string} text - Raw relaxed JSON text
 * @returns {string} - Standard JSON string
 */
function relaxedJsonToJson(text) {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    // Handle string literals
    if (inString) {
      if (ch === '\\') {
        result += ch + (next || '');
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        result += ch;
        i++;
        continue;
      }
      // Handle newlines in strings - convert to \n
      if (ch === '\n') {
        result += '\\n';
        i++;
        continue;
      }
      if (ch === '\r') {
        i++;
        continue;
      }
      result += ch;
      i++;
      continue;
    }

    // Comment: skip to end of line
    if (ch === '#') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }

    // Start of string
    if (ch === '"') {
      inString = true;
      stringChar = '"';
      result += ch;
      i++;
      continue;
    }

    // Number literals: handle Java/Starsector float suffix (e.g. 1f, 0.5f)
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(next))) {
      let num = '';
      let j = i;
      if (text[j] === '-') { num += '-'; j++; }
      while (j < text.length && /[0-9]/.test(text[j])) { num += text[j]; j++; }
      if (j < text.length && text[j] === '.') {
        num += '.'; j++;
        while (j < text.length && /[0-9]/.test(text[j])) { num += text[j]; j++; }
      }
      // Strip Java float suffix 'f' or 'F'
      if (j < text.length && (text[j] === 'f' || text[j] === 'F')) { j++; }
      result += num;
      i = j;
      continue;
    }

    // Unquoted key detection: if we see a word-like token before a colon
    if (/[a-zA-Z_$]/.test(ch)) {
      let token = '';
      let j = i;
      while (j < text.length && /[a-zA-Z0-9_$\/.\-><]/.test(text[j])) {
        token += text[j];
        j++;
      }
      // Skip whitespace after token
      let k = j;
      while (k < text.length && /\s/.test(text[k])) k++;

      // Check if this is a key (followed by :) or a value like true/false/null
      if (text[k] === ':') {
        result += '"' + token + '"';
        i = j;
        continue;
      }

      // Boolean / null values
      if (token === 'true' || token === 'false' || token === 'null') {
        result += token;
        i = j;
        continue;
      }

      // Otherwise, treat as unquoted string value
      result += '"' + token + '"';
      i = j;
      continue;
    }

    // Handle trailing commas before } or ]
    if (ch === ',') {
      // Look ahead for closing bracket
      let j = i + 1;
      while (j < text.length && /[\s\n\r]/.test(text[j])) j++;
      // Skip comments
      while (j < text.length && text[j] === '#') {
        while (j < text.length && text[j] !== '\n') j++;
        while (j < text.length && /[\s\n\r]/.test(text[j])) j++;
      }
      if (text[j] === '}' || text[j] === ']') {
        // Skip trailing comma
        i++;
        continue;
      }
      result += ch;
      i++;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Parse Starsector relaxed JSON
 * @param {string} text - Raw file content
 * @returns {object} - Parsed JSON object
 */
function parseRelaxedJson(text) {
  const jsonStr = relaxedJsonToJson(text);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Try trimming trailing commas/whitespace after root closing brace
    const trimmed = jsonStr.replace(/\}\s*,\s*$/, '}').replace(/\]\s*,\s*$/, ']');
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      // ignore and throw original error
    }
    const match = e.message.match(/position (\d+)/);
    if (match) {
      const pos = parseInt(match[1]);
      const context = jsonStr.substring(Math.max(0, pos - 50), pos + 50);
      throw new Error(`JSON parse error at position ${pos}: ${e.message}\nContext: ...${context}...`);
    }
    throw e;
  }
}

module.exports = { parseRelaxedJson, relaxedJsonToJson };


