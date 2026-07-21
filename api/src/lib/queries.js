/**
 * queries.js — SQL for the Central Hub reports.
 *
 * All queries are parameterized (@ClientID, @FYStart) — no string
 * interpolation of user input into SQL.
 */

import { getPool } from "./sql.js";
import sql from "mssql";

/**
 * Fetch the production-client roster for the Client dropdown.
 * Only clients flagged Production = 1 in P_Clients are returned.
 * FY_Month_Start comes along so the caller can label fiscal years.
 *
 * @returns {Promise<{id:string, name:string, fyStart:number}[]>}
 */
export async function getClientList() {
  const pool = await getPool();
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
