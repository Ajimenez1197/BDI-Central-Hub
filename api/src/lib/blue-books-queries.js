/**
 * blue-books-queries.js — "Blue Book" response-rate / ROI per RFM_ID for one appeal.
 *
 * For a selected client + appeal code (LEFT(Appeal_ID, N) as surfaced by
 * getAppealIds() from c_jobs), this computes per RFM segment:
 *
 *   Mailed      ← d_MailQuantity.Mail_Quantity, summed per RFM_ID
 *   Responses   ← Gifts rows whose direct (Appeal_ID / RFM_ID) OR matchback
 *                 (Appeal_ID_Match / RFM_ID_Match) appeal matches the code,
 *                 attributed to the direct RFM_ID when present, else RFM_ID_Match
 *   Revenue     ← SUM(Amount) of those responding gifts
 *   Response %  = Responses / Mailed * 100
 *   Cost        = (Package_CPM + Postage_CPM) / 1000 * Mailed   (CPM = cost per thousand)
 *   ROI         = Revenue / Cost   (dollars returned per dollar spent)
 *
 * The appeal is matched with `col LIKE @Code + '%'` (SARGable prefix seek) rather
 * than LEFT(col, N) = @Code, mirroring the optimization in queries.js.
 */

import { getPool } from "./sql.js";
import { getAppealCodeLength } from "./client-config.js";
import sql from "mssql";

function round2(v) {
  if (v === null || v === undefined) return null;
  return Math.round(v * 100) / 100;
}

/**
 * @param {string} clientId
 * @param {string} appealCode - the LEFT(Appeal_ID, N) code from the c_jobs dropdown
 * @returns {Promise<{rows: object[], totals: object, cpm: {package:number, postage:number}}>}
 */
export async function queryBlueBook(clientId, appealCode) {
  const pool = await getPool();
  const codeLen = getAppealCodeLength(clientId);
  const code = String(appealCode).trim().substring(0, codeLen);

  if (!code) {
    throw new Error("A valid appeal code is required.");
  }

  // ── 1) Mailed per RFM_ID (pre-aggregated rollup) ───────────────────────────
  const mailedRes = await pool.request()
    .input("ClientID", sql.VarChar, clientId)
    .input("Code", sql.VarChar, code)
    .query(`
      SELECT RFM_ID, SUM(Mail_Quantity) AS Mailed
      FROM d_MailQuantity
      WHERE Client_ID = @ClientID
        AND Appeal_ID LIKE @Code + '%'
      GROUP BY RFM_ID
    `);

  // ── 2) Responses + revenue per RFM_ID (direct OR matchback) ────────────────
  // A gift counts once. If its direct appeal matches, it's attributed to RFM_ID;
  // otherwise (matchback-only match) it's attributed to RFM_ID_Match.
  const respRes = await pool.request()
    .input("ClientID", sql.VarChar, clientId)
    .input("Code", sql.VarChar, code)
    .query(`
      SELECT
        CASE WHEN Appeal_ID LIKE @Code + '%' THEN RFM_ID ELSE RFM_ID_Match END AS RFM_ID,
        COUNT(Amount) AS Responses,
        SUM(Amount)   AS Revenue
      FROM Gifts
      WHERE Client_ID = @ClientID
        AND Amount > 0
        AND (Appeal_ID LIKE @Code + '%' OR Appeal_ID_Match LIKE @Code + '%')
      GROUP BY CASE WHEN Appeal_ID LIKE @Code + '%' THEN RFM_ID ELSE RFM_ID_Match END
    `);

  // ── 3) Job context — CPM + campaign name (most recent job row for the code) ─
  const jobRes = await pool.request()
    .input("ClientID", sql.VarChar, clientId)
    .input("Code", sql.VarChar, code)
    .query(`
      SELECT TOP 1
        Campaign_ID,
        ISNULL(Package_CPM, 0) AS Package_CPM,
        ISNULL(Postage_CPM, 0) AS Postage_CPM
      FROM c_jobs
      WHERE Client_ID = @ClientID
        AND Appeal_ID LIKE @Code + '%'
      ORDER BY InHome_Date DESC
    `);

  const jobRow = jobRes.recordset[0] || { Campaign_ID: "", Package_CPM: 0, Postage_CPM: 0 };
  const campaignId = jobRow.Campaign_ID || "";
  const packageCpm = Number(jobRow.Package_CPM) || 0;
  const postageCpm = Number(jobRow.Postage_CPM) || 0;
  const totalCpm = packageCpm + postageCpm;

  // ── Merge per RFM_ID ───────────────────────────────────────────────────────
  const map = new Map();
  const getRow = (id) => {
    const key = id == null || id === "" ? "(none)" : id;
    if (!map.has(key)) map.set(key, { RFM_ID: key, Mailed: 0, Responses: 0, Revenue: 0 });
    return map.get(key);
  };

  for (const r of mailedRes.recordset) getRow(r.RFM_ID).Mailed += Number(r.Mailed) || 0;
  for (const r of respRes.recordset) {
    const row = getRow(r.RFM_ID);
    row.Responses += Number(r.Responses) || 0;
    row.Revenue += Number(r.Revenue) || 0;
  }

  const build = (r) => {
    const cost = (totalCpm / 1000) * r.Mailed;
    return {
      Client_ID: clientId,
      Campaign_ID: campaignId,
      RFM_ID: r.RFM_ID,
      Mailed: r.Mailed,
      Responses: r.Responses,
      "Response %": r.Mailed > 0 ? round2((r.Responses / r.Mailed) * 100) : 0,
      Revenue: round2(r.Revenue),
      Cost: round2(cost),
      ROI: cost > 0 ? round2(r.Revenue / cost) : null,
    };
  };

  const rows = [...map.values()]
    .map(build)
    // RFM_ID descending; numeric-aware so e.g. "10" sorts above "9"
    .sort((a, b) => String(b.RFM_ID).localeCompare(String(a.RFM_ID), undefined, { numeric: true }));

  // ── Grand total row (from raw accumulators, not rounded per-row values) ─────
  const acc = [...map.values()].reduce(
    (t, r) => {
      t.Mailed += r.Mailed;
      t.Responses += r.Responses;
      t.Revenue += r.Revenue;
      return t;
    },
    { Mailed: 0, Responses: 0, Revenue: 0 }
  );
  const totalCost = (totalCpm / 1000) * acc.Mailed;
  const totals = {
    Client_ID: "",
    Campaign_ID: "",
    RFM_ID: "TOTAL",
    Mailed: acc.Mailed,
    Responses: acc.Responses,
    "Response %": acc.Mailed > 0 ? round2((acc.Responses / acc.Mailed) * 100) : 0,
    Revenue: round2(acc.Revenue),
    Cost: round2(totalCost),
    ROI: totalCost > 0 ? round2(acc.Revenue / totalCost) : null,
  };

  return { rows, totals, campaignId, cpm: { package: packageCpm, postage: postageCpm } };
}
