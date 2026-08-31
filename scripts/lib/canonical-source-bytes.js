/**
 * Cross-platform source byte owner.
 *
 * Byte gate'ler deploy edilen canonical LF içeriği ölçer; Windows checkout'ta
 * CRLF açılan dosyalar CI ile aynı sonucu vermelidir.
 */
'use strict';

const fs = require('node:fs');

function normalizeSourceLineEndings(value) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n');
}

function canonicalSourceBytes(value) {
  return Buffer.byteLength(normalizeSourceLineEndings(value), 'utf8');
}

function canonicalSourceFileBytes(filePath) {
  return canonicalSourceBytes(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  normalizeSourceLineEndings,
  canonicalSourceBytes,
  canonicalSourceFileBytes
};
