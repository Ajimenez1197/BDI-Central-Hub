/**
 * blue-books.js — Blue Book response-rate / ROI per RFM_ID for one appeal.
 *
 * POST /api/blue-books
 * Body: { clientId, appealCode }
 * Returns: { status, clientId, appealCode, rows, totals, cpm }
 */

import { app } from "@azure/functions";
import { queryBlueBook } from "../lib/blue-books-queries.js";
import { buildBlueBookWorkbook } from "../lib/blue-books-excel.js";
import { uploadBlob, getSasUrl } from "../lib/blob.js";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Blob path segment must be safe (client IDs are alphanumeric; codes may vary).
const safeSeg = (v) => String(v).replace(/[^A-Za-z0-9._-]/g, "_");

app.http("blue-books", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "blue-books",
  handler: async (request, context) => {
    context.log("Blue Books query triggered");

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Invalid JSON body" } };
    }

    const { clientId, appealCode } = body;
    if (!clientId || !appealCode) {
      return { status: 400, jsonBody: { error: "clientId and appealCode are required." } };
    }

    try {
      context.log(`Running Blue Book for ${clientId} / ${appealCode}...`);
      const result = await queryBlueBook(clientId, appealCode);

      // Build the styled Excel workbook and stash it in blob for download.
      const wbBuffer = await buildBlueBookWorkbook({
        clientId,
        appealCode,
        campaignId: result.campaignId,
        rows: result.rows,
        totals: result.totals,
      });
      const blobPath = `blue-books/${safeSeg(clientId)}/BlueBook_${safeSeg(clientId)}_${safeSeg(appealCode)}.xlsx`;
      await uploadBlob(blobPath, wbBuffer, XLSX_CONTENT_TYPE);
      const downloadUrl = await getSasUrl(blobPath, 120);

      return {
        status: 200,
        jsonBody: { status: "success", clientId, appealCode, ...result, downloadUrl },
      };
    } catch (err) {
      context.error("Blue Books query failed:", err);
      return { status: 500, jsonBody: { error: "Query failed", detail: err.message } };
    }
  },
});
