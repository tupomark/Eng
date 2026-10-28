import { IMPORT_LIMITS, type ParseControl } from "@/domain/imports/types";
import { assertNotCancelled } from "@/domain/imports/lexical-import";
import { archivePath, readBoundedZip } from "./archive";
import { list, record, textContent, xmlDocument, plainEntities } from "./xml";

function cellText(value: unknown): string {
  const item = record(value);
  if (item.t !== undefined) return textContent(item.t);
  return list(item.r)
    .map((run) => textContent(record(run).t))
    .join("");
}

/** Read-only XLSX values. Formulas, macros, hyperlinks and external connections are never executed. */
export async function rowsFromXlsx(
  bytes: Uint8Array,
  control: ParseControl = {},
): Promise<{ cells: string[][]; skippedFormulas: number; sheetName: string }> {
  if (bytes.length > IMPORT_LIMITS.maxFileBytes)
    throw new Error("Vocabulary files are limited to 5 MB.");
  const files = await readBoundedZip(bytes, control.signal);
  if (
    [...files.keys()].some((name) =>
      /(?:vbaProject\.bin|externalLinks\/|connections\.xml$)/iu.test(name),
    )
  )
    throw new Error(
      "Workbooks with macros or external data connections are not supported. Export a plain CSV instead.",
    );
  const workbookBytes = files.get("xl/workbook.xml");
  const relationsBytes = files.get("xl/_rels/workbook.xml.rels");
  if (!workbookBytes || !relationsBytes)
    throw new Error("This archive is not a supported XLSX workbook.");
  const sheets = list(
    record(record(xmlDocument(workbookBytes)).workbook).sheets,
  );
  const sheet = record(list(record(sheets[0]).sheet)[0]);
  const relations = list(
    record(record(xmlDocument(relationsBytes)).Relationships).Relationship,
  ).map(record);
  const relation = relations.find((item) => item["@_Id"] === sheet["@_id"]);
  if (!relation || relation["@_TargetMode"] === "External")
    throw new Error("The first worksheet could not be opened.");
  const target = String(relation["@_Target"] ?? "");
  const path = archivePath(target.replace(/^\/xl\//u, ""), "xl/workbook.xml");
  const sheetBytes = files.get(path);
  if (!sheetBytes) throw new Error("The worksheet file is missing.");
  const sharedBytes = files.get("xl/sharedStrings.xml");
  const strings = sharedBytes
    ? list(record(record(xmlDocument(sharedBytes)).sst).si).map(cellText)
    : [];
  const sheetData = record(
    record(record(xmlDocument(sheetBytes)).worksheet).sheetData,
  );
  const sourceRows = list(sheetData.row);
  if (sourceRows.length > IMPORT_LIMITS.maxRows + 1)
    throw new Error("The worksheet exceeds the 10,000-row limit.");
  const cells: string[][] = [];
  let skippedFormulas = 0;
  for (let index = 0; index < sourceRows.length; index++) {
    if (index % IMPORT_LIMITS.yieldEveryRows === 0) {
      assertNotCancelled(control.signal);
      control.onProgress?.(index, sourceRows.length);
      await (control.yieldControl?.() ??
        new Promise<void>((resolve) => setTimeout(resolve, 0)));
    }
    const output: string[] = [];
    for (const cell of list(record(sourceRows[index]).c)) {
      const data = record(cell);
      const address = String(data["@_r"] ?? "");
      const columnLetters = address.match(/^[A-Z]+/u)?.[0];
      if (!columnLetters)
        throw new Error("A worksheet cell has an invalid address.");
      let column = 0;
      for (const letter of columnLetters)
        column = column * 26 + letter.charCodeAt(0) - 64;
      if (column > IMPORT_LIMITS.maxColumns)
        throw new Error("The worksheet exceeds the 32-column limit.");
      while (output.length < column) output.push("");
      if (data.f !== undefined) {
        skippedFormulas++;
        continue;
      }
      const type = data["@_t"];
      const raw = textContent(data.v);
      const value =
        type === "s"
          ? strings[Number(raw)]
          : type === "inlineStr"
            ? cellText(data.is)
            : raw;
      if (value === undefined || value.length > IMPORT_LIMITS.maxCellCharacters)
        throw new Error("A worksheet cell is invalid or too long.");
      output[column - 1] = plainEntities(value);
    }
    if (output.some((value) => value.trim())) cells.push(output);
  }
  assertNotCancelled(control.signal);
  return {
    cells,
    skippedFormulas,
    sheetName: String(sheet["@_name"] ?? "First worksheet"),
  };
}
