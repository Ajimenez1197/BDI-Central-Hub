/**
 * queries.js — SQL for the Central Hub reports.
 *
 * All queries are parameterized (@ClientID, @FYStart) — no string
 * interpolation of user input into SQL.
 */

import { getPool } from "./sql.js";
import { getAppealCodeLength } from "./client-config.js";
import sql from "mssql";

/**
 * Fetch the client roster for the Client dropdown.
 *
 * @param {string} [source] - "all" pulls the full roster from P_Clients as a
 *   flat array of Client_IDs (used by the Client Service Blue Book report, which
 *   queries historical data for any client). The default pulls production
 *   clients as objects ({ id, name, fyStart }) for the Digital reports.
 * @returns {Promise<({id:string, name:string, fyStart:number}[])|string[]>}
 */
export async function getClientList(source = "") {
  const pool = await getPool();

  if (source === "all") {
    const result = await pool.request().query(
      `SELECT DISTINCT Client_ID FROM P_Clients ORDER BY Client_ID`
    );
    return result.recordset.map((r) => r.Client_ID);
  }

  const result = await pool.request().query(`
    SELECT Client_ID, Name, FY_Month_Start
    FROM P_Clients
    WHERE Production = 1
    ORDER BY Client_ID
  `);
  return result.recordset.map((r) => ({
    id: r.Client_ID,
    name: r.Name,
    fyStart: r.FY_Month_Start,
  }));
}

/**
 * Fetch distinct Appeal ID prefixes for the Blue Book appeal dropdown.
 *
 * One row per appeal code (LEFT(Appeal_ID, N) where N is per-client). A single
 * code can span many campaigns/years, so we pick the most recent campaign name
 * as the label and sort codes by recency. Collapsing to one row per code
 * prevents duplicate <option> values in the UI dropdown.
 *
 * @param {string} clientId
 * @param {"backtest"|"test"|"match"} filterType
 */
export async function getAppealIds(clientId, filterType = "backtest") {
  const pool = await getPool();

  let whereClause;
  switch (filterType) {
    case "test":
    case "match":
      whereClause = "AND (Campaign_ID LIKE '%Test%' OR Campaign_ID LIKE '%Match Panel%')";
      break;
    default:
      whereClause = "AND Camp_Type = 'Cultivation'";
      break;
  }

  const codeLen = getAppealCodeLength(clientId);
  const result = await pool.request()
    .input("ClientID", sql.VarChar, clientId)
    .query(`
      SELECT AppealCode, CampaignName
      FROM (
        SELECT
          LEFT(Appeal_ID, ${codeLen}) AS AppealCode,
          Campaign_ID AS CampaignName,
          ROW_NUMBER() OVER (PARTITION BY LEFT(Appeal_ID, ${codeLen}) ORDER BY InHome_Date DESC) AS rn,
          MAX(InHome_Date) OVER (PARTITION BY LEFT(Appeal_ID, ${codeLen})) AS LastInHome
        FROM c_jobs
        WHERE Client_ID = @ClientID
          ${whereClause}
      ) t
      WHERE rn = 1
      ORDER BY LastInHome DESC
    `);

  return result.recordset;
}

/**
 * Look up a single production client. Returns null if the client does not
 * exist or is not flagged Production = 1 — used to validate the request.
 *
 * @param {string} clientId
 * @returns {Promise<{id:string, name:string, fyStart:number}|null>}
 */
export async function getProductionClient(clientId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ClientID", sql.NVarChar, clientId)
    .query(`
      SELECT Client_ID, Name, FY_Month_Start
      FROM P_Clients
      WHERE Production = 1 AND Client_ID = @ClientID
    `);
  const row = result.recordset[0];
  return row ? { id: row.Client_ID, name: row.Name, fyStart: row.FY_Month_Start } : null;
}

/**
 * New & Reactivated Donors report.
 *
 * A donor is "New" on their very first-ever gift (GiftRank = 1). A donor is
 * "Reactivated" when the current gift lands 3+ years after their previous
 * gift. Both flags are computed over the donor's *entire* gift history (the
 * window functions see all rows for the client); only the final aggregation
 * is limited to gifts from 2023-01-01 onward, so status is never mis-scored
 * by the reporting window.
 *
 * Two views share the same underlying logic and differ only in how rows are
 * bucketed:
 *   "monthly" → one row per calendar month (yyyy-MM)
 *   "fytd"    → one row per fiscal year, summing that FY's months. The fiscal
 *               year is labeled by its END calendar year (a FY that starts in
 *               month @FYStart of year Y is "FY{Y+1}"; a January-start client
 *               keeps FY = calendar year).
 *
 * @param {string} clientId
 * @param {"monthly"|"fytd"} view
 * @param {number} fyStart - P_Clients.FY_Month_Start (1-12), required for fytd
 * @returns {Promise<object[]>}
 */
