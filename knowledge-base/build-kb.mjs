// Turns poplar-dental-knowledge-base.md into a Word document and a PDF for use in a RAG system.
// Run with: node build-kb.mjs   (needs `npm install` once in this folder, and Microsoft Edge for the PDF)
// Supports the Markdown used in the source: #, ## and ### headings, paragraphs (one per line),
// "- " bullets, "1. " numbered lists, pipe tables, **bold** and [links](url).
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, AlignmentType, Footer, PageNumber,
} from 'docx';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, 'poplar-dental-knowledge-base.md');
const outName = 'Poplar-Dental-Knowledge-Base';
const FOREST = '24483D';
const LINE = 'C6C1B4';
const SAGE = 'ECF1E9';

// ---------- Parse the Markdown into blocks ----------
function parseBlocks(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); continue; }
    const collect = (test, strip) => {
      const items = [];
      while (i < lines.length && test(lines[i].trim())) items.push(strip(lines[i++].trim()));
      i -= 1;
      return items;
    };
    if (line.startsWith('|')) {
      const rows = collect((l) => l.startsWith('|'), (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
        .filter((cells) => !cells.every((c) => /^-+$/.test(c)));
      blocks.push({ type: 'table', rows });
    } else if (/^- /.test(line)) {
      blocks.push({ type: 'bullets', items: collect((l) => /^- /.test(l), (l) => l.slice(2)) });
    } else if (/^\d+\.\s/.test(line)) {
      blocks.push({ type: 'numbers', items: collect((l) => /^\d+\.\s/.test(l), (l) => l.replace(/^\d+\.\s+/, '')) });
    } else {
      blocks.push({ type: 'para', text: line });
    }
  }
  return blocks;
}

// Splits inline text into segments: { text, bold, url }.
function parseInline(text) {
  const segments = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) segments.push(...parseInline(m[1]).map((s) => ({ ...s, bold: true })));
    else segments.push({ text: m[2], url: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

// Link text that already reads as an address doesn't need the URL repeated after it.
const looksLikeAddress = (text) => /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text);

// ---------- Word document ----------
function runsFor(text, base = {}) {
  const runs = [];
  for (const s of parseInline(text)) {
    if (s.url) {
      runs.push(new ExternalHyperlink({ link: s.url, children: [new TextRun({ text: s.text, style: 'Hyperlink', bold: base.bold || s.bold })] }));
      if (!looksLikeAddress(s.text)) runs.push(new TextRun({ text: ` (${s.url})`, ...base, color: '5C6159' }));
    } else {
      runs.push(new TextRun({ text: s.text, ...base, bold: base.bold || s.bold }));
    }
  }
  return runs;
}

function buildDocx(blocks) {
  const contentWidth = 11906 - 2 * 1134; // A4 width minus 2 cm margins, in DXA
  const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  const borders = { top: border, bottom: border, left: border, right: border };
  let listInstance = 0;
  const children = [];

  for (const b of blocks) {
    if (b.type === 'heading') {
      const level = { 1: HeadingLevel.TITLE, 2: HeadingLevel.HEADING_1, 3: HeadingLevel.HEADING_2 }[b.level];
      children.push(new Paragraph({ heading: level, children: runsFor(b.text), keepNext: true }));
    } else if (b.type === 'para') {
      const isQuestion = b.text.startsWith('**Q:');
      children.push(new Paragraph({ children: runsFor(b.text), keepNext: isQuestion, spacing: isQuestion ? { before: 200, after: 40 } : undefined }));
    } else if (b.type === 'bullets' || b.type === 'numbers') {
      listInstance += 1;
      for (const item of b.items) {
        children.push(new Paragraph({
          numbering: { reference: b.type, level: 0, instance: listInstance },
          spacing: { after: 60 },
          children: runsFor(item),
        }));
      }
    } else if (b.type === 'table') {
      const cols = b.rows[0].length;
      const first = cols === 2 ? Math.round(contentWidth * 0.28) : Math.round(contentWidth / cols);
      const widths = cols === 2 ? [first, contentWidth - first] : Array.from({ length: cols }, (_, i) => (i === cols - 1 ? contentWidth - first * (cols - 1) : first));
      children.push(new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: widths,
        rows: b.rows.map((cells, r) => new TableRow({
          tableHeader: r === 0,
          children: cells.map((cell, c) => new TableCell({
            width: { size: widths[c], type: WidthType.DXA },
            borders,
            shading: r === 0 ? { type: ShadingType.CLEAR, color: 'auto', fill: SAGE } : undefined,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ spacing: { after: 0 }, children: runsFor(cell, { bold: r === 0 || (c === 0 && cols === 2) }) })],
          })),
        })),
      }));
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  }

  return new Document({
    creator: 'Poplar Dental Practice',
    title: 'Poplar Dental Practice: patient information knowledge base',
    subject: 'Patient information for a question-answering assistant',
    description: 'Everything on the Poplar Dental Practice website, organised by topic.',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22, color: '292C28' }, paragraph: { spacing: { after: 120, line: 288 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Georgia', size: 44, color: FOREST }, paragraph: { spacing: { after: 240 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Georgia', size: 32, color: FOREST }, paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: FOREST, space: 4 } } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Georgia', size: 26, color: FOREST }, paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
        { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Poplar Dental Practice knowledge base · Page ', size: 18, color: '5C6159' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '5C6159' }),
              new TextRun({ text: ' of ', size: 18, color: '5C6159' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '5C6159' }),
            ],
          })],
        }),
      },
      children,
    }],
  });
}

