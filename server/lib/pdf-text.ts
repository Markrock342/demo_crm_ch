/**
 * Unicode text for pdf-lib: embeds Noto Sans SC (Latin + Chinese) and Noto Sans Thai from
 * server/assets/fonts and draws mixed-script strings as runs, one font per run.
 * See server/assets/fonts/README.md for the font choice, licence and subsetting.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import type { Color, PDFDocument, PDFFont, PDFPage } from "pdf-lib";

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");
const FILES = {
  sc: "NotoSansSC-Regular-subset.ttf",
  scBold: "NotoSansSC-Bold-subset.ttf",
  th: "NotoSansThai-Regular.ttf",
  thBold: "NotoSansThai-Bold.ttf",
} as const;

type FontKey = keyof typeof FILES;
const bytesCache = new Map<FontKey, Uint8Array>();
const charsetCache = new Map<FontKey, Set<number>>();

function fontBytes(key: FontKey): Uint8Array {
  let b = bytesCache.get(key);
  if (!b) {
    b = new Uint8Array(readFileSync(join(FONT_DIR, FILES[key])));
    bytesCache.set(key, b);
  }
  return b;
}

export type PdfFonts = { sc: PDFFont; scBold: PDFFont; th: PDFFont; thBold: PDFFont };

/** Embed the four fonts (subset per document, so a PDF only carries the glyphs it uses). */
export async function embedPdfFonts(pdf: PDFDocument): Promise<PdfFonts> {
  pdf.registerFontkit(fontkit);
  const out = {} as PdfFonts;
  for (const key of Object.keys(FILES) as FontKey[]) {
    const font = await pdf.embedFont(fontBytes(key), { subset: true });
    if (!charsetCache.has(key)) charsetCache.set(key, new Set(font.getCharacterSet()));
    out[key] = font;
  }
  return out;
}

const isThai = (cp: number) => cp >= 0x0e00 && cp <= 0x0e7f;
/** Thai marks that sit above / below the previous consonant (never start a line with them). */
const isThaiMark = (cp: number) => cp === 0x0e31 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e);

const REPLACE: Record<string, string> = { "\t": " ", " ": " ", "​": "" };

type Run = { text: string; font: PDFFont };

/** Split a single line into same-font runs; characters no font covers become "?". */
export function toRuns(fonts: PdfFonts, text: string, bold = false): Run[] {
  const latin = bold ? fonts.scBold : fonts.sc;
  const thai = bold ? fonts.thBold : fonts.th;
  const scSet = charsetCache.get(bold ? "scBold" : "sc");
  const thSet = charsetCache.get(bold ? "thBold" : "th");
  const runs: Run[] = [];
  for (const raw of text) {
    const ch = REPLACE[raw] ?? raw;
    if (!ch) continue;
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20) continue;
    let font: PDFFont;
    let out = ch;
    if (isThai(cp) && thSet?.has(cp)) font = thai;
    else if (scSet?.has(cp)) font = latin;
    else if (thSet?.has(cp)) font = thai;
    else {
      font = latin;
      out = "?";
    }
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += out;
    else runs.push({ text: out, font });
  }
  return runs;
}

export function textWidth(fonts: PdfFonts, text: string, size: number, bold = false): number {
  return toRuns(fonts, text, bold).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
}

/** Grapheme-ish clusters: a base character plus any following Thai marks. */
function clusters(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (out.length && isThaiMark(cp)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/** Word-wrap to `maxWidth`: prefers spaces, otherwise breaks between clusters (Thai / Chinese have no spaces). */
export function wrapText(fonts: PdfFonts, text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const cs = clusters(para);
    let line = "";
    let lastSpace = -1; // index in `line` just after the last space
    for (const c of cs) {
      const next = line + c;
      if (line && textWidth(fonts, next, size, bold) > maxWidth) {
        if (lastSpace > 0 && c !== " ") {
          lines.push(line.slice(0, lastSpace).trimEnd());
          line = line.slice(lastSpace) + c;
        } else {
          lines.push(line.trimEnd());
          line = c === " " ? "" : c;
        }
        lastSpace = -1;
        continue;
      }
      line = next;
      if (c === " ") lastSpace = line.length;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Shorten to fit `maxWidth`, adding an ellipsis. */
export function fitText(fonts: PdfFonts, text: string, size: number, maxWidth: number, bold = false): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (textWidth(fonts, clean, size, bold) <= maxWidth) return clean;
  const cs = clusters(clean);
  let out = "";
  for (const c of cs) {
    if (textWidth(fonts, `${out}${c}…`, size, bold) > maxWidth) break;
    out += c;
  }
  return `${out.trimEnd()}…`;
}

export type DrawTextOpts = { x: number; y: number; size: number; bold?: boolean; color?: Color; align?: "left" | "right" };

/** Draw one line of mixed Latin / Thai / Chinese text. Returns the drawn width. */
export function drawText(page: PDFPage, fonts: PdfFonts, text: string, opts: DrawTextOpts): number {
  const line = String(text ?? "").replace(/\s*\n\s*/g, " ");
  const runs = toRuns(fonts, line, opts.bold);
  const width = runs.reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, opts.size), 0);
  let x = opts.align === "right" ? opts.x - width : opts.x;
  for (const r of runs) {
    page.drawText(r.text, { x, y: opts.y, size: opts.size, font: r.font, color: opts.color });
    x += r.font.widthOfTextAtSize(r.text, opts.size);
  }
  return width;
}