export async function queryNewReactivated(clientId, view, fyStart) {
  const pool = await getPool();
  const isFytd = view === "fytd";

  // Fiscal-year END year for a gift date, given the client's start month.
  // Non-January starts roll into the next calendar year once the start month
  // is reached; a January start keeps FY aligned to the calendar year.
  const fyEndYear = `
    YEAR(DGH.CurrentGiftDate)
    + CASE WHEN MONTH(DGH.CurrentGiftDate) >= @FYStart AND @FYStart <> 1 THEN 1 ELSE 0 END`;

  const periodLabel = isFytd
    ? `'FY' + CAST((${fyEndYear}) AS VARCHAR(4))`
    : `FORMAT(DGH.CurrentGiftDate, 'yyyy-MM')`;

  // Integer/string key used only for ordering the output rows.
  const periodSort = isFytd ? `(${fyEndYear})` : `FORMAT(DGH.CurrentGiftDate, 'yyyy-MM')`;

  const request = pool.request().input("ClientID", sql.NVarChar, clientId);
  if (isFytd) request.input("FYStart", sql.Int, fyStart);

  const result = await request.query(`
    WITH RankedGifts AS (
      SELECT
        G.DONOR_ID,
        G.CLIENT_ID,
        G.GIFT_DATE,
        G.CHANNEL,
        G.AMOUNT,
        ROW_NUMBER() OVER (PARTITION BY G.DONOR_ID ORDER BY G.GIFT_DATE ASC)  AS GiftRank,
        ROW_NUMBER() OVER (PARTITION BY G.DONOR_ID ORDER BY G.GIFT_DATE DESC) AS ReverseRank
      FROM Gifts G
      WHERE G.CLIENT_ID = @ClientID
    ),
    DonorGiftHistory AS (
      SELECT
        RG.DONOR_ID,
        RG.CLIENT_ID,
        RG.GIFT_DATE AS CurrentGiftDate,
        RG.CHANNEL,
        RG.AMOUNT,
        RG.GiftRank,
        LAG(RG.GIFT_DATE) OVER (PARTITION BY RG.DONOR_ID ORDER BY RG.GIFT_DATE ASC) AS PreviousGiftDate
      FROM RankedGifts RG
    ),
    NewAndReactivatedDonors AS (
      SELECT
        ${periodLabel} AS Period,
        ${periodSort}  AS PeriodSort,
        DGH.CHANNEL,
        DGH.AMOUNT,
        CASE WHEN DGH.GiftRank = 1 THEN 1 ELSE 0 END AS IsNewDonor,
        CASE
          WHEN DGH.PreviousGiftDate IS NOT NULL
               AND DGH.CurrentGiftDate >= DATEADD(YEAR, 3, DGH.PreviousGiftDate)
          THEN 1 ELSE 0
        END AS IsReactivatedDonor
      FROM DonorGiftHistory DGH
      WHERE DGH.CurrentGiftDate >= '2023-01-01'
    )
    SELECT
      Period,
      SUM(CASE WHEN IsNewDonor = 1         AND CHANNEL = 'Online'  THEN 1      ELSE 0 END) AS NewDonorsOnline,
      SUM(CASE WHEN IsNewDonor = 1         AND CHANNEL = 'Offline' THEN 1      ELSE 0 END) AS NewDonorsPrint,
      SUM(CASE WHEN IsReactivatedDonor = 1 AND CHANNEL = 'Online'  THEN 1      ELSE 0 END) AS ReactivatedDonorsOnline,
      SUM(CASE WHEN IsReactivatedDonor = 1 AND CHANNEL = 'Offline' THEN 1      ELSE 0 END) AS ReactivatedDonorsPrint,
      SUM(CASE WHEN IsNewDonor = 1         AND CHANNEL = 'Online'  THEN AMOUNT ELSE 0 END) AS NewDonorFirstGiftTotalOnline,
      SUM(CASE WHEN IsNewDonor = 1         AND CHANNEL = 'Offline' THEN AMOUNT ELSE 0 END) AS NewDonorFirstGiftTotalPrint,
      SUM(CASE WHEN IsReactivatedDonor = 1 AND CHANNEL = 'Online'  THEN AMOUNT ELSE 0 END) AS ReactivatedFirstGiftTotalOnline,
      SUM(CASE WHEN IsReactivatedDonor = 1 AND CHANNEL = 'Offline' THEN AMOUNT ELSE 0 END) AS ReactivatedFirstGiftTotalPrint
    FROM NewAndReactivatedDonors
    GROUP BY Period, PeriodSort
    ORDER BY PeriodSort;
  `);

  return result.recordset;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Donor Pyramid (Client Service tab)
 * ───────────────────────────────────────────────────────────────────────── */

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the [start, end] gift-date window for a giving period. `end` is
 * always today; `start` depends on the mode:
 *   "cy"        → January 1 of the current calendar year
 *   "rolling12" → the same day, 12 months ago (trailing year)
 *   "fytd"      → the client's fiscal-year start (needs fyStart, 1-12)
 *
 * @param {"cy"|"rolling12"|"fytd"} period
 * @param {number} [fyStart] - P_Clients.FY_Month_Start, required for "fytd"
 * @param {Date}   [now]
 * @returns {{ start:string, end:string, mode:string, label:string }}
 */
export function resolveWindow(period, fyStart, now = new Date()) {
  const end = isoDate(now);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12

  if (period === "rolling12") {
    const s = new Date(Date.UTC(year - 1, now.getUTCMonth(), now.getUTCDate()));
    return { start: isoDate(s), end, mode: period, label: "Rolling 12 months" };
  }
  if (period === "fytd") {
    const startYear = month >= fyStart ? year : year - 1;
    const s = new Date(Date.UTC(startYear, fyStart - 1, 1));
    return { start: isoDate(s), end, mode: period, label: "Fiscal year to date" };
  }
  // default: calendar year to date
  return { start: `${year}-01-01`, end, mode: "cy", label: `Calendar year ${year}` };
}

// Bucket sums shared by both pyramid queries. Assumes a derived table `DT`
// with one row per donor carrying a numeric `Total`. Tiers:
//   Mass   $0.01–999.99   (Total < 1000, with Total >= 0.01 enforced upstream)
//   Middle $1,000–9,999.99
//   Major  $10,000+
const PYRAMID_BUCKET_SUMS = `
      SUM(CASE WHEN Total < 1000                    THEN 1     ELSE 0 END) AS MassDonors,
      SUM(CASE WHEN Total >= 1000 AND Total < 10000 THEN 1     ELSE 0 END) AS MiddleDonors,
      SUM(CASE WHEN Total >= 10000                  THEN 1     ELSE 0 END) AS MajorDonors,
      SUM(CASE WHEN Total < 1000                    THEN Total ELSE 0 END) AS MassRevenue,
      SUM(CASE WHEN Total >= 1000 AND Total < 10000 THEN Total ELSE 0 END) AS MiddleRevenue,
      SUM(CASE WHEN Total >= 10000                  THEN Total ELSE 0 END) AS MajorRevenue`;

// Shape the flat bucket row into structured tiers plus totals.
function normalizeBuckets(row) {
  const num = (v) => Number(v) || 0;
  const buckets = {
    mass:   { donors: num(row.MassDonors),   revenue: num(row.MassRevenue) },
    middle: { donors: num(row.MiddleDonors), revenue: num(row.MiddleRevenue) },
    major:  { donors: num(row.MajorDonors),  revenue: num(row.MajorRevenue) },
  };
  return {
    buckets,
    totalDonors: buckets.mass.donors + buckets.middle.donors + buckets.major.donors,
    totalRevenue: buckets.mass.revenue + buckets.middle.revenue + buckets.major.revenue,
  };
}

/**
 * Donor Pyramid — bucket a single client's donors by cumulative giving in the
 * window, returning donor counts and revenue per tier (Mass/Middle/Major).
 * Donors whose net giving in the window is <= 0 are excluded (HAVING >= 0.01).
 */
export async function queryDonorPyramid(clientId, start, end) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ClientID", sql.NVarChar, clientId)
    .input("Start", sql.Date, start)
    .input("End", sql.Date, end)
    .query(`
      SELECT ${PYRAMID_BUCKET_SUMS}
      FROM (
        SELECT DONOR_ID, SUM(AMOUNT) AS Total
        FROM Gifts
        WHERE CLIENT_ID = @ClientID
          AND GIFT_DATE >= @Start AND GIFT_DATE <= @End
        GROUP BY DONOR_ID
        HAVING SUM(AMOUNT) >= 0.01
      ) DT
    `);
  return normalizeBuckets(result.recordset[0] || {});
}

