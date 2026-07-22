/**
 * qbr-queries.js — SQL for the Quarterly Business Report (Client Service tab).
 *
 * Recreates the client's R Markdown QBR as live queries against the production
 * Gifts / c_jobs tables. All six report sections are computed here and assembled
 * by getQbrData().
 *
 * FYTD windowing (mirrors the R report exactly):
 *   • "As-of" date = the client's most recent gift (MAX(GIFT_DATE)).
 *   • day_index = days elapsed from the as-of fiscal-year's start to the as-of date.
 *   • For every fiscal year shown, the same [FY_Start, FY_Start + day_index] window
 *     is applied, so each year is compared through the same relative point.
 *
 * Client input is always parameterized (@ClientID). Date boundaries and the
 * channel-classification lists are computed/held server-side (never user input)
 * and inlined as literals.
 */

import { getPool } from "./sql.js";
import { buildChannelCaseSql, hasChannelConfig, getChannelOrder } from "./qbr-config.js";
import sql from "mssql";

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (UTC-based to avoid timezone drift in date-only math)
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86400000;

/** Format a Date as 'YYYY-MM-DD'. */
function fmt(d) {
  return d.toISOString().slice(0, 10);
}

/** Parse 'YYYY-MM-DD' (or ISO) to a UTC midnight Date. */
function parseDate(s) {
  const str = typeof s === "string" ? s.slice(0, 10) : fmt(new Date(s));
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(d, n) {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Fiscal-year END year for a date, given the FY start month (1-12).
 * Non-January starts roll into the next calendar year once the start month is
 * reached (Oct 2025 → FY2026); a January start keeps FY = calendar year.
 */
function fyEndYear(date, fyStart) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return fyStart !== 1 && m >= fyStart ? y + 1 : y;
}

/** Fiscal-year start date for a given FY end-year and start month. */
function fyStartDate(fye, fyStart) {
  const startYear = fyStart !== 1 ? fye - 1 : fye;
  return new Date(Date.UTC(startYear, fyStart - 1, 1));
}

/** Two-digit FY label, e.g. FY end-year 2026 → "FYTD26". */
function fyLabel(fye) {
  return `FYTD${String(fye).slice(-2)}`;
}

/**
 * Build the FYTD comparison windows: the last `count` fiscal years through the
 * as-of date, each covering the same day-index window from its FY start.
 */
function buildWindows(asOf, fyStart, count) {
  const cutoffFye = fyEndYear(asOf, fyStart);
  const dayIndex = daysBetween(fyStartDate(cutoffFye, fyStart), asOf);
  const windows = [];
  for (let fye = cutoffFye - (count - 1); fye <= cutoffFye; fye++) {
    const start = fyStartDate(fye, fyStart);
    windows.push({
      fye,
      label: fyLabel(fye),
      start,
      end: addDays(start, dayIndex),
    });
  }
  return { windows, cutoffFye, dayIndex };
}

/** Render windows as a SQL derived table: <alias>(FYStart, FYEnd, FYE, FYLabel). */
function windowsValuesSql(windows, alias = "W") {
  const rows = windows.map(
    (w, i) =>
      i === 0
        ? `(CAST('${fmt(w.start)}' AS date), CAST('${fmt(w.end)}' AS date), ${w.fye}, '${w.label}')`
        : `('${fmt(w.start)}', '${fmt(w.end)}', ${w.fye}, '${w.label}')`
  );
  return `(VALUES\n      ${rows.join(",\n      ")}\n    ) AS ${alias}(FYStart, FYEnd, FYE, FYLabel)`;
}

/**
 * Render the PRIOR fiscal year of each window as a derived table:
 * <alias>(FYE, PriorStart, PriorEnd). The prior year of window FYE runs the full
 * fiscal year ending the day before that window's FY started — used to detect
 * lapsed (reactivated) donors set-based, without a correlated subquery.
 */
function priorWindowsValuesSql(windows, alias = "P") {
  const rows = windows.map((w, i) => {
    const priorStart = new Date(Date.UTC(w.start.getUTCFullYear() - 1, w.start.getUTCMonth(), 1));
    const priorEnd = addDays(w.start, -1);
    return i === 0
      ? `(${w.fye}, CAST('${fmt(priorStart)}' AS date), CAST('${fmt(priorEnd)}' AS date))`
      : `(${w.fye}, '${fmt(priorStart)}', '${fmt(priorEnd)}')`;
  });
  return `(VALUES\n      ${rows.join(",\n      ")}\n    ) AS ${alias}(FYE, PriorStart, PriorEnd)`;
}

/**
 * Per-(donor, FY window) flag set, aliased `x`, with columns:
 *   DONOR_ID, FYE, FYLabel, FYStart, FYEnd,
 *   IsNew     — 1 if the donor's first-ever gift falls in this window,
 *   PriorDonor — non-null if the donor also gave in the prior fiscal year.
 *
 * A donor is "reactivated" for a window when IsNew = 0 AND PriorDonor IS NULL
 * (gave this window, not brand-new, and skipped the entire prior fiscal year).
 * Written set-based (joins, not correlated EXISTS) so it scales to ~1M gifts.
 */
function donorWindowFlagsSql(windows) {
  return `(
      SELECT dw.DONOR_ID, dw.FYE, dw.FYLabel, dw.FYStart, dw.FYEnd,
             CASE WHEN fg.FirstDate BETWEEN dw.FYStart AND dw.FYEnd THEN 1 ELSE 0 END AS IsNew,
             pg.DONOR_ID AS PriorDonor
      FROM (
        SELECT DISTINCT g.DONOR_ID, W.FYE, W.FYLabel, W.FYStart, W.FYEnd
        FROM Gifts g
        JOIN ${windowsValuesSql(windows, "W")} ON g.GIFT_DATE BETWEEN W.FYStart AND W.FYEnd
        WHERE g.CLIENT_ID = @ClientID
      ) dw
      JOIN (
        SELECT DONOR_ID, MIN(GIFT_DATE) AS FirstDate
        FROM Gifts WHERE CLIENT_ID = @ClientID GROUP BY DONOR_ID
      ) fg ON fg.DONOR_ID = dw.DONOR_ID
      LEFT JOIN (
        SELECT DISTINCT g.DONOR_ID, P.FYE
        FROM Gifts g
        JOIN ${priorWindowsValuesSql(windows, "P")} ON g.GIFT_DATE BETWEEN P.PriorStart AND P.PriorEnd
        WHERE g.CLIENT_ID = @ClientID
      ) pg ON pg.DONOR_ID = dw.DONOR_ID AND pg.FYE = dw.FYE
    ) x`;
}

function req(pool, clientId) {
  return pool.request().input("ClientID", sql.NVarChar, clientId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — FYTD Metrics: revenue total, <10k / 10k+ split, unique donors
// ─────────────────────────────────────────────────────────────────────────────

async function queryFytdMetrics(pool, clientId, windows) {
  const result = await req(pool, clientId).query(`
    SELECT
      W.FYE, W.FYLabel,
      SUM(G.AMOUNT)                                              AS TotalRevenue,
      SUM(CASE WHEN G.AMOUNT >= 10000 THEN G.AMOUNT ELSE 0 END)  AS Rev10kPlus,
      SUM(CASE WHEN G.AMOUNT <  10000 THEN G.AMOUNT ELSE 0 END)  AS RevUnder10k,
      COUNT(DISTINCT G.DONOR_ID)                                 AS UniqueDonors
    FROM Gifts G
    JOIN ${windowsValuesSql(windows, "W")} ON G.GIFT_DATE BETWEEN W.FYStart AND W.FYEnd
    WHERE G.CLIENT_ID = @ClientID
    GROUP BY W.FYE, W.FYLabel
    ORDER BY W.FYE;
  `);
  return result.recordset.map((r) => ({
    fy: r.FYLabel,
    totalRevenue: Number(r.TotalRevenue) || 0,
    rev10kPlus: Number(r.Rev10kPlus) || 0,
    revUnder10k: Number(r.RevUnder10k) || 0,
    uniqueDonors: Number(r.UniqueDonors) || 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Campaign Revenue Sandchart (current FY, biweekly by Campaign_ID)
// ─────────────────────────────────────────────────────────────────────────────

async function querySandchart(pool, clientId, fyStartOfCurrent, asOf) {
  const start = fmt(fyStartOfCurrent);
  const end = fmt(asOf);

  // One Campaign_ID per Appeal_ID (most recent job wins) → avoids fan-out.
  const result = await req(pool, clientId).query(`
    WITH JobMap AS (
      SELECT Appeal_ID, Campaign_ID FROM (
        SELECT Appeal_ID, Campaign_ID,
               ROW_NUMBER() OVER (PARTITION BY Appeal_ID ORDER BY InHome_Date DESC) AS rn
        FROM c_jobs
        WHERE Client_ID = @ClientID AND Appeal_ID IS NOT NULL
      ) t WHERE rn = 1
    ),
    G AS (
      SELECT
        DATEADD(DAY, (DATEDIFF(DAY, CAST('${start}' AS date), g.GIFT_DATE) / 14) * 14,
                CAST('${start}' AS date)) AS BiWeek,
        jm.Campaign_ID,
        g.AMOUNT
      FROM Gifts g
      JOIN JobMap jm ON g.APPEAL_ID = jm.Appeal_ID
      WHERE g.CLIENT_ID = @ClientID
        AND g.AMOUNT > 0
        AND g.GIFT_DATE >= CAST('${start}' AS date)
        AND g.GIFT_DATE <= CAST('${end}' AS date)
    )
    SELECT
      BiWeek, Campaign_ID,
      SUM(AMOUNT)                                          AS Revenue,
      SUM(CASE WHEN AMOUNT < 10000 THEN AMOUNT ELSE 0 END) AS RevenueUnder10k
    FROM G
    GROUP BY BiWeek, Campaign_ID
    ORDER BY BiWeek, Campaign_ID;
  `);

  return result.recordset.map((r) => ({
    biweek: fmt(parseDate(r.BiWeek)),
    campaign: r.Campaign_ID,
    revenue: Number(r.Revenue) || 0,
    revenueUnder10k: Number(r.RevenueUnder10k) || 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — 5-Year LTV of the earliest-available new-donor cohort
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The R report anchors on "FY21 new donors" (first gift Oct 2019–Sep 2020) and
 * measures their revenue over the following 5 years. We anchor the cohort the
 * same way — 5 full fiscal years before the current one — so the 5-year window
 * is always complete.
 */
async function queryLtv(pool, clientId, cohortStart, cohortEnd) {
  const start = fmt(cohortStart);
  const end = fmt(cohortEnd);

  const result = await req(pool, clientId).query(`
    WITH Ranked AS (
      SELECT DONOR_ID, GIFT_DATE, AMOUNT,
             ROW_NUMBER() OVER (PARTITION BY DONOR_ID ORDER BY GIFT_DATE ASC, Gift_ID ASC) AS rn
      FROM Gifts
      WHERE CLIENT_ID = @ClientID
    ),
    FirstGift AS (
      SELECT DONOR_ID, GIFT_DATE AS FirstDate, AMOUNT AS FirstAmount
      FROM Ranked
      WHERE rn = 1 AND GIFT_DATE >= CAST('${start}' AS date) AND GIFT_DATE <= CAST('${end}' AS date)
    ),
    Ltv AS (
      SELECT
        f.DONOR_ID,
        CASE
          WHEN f.FirstAmount < 10  THEN '<$10'
          WHEN f.FirstAmount < 25  THEN '$10-24'
          WHEN f.FirstAmount < 50  THEN '$25-49'
          WHEN f.FirstAmount < 100 THEN '$50-99'
          ELSE '$100+'
        END AS Bucket,
        SUM(g.AMOUNT) AS Total5y
      FROM FirstGift f
      JOIN Gifts g
        ON g.CLIENT_ID = @ClientID
       AND g.DONOR_ID = f.DONOR_ID
       AND g.GIFT_DATE <= DATEADD(YEAR, 5, f.FirstDate)
      GROUP BY f.DONOR_ID,
        CASE
          WHEN f.FirstAmount < 10  THEN '<$10'
          WHEN f.FirstAmount < 25  THEN '$10-24'
          WHEN f.FirstAmount < 50  THEN '$25-49'
          WHEN f.FirstAmount < 100 THEN '$50-99'
          ELSE '$100+'
        END
    )
    SELECT Bucket, AVG(Total5y) AS AvgLtv, COUNT(*) AS Donors, SUM(Total5y) AS TotalRev
    FROM Ltv GROUP BY Bucket
    UNION ALL
    SELECT 'Overall', AVG(Total5y), COUNT(*), SUM(Total5y) FROM Ltv;
  `);

  const order = ["<$10", "$10-24", "$25-49", "$50-99", "$100+", "Overall"];
  const rows = result.recordset.map((r) => ({
    bucket: r.Bucket,
    avgLtv: Number(r.AvgLtv) || 0,
    donors: Number(r.Donors) || 0,
    totalRev: Number(r.TotalRev) || 0,
  }));
  rows.sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));

  const overall = rows.find((r) => r.bucket === "Overall");
  return {
    cohortLabel: `FY${String(fyEndYear(cohortEnd, 10)).slice(-2)}`,
    rows,
    totalDonors: overall ? overall.donors : 0,
    totalRevenue: overall ? overall.totalRev : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — New Donors by month (monthly + cumulative) and Online/Offline
// ─────────────────────────────────────────────────────────────────────────────

async function queryNewDonors(pool, clientId, fyStart, fyeList, cutoffMonthNum) {
  const fyeIn = fyeList.join(", ");

  // Fiscal month number: months since FY start, 1-based (Oct=1 for an Oct start).
  const fiscalMonthNum = `(((MONTH(fg.FirstDate) - ${fyStart} + 12) % 12) + 1)`;
  const fyeExpr = `YEAR(fg.FirstDate) + CASE WHEN MONTH(fg.FirstDate) >= ${fyStart} AND ${fyStart} <> 1 THEN 1 ELSE 0 END`;

  const result = await req(pool, clientId).query(`
    WITH Ranked AS (
      SELECT DONOR_ID, GIFT_DATE, CHANNEL,
             ROW_NUMBER() OVER (PARTITION BY DONOR_ID ORDER BY GIFT_DATE ASC, Gift_ID ASC) AS rn
      FROM Gifts
      WHERE CLIENT_ID = @ClientID
    ),
    FirstGift AS (
      SELECT DONOR_ID, GIFT_DATE AS FirstDate, CHANNEL AS FirstChannel
      FROM Ranked WHERE rn = 1
    )
    SELECT
      ${fyeExpr}          AS FYE,
      ${fiscalMonthNum}   AS MonthNum,
      fg.FirstChannel     AS Channel,
      COUNT(DISTINCT fg.DONOR_ID) AS NewDonors
    FROM FirstGift fg
    WHERE (${fyeExpr}) IN (${fyeIn})
      AND ${fiscalMonthNum} <= ${cutoffMonthNum}
    GROUP BY ${fyeExpr}, ${fiscalMonthNum}, fg.FirstChannel
    ORDER BY FYE, MonthNum;
  `);

  return result.recordset.map((r) => ({
    fye: Number(r.FYE),
    fy: fyLabel(Number(r.FYE)),
    monthNum: Number(r.MonthNum),
    channel: r.Channel,
    newDonors: Number(r.NewDonors) || 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — New vs Reactivated (FYTD) + lapsed-reactivation recency buckets
// ─────────────────────────────────────────────────────────────────────────────

async function queryNewVsReactivated(pool, clientId, windows) {
  const result = await req(pool, clientId).query(`
    SELECT x.FYE, x.FYLabel,
      SUM(x.IsNew) AS NewCount,
      SUM(CASE WHEN x.IsNew = 0 AND x.PriorDonor IS NULL THEN 1 ELSE 0 END) AS ReactivatedCount
    FROM ${donorWindowFlagsSql(windows)}
    GROUP BY x.FYE, x.FYLabel
    ORDER BY x.FYE;
  `);

  return result.recordset.map((r) => ({
    fy: r.FYLabel,
    new: Number(r.NewCount) || 0,
    reactivated: Number(r.ReactivatedCount) || 0,
  }));
}

async function queryRecency(pool, clientId, windows) {
  // Distribution of reactivated donors by months since their previous gift.
  // Reactivated set comes from donorWindowFlagsSql; the most-recent gift before
  // the FY start is found with a set-based join (grouped MAX), not a correlated
  // subquery, so it stays fast over the full gift history.
  const result = await req(pool, clientId).query(`
    SELECT t.FYE, t.FYLabel, t.Bucket, COUNT(*) AS Donors
    FROM (
      SELECT r.FYE, r.FYLabel,
        CASE
          WHEN DATEDIFF(MONTH, r.LastBefore, r.FYStart) BETWEEN 13 AND 24 THEN '13-24 Mo.'
          WHEN DATEDIFF(MONTH, r.LastBefore, r.FYStart) BETWEEN 25 AND 36 THEN '25-36 Mo.'
          WHEN DATEDIFF(MONTH, r.LastBefore, r.FYStart) BETWEEN 37 AND 48 THEN '37-48 Mo.'
          WHEN DATEDIFF(MONTH, r.LastBefore, r.FYStart) BETWEEN 49 AND 60 THEN '49-60 Mo.'
          WHEN DATEDIFF(MONTH, r.LastBefore, r.FYStart) >= 61 THEN '61+ Mo.'
          ELSE 'Under 13 Mo.'
        END AS Bucket
      FROM (
        SELECT x.DONOR_ID, x.FYE, x.FYLabel, x.FYStart, MAX(g2.GIFT_DATE) AS LastBefore
        FROM ${donorWindowFlagsSql(windows)}
        JOIN Gifts g2 ON g2.CLIENT_ID = @ClientID AND g2.DONOR_ID = x.DONOR_ID AND g2.GIFT_DATE < x.FYStart
        WHERE x.IsNew = 0 AND x.PriorDonor IS NULL
        GROUP BY x.DONOR_ID, x.FYE, x.FYLabel, x.FYStart
      ) r
    ) t
    WHERE t.Bucket <> 'Under 13 Mo.'
    GROUP BY t.FYE, t.FYLabel, t.Bucket
    ORDER BY t.FYE;
  `);

  return result.recordset
    .filter((r) => r.Bucket !== "Under 13 Mo.")
    .map((r) => ({
      fy: r.FYLabel,
      bucket: r.Bucket,
      donors: Number(r.Donors) || 0,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — Channel Analysis: gift counts + revenue by category (FYTD)
// ─────────────────────────────────────────────────────────────────────────────

async function queryChannel(pool, clientId, windows) {
  const caseSql = buildChannelCaseSql(clientId, "G.APPEAL_ID");
  if (!caseSql) return null; // client has no channel rule set

  const result = await req(pool, clientId).query(`
    SELECT Category, FYLabel, FYE,
           COUNT(*)     AS GiftCounts,
           SUM(AMOUNT)  AS Revenue
    FROM (
      SELECT ${caseSql} AS Category, W.FYLabel, W.FYE, G.AMOUNT
      FROM Gifts G
      JOIN ${windowsValuesSql(windows, "W")} ON G.GIFT_DATE BETWEEN W.FYStart AND W.FYEnd
      WHERE G.CLIENT_ID = @ClientID
    ) c
    WHERE Category <> 'Other'
    GROUP BY Category, FYLabel, FYE
    ORDER BY FYE;
  `);

  return {
    order: getChannelOrder(clientId),
    rows: result.recordset.map((r) => ({
      category: r.Category,
      fy: r.FYLabel,
      giftCounts: Number(r.GiftCounts) || 0,
      revenue: Number(r.Revenue) || 0,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the complete QBR payload for a client.
 *
 * @param {string} clientId
 * @param {number} fyStart - P_Clients.FY_Month_Start (1-12)
 * @returns {Promise<object>} datasets for all six report sections
 */
export async function getQbrData(clientId, fyStart) {
  const pool = await getPool();

  // As-of date = the client's most recent gift.
  const asOfResult = await req(pool, clientId).query(
    `SELECT MAX(GIFT_DATE) AS AsOf, MIN(GIFT_DATE) AS Earliest FROM Gifts WHERE CLIENT_ID = @ClientID`
  );
  const asOfRaw = asOfResult.recordset[0]?.AsOf;
  if (!asOfRaw) {
    return { asOf: null, hasData: false };
  }
  const asOf = parseDate(asOfRaw);

  // Five-year FYTD comparison windows (matches the R "last 5 fiscal years").
  const { windows, cutoffFye, dayIndex } = buildWindows(asOf, fyStart, 5);
  const currentFyStart = fyStartDate(cutoffFye, fyStart);
  const cutoffMonthNum = (((asOf.getUTCMonth() + 1) - fyStart + 12) % 12) + 1;

  // New-donor section shows the most recent 3 fiscal years.
  const newDonorFyes = [cutoffFye - 2, cutoffFye - 1, cutoffFye];

  // LTV cohort: 5 full fiscal years before the current one, so 5 years elapse.
  const cohortFye = cutoffFye - 5;
  const cohortStart = fyStartDate(cohortFye, fyStart);
  const cohortEnd = addDays(fyStartDate(cohortFye + 1, fyStart), -1);

  // Recency comparison uses the most recent 3 windows.
  const recencyWindows = windows.slice(-3);

  const [metrics, sandchart, ltv, newDonors, newVsReactivated, recency, channel] =
    await Promise.all([
      queryFytdMetrics(pool, clientId, windows),
      querySandchart(pool, clientId, currentFyStart, asOf),
      queryLtv(pool, clientId, cohortStart, cohortEnd),
      queryNewDonors(pool, clientId, fyStart, newDonorFyes, cutoffMonthNum),
      queryNewVsReactivated(pool, clientId, windows),
      queryRecency(pool, clientId, recencyWindows),
      queryChannel(pool, clientId, windows),
    ]);

  return {
    hasData: true,
    asOf: fmt(asOf),
    fyStartMonth: fyStart,
    currentFy: fyLabel(cutoffFye),
    dayIndex,
    metrics,
    sandchart,
    ltv,
    newDonors: { rows: newDonors, fyes: newDonorFyes.map(fyLabel), cutoffMonthNum },
    newVsReactivated,
    recency,
    channel,
  };
}
