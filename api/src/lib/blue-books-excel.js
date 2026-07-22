/**
 * blue-books-excel.js — Render a Blue Book result set to a styled .xlsx.
 *
 * Uses exceljs (not the community `xlsx`, which can't write cell fills) so that:
 *   - Revenue / Cost are real numbers with a thousands number format
 *   - Response % is a real Excel percentage (stored as a fraction, "0.00%")
 *   - ROI cells are shaded by value: >=1 green, 0<roi<1 yellow, <=0 red
 *
 * The ROI shading uses light fills with dark text (Excel's standard
 * good/neutral/bad palette) so the numeric value stays fully legible.
 */

import ExcelJS from "exceljs";

// [fill argb, font argb] — light background + dark text, values stay readable.
const ROI_GREEN = ["FFC6EFCE", "FF006100"];
const ROI_YELLOW = ["FFFFEB9C", "FF9C6500"];
const ROI_RED = ["FFFFC7CE", "FF9C0006"];

function roiColors(roi) {
  if (roi == null) return null;
  if (roi > 1) return ROI_GREEN;       // strictly above 1
  if (roi > 0) return ROI_YELLOW;      // 0 < roi <= 1 (1.0 is yellow)
  return ROI_RED;
}

const COLUMNS = [
  { header: "Client_ID", key: "Client_ID", width: 12 },
  { header: "Campaign_ID", key: "Campaign_ID", width: 30 },
  { header: "RFM_ID", key: "RFM_ID", width: 12 },
  { header: "Mailed", key: "Mailed", width: 12, numFmt: "#,##0" },
  { header: "Responses", key: "Responses", width: 12, numFmt: "#,##0" },
  { header: "Response %", key: "ResponsePct", width: 12, numFmt: "0.00%" },
  { header: "Revenue", key: "Revenue", width: 14, numFmt: "#,##0.00" },
  { header: "Cost", key: "Cost", width: 14, numFmt: "#,##0.00" },
  { header: "ROI", key: "ROI", width: 10, numFmt: "0.00" },
];

/**
 * @param {{clientId:string, appealCode:string, campaignId:string,
 *          rows:object[], totals:object|null}} data
 * @returns {Promise<Buffer>}
 */
export async function buildBlueBookWorkbook({ rows, totals }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Blue Book");
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  // Header styling
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBBBBBB" } } };
  });

  const addRow = (r, isTotal = false) => {
    const pct = r["Response %"];
    const row = ws.addRow({
      Client_ID: r.Client_ID ?? "",
      Campaign_ID: r.Campaign_ID ?? "",
      RFM_ID: r.RFM_ID,
      Mailed: r.Mailed,
      Responses: r.Responses,
      // Store as a fraction so Excel's "0.00%" format renders a true percentage.
      ResponsePct: pct == null ? null : pct / 100,
      Revenue: r.Revenue,
      Cost: r.Cost,
      ROI: r.ROI,
    });

    for (const c of COLUMNS) {
      if (c.numFmt) row.getCell(c.key).numFmt = c.numFmt;
    }

    // ROI conditional shading (value stays dark-on-light, never washed out)
    const colors = roiColors(r.ROI);
    if (colors) {
      const [fill, font] = colors;
      const roiCell = row.getCell("ROI");
      roiCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      roiCell.font = { color: { argb: font }, bold: isTotal };
    }

    if (isTotal) {
      row.eachCell((cell) => {
        cell.font = { ...(cell.font || {}), bold: true };
        cell.border = { ...(cell.border || {}), top: { style: "thin", color: { argb: "FF999999" } } };
      });
    }
    return row;
  };

  for (const r of rows) addRow(r);
  if (totals) addRow(totals, true);

  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
