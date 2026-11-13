// A copy of the opportunity list that a person can open and read.
//
// The backup is JSON: it exists to be imported again, and the owner, having
// pressed "Export backup" and opened the result, reasonably concluded the
// export was broken. This is the other file — a table for a spreadsheet.
//
// Tab-separated and UTF-16 with a byte-order mark, on purpose. A comma file
// opens as one column in Excel wherever the system's list separator is a
// semicolon (Norway, Germany, France, Spain), and a UTF-8 file without a mark
// turns å and Arabic into noise. This form opens correctly under any regional
// setting.

/** A cell a spreadsheet will show as text, never run as a formula. */
export function spreadsheetCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  // Tabs and line breaks would start a new cell or row.
  text = text.replace(/[\t\r\n]+/g, " ").trim();
  // A cell beginning with one of these is evaluated by Excel. The title and
  // thesis are free text, and an imported backup can carry someone else's.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return text;
}

/** Rows of cells → one tab-separated string with a header row. */
export function spreadsheetText(headers, rows) {
  return [headers, ...rows].map((row) => row.map(spreadsheetCell).join("\t")).join("\r\n") + "\r\n";
}

/** UTF-16LE bytes with a byte-order mark, which is what Excel reads without asking. */
export function utf16leWithBom(text) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    bytes[2 + index * 2] = unit & 0xff;
    bytes[3 + index * 2] = unit >> 8;
  }
  return bytes;
}