// ---------- HTML (for the PDF) ----------
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inlineHtml(text) {
  return parseInline(text).map((s) => {
    let html = escapeHtml(s.text);
    if (s.url) html = `<a href="${escapeHtml(s.url)}">${html}</a>${looksLikeAddress(s.text) ? '' : ` <span class="url">(${escapeHtml(s.url)})</span>`}`;
    return s.bold ? `<strong>${html}</strong>` : html;
  }).join('');
}

function buildHtml(blocks) {
  const body = blocks.map((b) => {
    if (b.type === 'heading') return `<h${b.level}>${inlineHtml(b.text)}</h${b.level}>`;
    if (b.type === 'para') return `<p${b.text.startsWith('**Q:') ? ' class="q"' : ''}>${inlineHtml(b.text)}</p>`;
    if (b.type === 'bullets') return `<ul>${b.items.map((t) => `<li>${inlineHtml(t)}</li>`).join('')}</ul>`;
    if (b.type === 'numbers') return `<ol>${b.items.map((t) => `<li>${inlineHtml(t)}</li>`).join('')}</ol>`;
    const [head, ...rows] = b.rows;
    return `<table><thead><tr>${head.map((c) => `<th>${inlineHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<${i === 0 ? 'th scope="row"' : 'td'}>${inlineHtml(c)}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table>`;
  }).join('\n');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<title>Poplar Dental Practice: patient information knowledge base</title>
<style>
@page { size: A4; margin: 20mm 20mm 22mm; @bottom-center { content: "Poplar Dental Practice knowledge base · Page " counter(page) " of " counter(pages); font: 8.5pt Calibri, sans-serif; color: #5C6159; } }
body { font: 10.5pt/1.5 Calibri, "Segoe UI", sans-serif; color: #292C28; }
h1, h2, h3 { font-family: Georgia, serif; font-weight: normal; color: #${FOREST}; break-after: avoid; }
h1 { font-size: 22pt; margin: 0 0 12pt; }
h2 { font-size: 16pt; margin: 20pt 0 8pt; padding-bottom: 3pt; border-bottom: 1px solid #${FOREST}; }
h3 { font-size: 13pt; margin: 14pt 0 4pt; }
p { margin: 0 0 6pt; }
p.q { margin-top: 10pt; margin-bottom: 2pt; break-after: avoid; }
ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
li { margin: 0 0 3pt; }
a { color: #${FOREST}; }
.url { color: #5C6159; font-size: 9pt; word-break: break-all; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 12pt; break-inside: auto; }
th, td { border: 1px solid #${LINE}; padding: 4pt 7pt; text-align: left; vertical-align: top; }
thead th { background: #${SAGE}; }
tbody th { font-weight: bold; width: 28%; }
tr { break-inside: avoid; }
</style></head><body>
${body}
</body></html>`;
}

// ---------- Build ----------
const blocks = parseBlocks(readFileSync(source, 'utf8'));
const docxPath = join(here, `${outName}.docx`);
writeFileSync(docxPath, await Packer.toBuffer(buildDocx(blocks)));
console.log(`Wrote ${outName}.docx`);

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!edge) {
  console.log('Microsoft Edge not found, so the PDF was skipped.');
} else {
  const work = mkdtempSync(join(tmpdir(), 'poplar-kb-'));
  const htmlPath = join(work, 'kb.html');
  writeFileSync(htmlPath, buildHtml(blocks));
  const pdfPath = join(here, `${outName}.pdf`);
  execFileSync(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(work, 'profile')}`,
    '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href,
  ], { stdio: 'ignore', timeout: 120000 });
  rmSync(work, { recursive: true, force: true });
  console.log(existsSync(pdfPath) ? `Wrote ${outName}.pdf` : 'PDF was not created');
}
