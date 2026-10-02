import * as path from 'path';
import PDFDocument = require('pdfkit'); // CommonJS module; the API is compiled without esModuleInterop

/**
 * Meeting summary PDF with bundled Noto Sans (Latin, ₹) and Noto Sans Devanagari (Hindi), both SIL OFL
 * (apps/api/assets/fonts/OFL.txt). Text is split into script runs so each run uses a font that has its glyphs;
 * pdfkit's fontkit layout shapes the Devanagari conjuncts and matras.
 */
const FONTS = path.join(__dirname, '..', '..', 'assets', 'fonts');
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;

/** "Hello नमस्ते ₹500" → [["Hello ", latin], ["नमस्ते", deva], [" ₹500", latin]] — spaces stay with the run they're in. */
export function scriptRuns(text: string): { text: string; devanagari: boolean }[] {
  const runs: { text: string; devanagari: boolean }[] = [];
  for (const ch of text) {
    const deva = DEVANAGARI.test(ch) || (ch === ' ' && runs.length > 0 && runs[runs.length - 1].devanagari);
    const last = runs[runs.length - 1];
    if (last && last.devanagari === deva) last.text += ch; else runs.push({ text: ch, devanagari: deva });
  }
  return runs;
}

export function buildSummaryPdf(title: string, body: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: title, Author: 'AEVORA Assistant' } });
    doc.registerFont('latin', path.join(FONTS, 'NotoSans-Regular.ttf'));
    doc.registerFont('latin-bold', path.join(FONTS, 'NotoSans-Bold.ttf'));
    doc.registerFont('deva', path.join(FONTS, 'NotoSansDevanagari-Regular.ttf'));
    doc.registerFont('deva-bold', path.join(FONTS, 'NotoSansDevanagari-Bold.ttf'));
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const write = (line: string, size: number, bold: boolean) => {
      const runs = scriptRuns(line || ' ');
      runs.forEach((r, i) => {
        doc.font(`${r.devanagari ? 'deva' : 'latin'}${bold ? '-bold' : ''}`).fontSize(size)
          .text(r.text, { continued: i < runs.length - 1, lineGap: 3, baseline: 'alphabetic' });
      });
    };
    write(title, 16, true);
    doc.moveDown(0.6);
    for (const line of body.split('\n')) write(line, 11, /^[A-Z][^:]{0,40}:$/.test(line.trim()));
    doc.end();
  });
}
