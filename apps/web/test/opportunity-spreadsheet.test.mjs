import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { spreadsheetCell, spreadsheetText, utf16leWithBom } from "../lib/opportunity-spreadsheet.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a cell is text: it cannot break the table or run as a formula", () => {
  assert.equal(spreadsheetCell("åpne ny apotek"), "åpne ny apotek");
  assert.equal(spreadsheetCell("one\ttwo\r\nthree"), "one two three");
  assert.equal(spreadsheetCell(null), "");
  assert.equal(spreadsheetCell(56), "56");
  for (const hostile of ["=HYPERLINK(\"http://x\")", "+1+1", "-2", "@SUM(A1)"]) {
    assert.equal(spreadsheetCell(hostile)[0], "'", hostile);
  }
  // Leading whitespace must not hide the formula character.
  assert.equal(spreadsheetCell("  =1+1"), "'=1+1");
});

test("the table has a header row and one line per opportunity", () => {
  const text = spreadsheetText(["Title", "Score"], [["apotek", 56], ["kafé", 71]]);
  assert.equal(text, "Title\tScore\r\napotek\t56\r\nkafé\t71\r\n");
});

test("the bytes are UTF-16 with a mark, so Norwegian and Arabic survive Excel", () => {
  const bytes = utf16leWithBom("å\tع");
  assert.deepEqual([...bytes.slice(0, 2)], [0xff, 0xfe]);
  assert.equal(new TextDecoder("utf-16le").decode(bytes.slice(2)), "å\tع");
  assert.equal(bytes.length, 2 + 3 * 2);
});

test("the page offers the readable file beside the backup, and says which is which", () => {
  const page = readFileSync(join(webRoot, "components/opportunity-intelligence.tsx"), "utf8");
  assert.match(page, /function exportSpreadsheet\(/);
  assert.match(page, /<LocalizedText en="Open in Excel" \/>/);
  assert.match(page, /text\/tab-separated-values/);
  assert.match(page, /The backup is for restoring your data, not for reading\./);
});

test("the PDF is the export in plain sight; the table and backup are one step back", () => {
  const page = readFileSync(join(webRoot, "components/opportunity-intelligence.tsx"), "utf8");
  const more = page.indexOf('<details className="opportunity-more">');
  assert.ok(more > -1);
  assert.ok(page.indexOf("<SavePdfButton") < more, "the PDF button stays outside the fold");
  const folded = page.slice(more, page.indexOf("</details>", more));
  for (const control of ["exportBackup", "exportSpreadsheet", "opportunity-backup-file"]) {
    assert.ok(folded.includes(control), `${control} belongs inside the fold`);
  }
  // The backup stays reachable: this data lives only in the browser.
  assert.match(folded, /<LocalizedText en="Export backup" \/>/);
});
