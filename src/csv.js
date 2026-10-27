// CSV pensado para abrir direto no Excel em portugues: separador ponto e virgula e BOM UTF-8.
function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  // evita que o Excel interprete o texto como formula
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  if (/[";\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(cell).join(';')];
  for (const r of rows) lines.push(r.map(cell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
