'use strict';

const token = '%[a-f\\d]{2}';
const multiMatcher = new RegExp(`(${token})+`, 'gi');
const hexPair = /^[a-f\d]{2}$/i;

function parsePercentByte(input, position) {
  if (input.codePointAt(position) !== 37 || position + 3 > input.length) return null;
  const digits = input.slice(position + 1, position + 3);
  return hexPair.test(digits) ? { byte: Number.parseInt(digits, 16), next: position + 3 } : null;
}

function utf8SequenceLength(byte) {
  if (byte <= 0x7f) return 1;
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  return 0;
}

function decodeMalformedRun(input) {
  let output = '';
  let position = 0;
  while (position < input.length) {
    if (input.codePointAt(position) !== 37) {
      output += input.charAt(position++);
      continue;
    }
    const firstByte = parsePercentByte(input, position);
    if (!firstByte) {
      output += input.charAt(position++);
      continue;
    }
    const length = utf8SequenceLength(firstByte.byte);
    if (!length) {
      output += input.slice(position, position + 3);
      position += 3;
      continue;
    }
    let end = firstByte.next;
    let valid = true;
    for (let index = 1; index < length; index++) {
      const next = parsePercentByte(input, end);
      if (!next || next.byte < 0x80 || next.byte > 0xbf) { valid = false; break; }
      end = next.next;
    }
    if (valid) {
      try {
        output += decodeURIComponent(input.slice(position, end));
        position = end;
        continue;
      } catch { /* Preserve an invalid UTF-8 byte below. */ }
    }
    output += input.slice(position, position + 3);
    position += 3;
  }
  return output;
}

function decodeUriComponent(encodedURI) {
  if (typeof encodedURI !== 'string') {
    throw new TypeError(`Expected \`encodedURI\` to be of type \`string\`, got \`${typeof encodedURI}\``);
  }
  try { return decodeURIComponent(encodedURI); }
  catch { /* Decode valid portions while leaving malformed bytes readable. */ }

  const replacements = { '%FE%FF': '\ufffd\ufffd', '%FF%FE': '\ufffd\ufffd' };
  let match = multiMatcher.exec(encodedURI);
  while (match) {
    try { replacements[match[0]] = decodeURIComponent(match[0]); }
    catch {
      const decoded = decodeMalformedRun(match[0]);
      if (decoded !== match[0]) replacements[match[0]] = decoded;
    }
    match = multiMatcher.exec(encodedURI);
  }
  replacements['%C2'] = '\ufffd';
  let result = encodedURI;
  for (const encoded of Object.keys(replacements)) {
    result = result.replace(new RegExp(encoded, 'g'), replacements[encoded]);
  }
  return result;
}

module.exports = decodeUriComponent;
