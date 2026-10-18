/**
 * Minimal single-page PDF writer for the mock `/invoices/{id}/pdf` endpoint.
 * The real backend renders the HTML invoice template with WeasyPrint (INV-8);
 * this only proves the download flow end to end.
 */
const ASCII_FALLBACKS: Record<string, string> = { '×': 'x', '″': '"', '“': '"', '”': '"', '’': "'", '−': '-', '–': '-', '›': '>' }

function escape(text: string): string {
  return text
    .replace(/[×″“”’−–›]/g, (ch) => ASCII_FALLBACKS[ch] ?? '?')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/[\\()]/g, (ch) => `\\${ch}`)
}

export function simplePdf(lines: Array<{ text: string; size?: number; gap?: number }>): Blob {
  const commands = ['BT', '56 790 Td']
  for (const line of lines) {
    commands.push(`/F1 ${line.size ?? 11} Tf`, `0 -${line.gap ?? 16} Td`, `(${escape(line.text)}) Tj`)
  }
  commands.push('ET')
  const content = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}