/**
 * Donor Pyramid benchmark — the same tiering pooled across every
 * Production = 1 client (each donor bucketed by their giving to each client,
 * so the same person at two clients is two records). For "fytd" each client
 * uses its own fiscal-year start; "cy"/"rolling12" share the single window
 * from resolveWindow. @End carries today, which also drives the fiscal math.
 */
export async function queryDonorPyramidBenchmark(period, start, end) {
  const pool = await getPool();
  const isFytd = period === "fytd";

  // Per-client fiscal-year start date, else the shared calendar-window start.
  const startExpr = isFytd
    ? `DATEFROMPARTS(
           YEAR(@End) - CASE WHEN MONTH(@End) >= P.FY_Month_Start THEN 0 ELSE 1 END,
           P.FY_Month_Start, 1)`
    : `@Start`;

  const request = pool.request().input("End", sql.Date, end);
  if (!isFytd) request.input("Start", sql.Date, start);

  const result = await request.query(`
    SELECT
      ${PYRAMID_BUCKET_SUMS},
      (SELECT COUNT(*) FROM P_Clients WHERE Production = 1) AS ClientCount
    FROM (
      SELECT G.CLIENT_ID, G.DONOR_ID, SUM(G.AMOUNT) AS Total
      FROM Gifts G
      JOIN P_Clients P
        ON P.Client_ID = G.CLIENT_ID AND P.Production = 1
      WHERE G.GIFT_DATE >= ${startExpr} AND G.GIFT_DATE <= @End
      GROUP BY G.CLIENT_ID, G.DONOR_ID
      HAVING SUM(G.AMOUNT) >= 0.01
    ) DT
  `);

  const row = result.recordset[0] || {};
  return { ...normalizeBuckets(row), clientCount: Number(row.ClientCount) || 0 };
}
