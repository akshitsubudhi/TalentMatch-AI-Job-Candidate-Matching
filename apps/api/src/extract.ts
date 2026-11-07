import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import type { SourceMime } from "@talentmatch/core/ingest";

export const MAX_PDF_PAGES = 20;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function looksLikePdf(bytes: Uint8Array): boolean {
  // The header may be preceded by a little junk; the spec allows it within the first 1024 bytes.
  const limit = Math.min(bytes.length - PDF_MAGIC.length, 1024);
  for (let start = 0; start <= limit; start++) {
    if (PDF_MAGIC.every((b, i) => bytes[start + i] === b)) return true;
  }
  return false;
}

/** Extract plain text from a PDF or UTF-8 text upload. Throws on malformed input. */
export async function extractText(bytes: Uint8Array, mime: SourceMime): Promise<string> {
  if (mime === "text/plain") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\u0000")) throw new Error("text file contains NUL bytes (binary file?)");
    return text;
  }
  if (!looksLikePdf(bytes)) throw new Error("file does not have a PDF header");
  // pdf.js may transfer/detach the buffer it is given, so pass a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDF has ${pdf.numPages} pages (max ${MAX_PDF_PAGES})`);
    const { text } = await extractPdfText(pdf, { mergePages: false });
    return text.join("\n\n");
  } finally {
    await pdf.loadingTask.destroy();
  }
}
