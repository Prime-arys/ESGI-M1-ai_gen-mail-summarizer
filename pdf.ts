import { jsPDF } from 'jspdf';
import type { NewsletterSummary } from '@/lib/types';

/** Construit un PDF récapitulatif à partir des résumés. Renvoie un Blob. */
export function buildDigestPdf(summaries: NewsletterSummary[], title = 'Digest des newsletters'): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const write = (text: string, size: number, style: 'normal' | 'bold' = 'normal', gap = 6) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
    y += gap;
  };

  write(title, 20, 'bold', 4);
  write(new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' }), 10, 'normal', 16);

  summaries.forEach((s, i) => {
    ensureSpace(40);
    write(`${i + 1}. ${s.subject}`, 13, 'bold', 2);
    if (s.source) write(s.source, 9, 'normal', 4);
    for (const b of s.bullets) write(`•  ${b}`, 11, 'normal', 2);
    if (s.url) {
      doc.setTextColor(40, 90, 200);
      write(s.url, 9, 'normal', 12);
      doc.setTextColor(0, 0, 0);
    } else {
      y += 8;
    }
  });

  return doc.output('blob');
}
