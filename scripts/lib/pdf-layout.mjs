// Shared layout helpers for the generated PDF guides.
//
// Both guides use the same engine; only the fonts, colours and copy differ.
// The Bangla guide registers Hind Siliguri so that conjuncts and pre-base
// matras are shaped correctly by fontkit.

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const COLORS = {
  ink: '#1f2937',
  muted: '#6b7280',
  teal: '#0f766e',
  deep: '#173c34',
  orange: '#c2410c',
  rule: '#d1d5db',
  codeBg: '#f3f4f6',
  noteBg: '#ecfdf5',
  warnBg: '#fff7ed',
};

export async function createGuide({ PDFDocument, outPath, info, fonts, lineGap = 2.5, baseSize = 10.5 }) {
  await mkdir(path.dirname(outPath), { recursive: true });

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
    bufferPages: true,
    info,
  });
  doc.pipe(createWriteStream(outPath));

  // Register any TTFs, then resolve the logical names used below.
  for (const [name, file] of Object.entries(fonts.register ?? {})) doc.registerFont(name, file);
  const F = { regular: fonts.regular, bold: fonts.bold, mono: fonts.mono ?? 'Courier' };

  const LEFT = doc.page.margins.left;
  const WIDTH = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  const api = {
    doc,
    LEFT,
    WIDTH,
    F,

    space(h) {
      if (doc.y + h > bottom()) doc.addPage();
    },

    cover({ eyebrow, title, subtitle, footnote, height = 190, eyebrowSpacing = 0 }) {
      doc.rect(0, 0, doc.page.width, height).fill(COLORS.deep);
      // characterSpacing breaks Bangla cluster shaping, so it defaults to off.
      doc
        .fillColor('#5eead4')
        .font(F.bold)
        .fontSize(10)
        .text(eyebrow, LEFT, 52, { characterSpacing: eyebrowSpacing, width: WIDTH });
      doc.fillColor('#ffffff').font(F.bold).fontSize(25).text(title, LEFT, 76, { width: WIDTH - 30 });
      doc
        .fillColor('#a7f3d0')
        .font(F.regular)
        .fontSize(11.5)
        .text(subtitle, LEFT, height - 72, { width: WIDTH - 30, lineGap });
      doc.fillColor('#6ee7b7').font(F.regular).fontSize(9).text(footnote, LEFT, height - 32, { width: WIDTH });
      doc.y = height + 30;
      doc.fillColor(COLORS.ink);
    },

    h1(text) {
      api.space(74);
      doc.moveDown(0.6);
      doc.fillColor(COLORS.deep).font(F.bold).fontSize(17).text(text, LEFT, doc.y, { width: WIDTH, lineGap });
      const y = doc.y + 6;
      doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(2).strokeColor(COLORS.teal).stroke();
      doc.y = y + 14;
    },

    h2(text) {
      api.space(54);
      doc.moveDown(0.5);
      doc.fillColor(COLORS.teal).font(F.bold).fontSize(12.5).text(text, LEFT, doc.y, { width: WIDTH, lineGap });
      doc.moveDown(0.35);
    },

    para(text, opts = {}) {
      api.space(32);
      doc
        .fillColor(opts.color ?? COLORS.ink)
        .font(opts.bold ? F.bold : F.regular)
        .fontSize(opts.size ?? baseSize)
        .text(text, LEFT + (opts.indent ?? 0), doc.y, {
          width: WIDTH - (opts.indent ?? 0),
          lineGap: opts.lineGap ?? lineGap,
        });
      doc.moveDown(0.45);
    },

    bullets(items) {
      for (const item of items) {
        api.space(28);
        const y = doc.y;
        doc.fillColor(COLORS.teal).font(F.bold).fontSize(baseSize).text('\u2022', LEFT + 4, y, { width: 12 });
        doc
          .fillColor(COLORS.ink)
          .font(F.regular)
          .fontSize(baseSize)
          .text(item, LEFT + 20, y, { width: WIDTH - 20, lineGap });
        doc.moveDown(0.3);
      }
      doc.moveDown(0.25);
    },

    steps(items) {
      items.forEach((item, i) => {
        api.space(28);
        const y = doc.y;
        doc
          .fillColor(COLORS.orange)
          .font(F.bold)
          .fontSize(baseSize)
          .text(`${i + 1}.`, LEFT + 2, y, { width: 18 });
        doc
          .fillColor(COLORS.ink)
          .font(F.regular)
          .fontSize(baseSize)
          .text(item, LEFT + 24, y, { width: WIDTH - 24, lineGap });
        doc.moveDown(0.32);
      });
      doc.moveDown(0.25);
    },

    // Code blocks stay ASCII-only: the mono face has no Bangla glyphs.
    code(lines) {
      const rows = Array.isArray(lines) ? lines : [lines];
      const lh = 13.5;
      const pad = 10;
      const h = rows.length * lh + pad * 2;
      api.space(h + 6);
      const top = doc.y; // text() mutates doc.y, so capture first
      doc.roundedRect(LEFT, top, WIDTH, h, 4).fill(COLORS.codeBg);
      let y = top + pad;
      for (const row of rows) {
        const comment = row.trimStart().startsWith('#');
        doc
          .fillColor(comment ? COLORS.muted : '#111827')
          .font(F.mono)
          .fontSize(9.5)
          .text(row, LEFT + pad, y, { width: WIDTH - pad * 2, lineBreak: false });
        y += lh;
      }
      doc.y = top + h + 8;
    },

    box(kind, title, text) {
      const bg = kind === 'warn' ? COLORS.warnBg : COLORS.noteBg;
      const edge = kind === 'warn' ? COLORS.orange : COLORS.teal;
      const pad = 11;
      doc.font(F.regular).fontSize(10);
      const inner = WIDTH - pad * 2 - 6;
      const th = doc.heightOfString(text, { width: inner, lineGap });
      doc.font(F.bold).fontSize(10);
      const hh = doc.heightOfString(title, { width: inner, lineGap });
      const h = th + hh + pad * 2 + 5;
      api.space(h + 6);
      const top = doc.y;
      doc.roundedRect(LEFT, top, WIDTH, h, 4).fill(bg);
      doc.rect(LEFT, top, 3.5, h).fill(edge);
      doc.fillColor(edge).font(F.bold).fontSize(10).text(title, LEFT + pad + 4, top + pad, { width: inner, lineGap });
      doc
        .fillColor(COLORS.ink)
        .font(F.regular)
        .fontSize(10)
        .text(text, LEFT + pad + 4, top + pad + hh + 4, { width: inner, lineGap });
      doc.y = top + h + 10;
    },

    table(headers, rows, widths) {
      const cols = widths.map((w) => w * WIDTH);
      const pad = 7;
      const draw = (cells, head, bg) => {
        const font = head ? F.bold : F.regular;
        doc.font(font).fontSize(9.5);
        const h =
          Math.max(
            ...cells.map((c, i) => doc.heightOfString(String(c), { width: cols[i] - pad * 2, lineGap: 1.5 })),
          ) +
          pad * 2;
        api.space(h);
        const top = doc.y;
        if (bg) doc.rect(LEFT, top, WIDTH, h).fill(bg);
        let x = LEFT;
        cells.forEach((c, i) => {
          doc
            .fillColor(head ? '#ffffff' : COLORS.ink)
            .font(font)
            .fontSize(9.5)
            .text(String(c), x + pad, top + pad, { width: cols[i] - pad * 2, lineGap: 1.5 });
          x += cols[i];
        });
        doc.y = top + h;
        doc.moveTo(LEFT, doc.y).lineTo(LEFT + WIDTH, doc.y).lineWidth(0.5).strokeColor(COLORS.rule).stroke();
      };
      draw(headers, true, COLORS.teal);
      rows.forEach((r, i) => draw(r, false, i % 2 ? '#f9fafb' : null));
      doc.moveDown(0.8);
    },

    finish(footerLabel, pageLabel = (n, total) => `Page ${n} of ${total}`) {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        // The footer sits below the bottom margin. Without this pdfkit treats
        // it as overflow and appends a blank page for every footer drawn.
        const keep = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        const y = doc.page.height - 44;
        doc.moveTo(LEFT, y - 10).lineTo(LEFT + WIDTH, y - 10).lineWidth(0.5).strokeColor(COLORS.rule).stroke();
        doc
          .fillColor(COLORS.muted)
          .font(F.regular)
          .fontSize(8.5)
          .text(footerLabel, LEFT, y, { width: WIDTH * 0.68, lineBreak: false });
        doc
          .fillColor(COLORS.muted)
          .font(F.regular)
          .fontSize(8.5)
          .text(pageLabel(i + 1, range.count), LEFT + WIDTH * 0.68, y, {
            width: WIDTH * 0.32,
            align: 'right',
            lineBreak: false,
          });
        doc.page.margins.bottom = keep;
      }
      doc.flushPages();
      doc.end();
    },
  };

  return api;
}
