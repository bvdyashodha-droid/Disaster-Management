export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportRowsToCsv(filename: string, rows: Record<string, unknown>[], columns?: string[]): void {
  const cols =
    columns && columns.length > 0
      ? columns
      : Array.from(
          rows.reduce((set, row) => {
            Object.keys(row).forEach((k) => {
              if (k !== 'password_hash') set.add(k);
            });
            return set;
          }, new Set<string>())
        );

  const headerLine = cols.map(escapeCsvCell).join(',');
  const bodyLines = rows.map((row) => cols.map((c) => escapeCsvCell(row[c])).join(','));
  // UTF-8 BOM ensures Sinhala Unicode renders properly in Microsoft Excel
  const csvContent = '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
  downloadBlob(filename, csvContent, 'text/csv;charset=utf-8;');
}

export function exportDataToJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  downloadBlob(filename, json, 'application/json;charset=utf-8;');
}

export function downloadBlob(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// RFC 4180 compliant CSV parser supporting quoted newlines & Sinhala UTF-8
export function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, '');
  const matrix: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell.trim());
        matrix.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentCell.trim());
        matrix.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    matrix.push(currentRow);
  }

  const nonEmpty = matrix.filter((r) => r.some((cell) => cell !== ''));
  if (nonEmpty.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = nonEmpty[0];
  const rows = nonEmpty.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = cells[idx] ?? '';
    });
    return obj;
  });

  return { headers, rows };
}

export async function computeChecksum(data: unknown): Promise<string> {
  const str = JSON.stringify(data);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
