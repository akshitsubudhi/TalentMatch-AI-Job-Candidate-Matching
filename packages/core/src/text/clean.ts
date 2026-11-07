/**
 * Normalise text extracted from resumes (PDF or plain text) before chunking,
 * embedding and full-text indexing.
 *
 * - Unicode NFKC normalisation (ligatures like "ﬁ" -> "fi", full-width chars)
 * - Removes control characters and zero-width characters
 * - Normalises bullets and dashes
 * - Re-joins words hyphenated across line breaks ("engi-\nneering" -> "engineering")
 * - Drops lines that are only page numbers ("Page 2 of 3", "- 2 -", "2")
 * - Collapses runs of spaces; keeps at most one blank line between paragraphs
 */
export function cleanText(input: string): string {
  let text = input.normalize("NFKC");

  text = text
    .replace(/\r\n?/g, "\n")
    // zero-width chars and BOM
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    // all other control chars except \n and \t
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, " ")
    .replace(/\t/g, " ")
    .replace(/[\u2022\u25CF\u25AA\u25E6\u2023\u2043\u2219]/g, "-")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ");

  // Word hyphenated across a line break: "engi-\n neering" -> "engineering".
  text = text.replace(/([A-Za-z])-\n[ ]*([a-z])/g, "$1$2");

  const lines = text.split("\n").map((line) => line.replace(/ {2,}/g, " ").trim());

  const kept = lines.filter((line) => !isPageNumberLine(line));

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PAGE_NUMBER_PATTERNS: readonly RegExp[] = [
  /^page \d{1,3}( of \d{1,3})?$/i,
  /^- ?\d{1,3} ?-$/,
  /^\d{1,3}$/,
  /^\d{1,3} ?\/ ?\d{1,3}$/,
];

function isPageNumberLine(line: string): boolean {
  return PAGE_NUMBER_PATTERNS.some((re) => re.test(line));
}
