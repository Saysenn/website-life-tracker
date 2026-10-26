import { cellText, EXPORT_COLORS, exportStamp, STATUS_COLORS } from "./export";
import { plural } from "./utils";

const INK = "1E1B16";
const MUTED = "8C8274";
const HAIRLINE = "ECE6DC";
const ZEBRA = "FCFAF6";

const hex = (value) => [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));

const columnsOf = (sections) =>
  sections.flatMap((section) => section.columns.map((column) => ({ ...column, section })));

function sheetNames(sheets) {
  const used = new Set();
  return sheets.map(({ name }) => {
    const base = name.replace(/[\\/?*:[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
    let candidate = base;
    for (let index = 2; used.has(candidate.toLowerCase()); index += 1) {
      candidate = `${base.slice(0, 31 - String(index).length - 1)} ${index}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export async function buildXlsx({ today, sheets }, sections, colors) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Life Tracker";
  book.created = new Date();

  const columns = columnsOf(sections);
  const names = sheetNames(sheets);
  const hairline = { style: "thin", color: { argb: `FF${HAIRLINE}` } };

  sheets.forEach((sheet, sheetIndex) => {
    const ws = book.addWorksheet(names[sheetIndex], {
      views: [{ state: "frozen", ySplit: 5, xSplit: 1, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    ws.columns = columns.map((column) => ({ key: column.key, width: column.width }));

    const title = ws.getCell(1, 1);
    title.value = sheet.name;
    title.font = { name: "Calibri", size: 15, bold: true, color: { argb: `FF${INK}` } };
    ws.getRow(1).height = 24;

    const subtitle = ws.getCell(2, 1);
    subtitle.value = `${plural(sheet.rows.length, "company", "companies")} · Exported ${exportStamp(today)}`;
    subtitle.font = { name: "Calibri", size: 9, color: { argb: `FF${MUTED}` } };

    let from = 1;
    for (const section of sections) {
      const tone = EXPORT_COLORS[colors[section.key]] ?? EXPORT_COLORS.sand;
      const to = from + section.columns.length - 1;
      if (to > from) ws.mergeCells(4, from, 4, to);
      const band = ws.getCell(4, from);
      band.value = section.label.toUpperCase();
      band.font = { name: "Calibri", size: 8, bold: true, color: { argb: `FF${tone.accent}` } };
      band.alignment = { vertical: "middle", indent: 1 };
      for (let col = from; col <= to; col += 1) {
        ws.getCell(4, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${tone.fill}` } };
        const head = ws.getCell(5, col);
        head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${tone.fill}` } };
        head.border = { bottom: { style: "thin", color: { argb: `FF${tone.accent}` } } };
      }
      from = to + 1;
    }
    ws.getRow(4).height = 18;

    const header = ws.getRow(5);
    columns.forEach((column, index) => {
      const cell = header.getCell(index + 1);
      cell.value = column.label;
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: `FF${INK}` } };
      cell.alignment = { vertical: "middle", indent: 1 };
    });
    header.height = 22;

    sheet.rows.forEach((data, rowIndex) => {
      const row = ws.getRow(6 + rowIndex);
      row.height = 19;
      columns.forEach((column, index) => {
        const cell = row.getCell(index + 1);
        const value = data[column.key];
        cell.value = column.type === "date" && value ? new Date(`${value}T00:00:00Z`) : cellText(column, value);
        if (column.type === "date") cell.numFmt = "d mmm yyyy";

        const color =
          column.type === "status" ? STATUS_COLORS[value?.key] : column.key === "name" ? INK : column.type === "date" ? INK : "5A5349";
        cell.font = {
          name: column.type === "secret" ? "Consolas" : "Calibri",
          size: 10,
          bold: column.key === "name",
          color: { argb: `FF${color ?? INK}` },
        };
        cell.alignment = { vertical: "middle", indent: 1, wrapText: column.key === "notes" };
        cell.border = { bottom: hairline };
        if (rowIndex % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ZEBRA}` } };
      });
    });

    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + sheet.rows.length, column: columns.length } };
  });

  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function buildPdf({ today, sheets }, sections, colors) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const columns = columnsOf(sections);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: columns.length > 13 ? "a3" : "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 32;
  const toneOf = (section) => EXPORT_COLORS[colors[section.key]] ?? EXPORT_COLORS.sand;
  const titles = [];

  sheets.forEach((sheet, index) => {
    if (index > 0) doc.addPage();
    const first = doc.getNumberOfPages();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...hex(INK));
    doc.text(sheet.name, margin, margin + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...hex(MUTED));
    doc.text(`${plural(sheet.rows.length, "company", "companies")} · Exported ${exportStamp(today)}`, margin, margin + 24);

    autoTable(doc, {
      startY: margin + 38,
      margin: { left: margin, right: margin, bottom: margin + 6 },
      theme: "plain",
      tableWidth: width - margin * 2,
      head: [
        sections.map((section) => ({
          content: section.label.toUpperCase(),
          colSpan: section.columns.length,
          styles: {
            fillColor: hex(toneOf(section).fill),
            textColor: hex(toneOf(section).accent),
            fontSize: 6.5,
            fontStyle: "bold",
            lineWidth: 0,
            cellPadding: { top: 5, bottom: 2, left: 5, right: 5 },
          },
        })),
        columns.map((column) => ({
          content: column.label,
          styles: {
            fillColor: hex(toneOf(column.section).fill),
            lineColor: hex(toneOf(column.section).accent),
            lineWidth: { bottom: 0.6 },
          },
        })),
      ],
      body: sheet.rows.map((data) => columns.map((column) => cellText(column, data[column.key]))),
      styles: {
        font: "helvetica",
        fontSize: columns.length > 13 ? 7.5 : 8,
        textColor: hex("5A5349"),
        cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
        lineColor: hex(HAIRLINE),
        lineWidth: { bottom: 0.4 },
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: { fontStyle: "bold", textColor: hex(INK), fontSize: columns.length > 13 ? 7.5 : 8 },
      alternateRowStyles: { fillColor: hex(ZEBRA) },
      columnStyles: Object.fromEntries(
        columns.map((column, position) => [position, { cellWidth: column.type === "secret" || column.key === "notes" ? "wrap" : "auto" }]),
      ),
      didParseCell({ section, column, cell, row }) {
        if (section !== "body") return;
        const def = columns[column.index];
        if (def.key === "name") Object.assign(cell.styles, { textColor: hex(INK), fontStyle: "bold" });
        if (def.type === "date") cell.styles.textColor = hex(INK);
        if (def.type === "secret") Object.assign(cell.styles, { font: "courier", textColor: hex(INK) });
        if (def.type === "status") {
          const status = sheet.rows[row.index][def.key]?.key;
          Object.assign(cell.styles, { textColor: hex(STATUS_COLORS[status] ?? MUTED), fontStyle: "bold" });
        }
      },
    });

    for (let page = first; page <= doc.getNumberOfPages(); page += 1) titles[page] = sheet.name;
  });

  const total = doc.getNumberOfPages();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...hex(MUTED));
    doc.text(titles[page] ?? "", margin, height - margin + 10);
    doc.text(`Page ${page} of ${total}`, width - margin, height - margin + 10, { align: "right" });
  }

  return doc.output("blob");
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
