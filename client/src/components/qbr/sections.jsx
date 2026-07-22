/**
 * sections.jsx — The six Quarterly Business Report sections, each a self-
 * contained render function taking the QBR `data` payload. Charts are native
 * Recharts; tables reuse the app's data-table styling via QbrTable.
 */

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, LabelList,
} from "recharts";
import {
  PALETTE, colorAt, fyColorMap, money0, moneyShort, comma, pct1,
  fiscalMonthLabel, ChartCard, QbrTable, makeTooltip, downloadCsv,
} from "./helpers.jsx";
import { DownloadIcon } from "../shared.jsx";

const AXIS = { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fill: "#555" };
const GRID = "#ececec";

/** Format a 'YYYY-MM-DD' biweek key as e.g. "Oct 1". */
function fmtBiweek(s) {
  const [y, m, d] = s.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} ${d}`;
}

function DownloadBtn({ onClick }) {
  return (
    <div className="build-actions">
      <button className="btn btn-download" onClick={onClick}>
        <DownloadIcon /> Download CSV
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 1 — FYTD Metrics
// ═══════════════════════════════════════════════════════════════════════════
export function MetricsSection({ data }) {
  const rows = data.metrics;
  if (!rows?.length) return <Empty />;
  const moneyTip = makeTooltip(money0);
  const countTip = makeTooltip(comma);

  const tableRows = rows.map((r) => ({
    fy: r.fy,
    under: r.revUnder10k,
    over: r.rev10kPlus,
    total: r.totalRevenue,
    donors: r.uniqueDonors,
  }));
  const totals = {
    fy: "Total",
    under: sum(tableRows, "under"),
    over: sum(tableRows, "over"),
    total: sum(tableRows, "total"),
    donors: sum(tableRows, "donors"),
  };

  return (
    <>
      <p className="qbr-section-intro">
        Fiscal year-to-date performance across the last five fiscal years, each
        measured through the same relative point in the year for a like-for-like
        comparison.
      </p>

      <div className="qbr-grid">
        <ChartCard title="FYTD Revenue" subtitle="Total revenue by fiscal year to date">
          <BarChart data={rows} margin={{ top: 24, right: 12, left: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="fy" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tickFormatter={moneyShort} tick={AXIS} tickLine={false} axisLine={false} width={54} />
            <Tooltip content={moneyTip} cursor={{ fill: "rgba(0,122,77,0.06)" }} />
            <Bar dataKey="totalRevenue" name="Revenue" fill="#007A4D" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="totalRevenue" position="top" formatter={moneyShort}
                style={{ fontSize: 11, fontWeight: 600, fill: "#333" }} />
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="FYTD Revenue by Gift Type" subtitle="Under $10K vs $10K+ gifts">
          <BarChart data={rows} margin={{ top: 24, right: 12, left: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="fy" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tickFormatter={moneyShort} tick={AXIS} tickLine={false} axisLine={false} width={54} />
            <Tooltip content={moneyTip} cursor={{ fill: "rgba(0,122,77,0.06)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revUnder10k" stackId="a" name="< $10K Gifts" fill="#007A4D" />
            <Bar dataKey="rev10kPlus" stackId="a" name="$10K+ Gifts" fill="#a0d187" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      <QbrTable
        title="FYTD Revenue by Gift Type"
        columns={[
          { key: "fy", label: "Fiscal Year" },
          { key: "under", label: "< $10K Gifts", fmt: money0 },
          { key: "over", label: "$10K+ Gifts", fmt: money0 },
          { key: "total", label: "Total", fmt: money0 },
        ]}
        rows={tableRows}
        totals={totals}
      />

      <ChartCard title="FYTD Unique Donors" subtitle="Distinct donors giving through the FYTD cutoff">
        <BarChart data={rows} margin={{ top: 24, right: 12, left: 12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="fy" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tickFormatter={comma} tick={AXIS} tickLine={false} axisLine={false} width={54} />
          <Tooltip content={countTip} cursor={{ fill: "rgba(0,122,77,0.06)" }} />
          <Bar dataKey="uniqueDonors" name="Unique Donors" fill="#1d98b2" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="uniqueDonors" position="top" formatter={comma}
              style={{ fontSize: 11, fontWeight: 600, fill: "#333" }} />
          </Bar>
        </BarChart>
      </ChartCard>

      <QbrTable
        title="FYTD Unique Donors"
        columns={[
          { key: "fy", label: "Fiscal Year" },
          { key: "donors", label: "Unique Donors", fmt: comma },
        ]}
        rows={tableRows}
      />

      <DownloadBtn
        onClick={() =>
          downloadCsv(
            `QBR_FYTD_Metrics.csv`,
            ["Fiscal Year", "Under $10K", "$10K+", "Total Revenue", "Unique Donors"],
            tableRows.map((r) => [r.fy, r.under, r.over, r.total, r.donors])
          )
        }
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 2 — Campaign Revenue Sandchart
// ═══════════════════════════════════════════════════════════════════════════
const TOP_CAMPAIGNS = 12;

export function CampaignSection({ data }) {
  const raw = data.sandchart;
  if (!raw?.length) return <Empty note="No campaign-matched gifts in the current fiscal year." />;

  // Rank campaigns by total revenue; keep top N, fold the rest into "Other".
  const totalsByCampaign = {};
  for (const r of raw) {
    totalsByCampaign[r.campaign] = totalsByCampaign[r.campaign] || { all: 0, under: 0 };
    totalsByCampaign[r.campaign].all += r.revenue;
    totalsByCampaign[r.campaign].under += r.revenueUnder10k;
  }
  const ranked = Object.entries(totalsByCampaign).sort((a, b) => b[1].all - a[1].all);
  const topNames = ranked.slice(0, TOP_CAMPAIGNS).map(([name]) => name);
  const topSet = new Set(topNames);
  const hasOther = ranked.length > TOP_CAMPAIGNS;
  const seriesNames = hasOther ? [...topNames, "Other"] : topNames;

  // Pivot to stacked-area rows keyed by biweek.
  const byWeek = new Map();
  for (const r of raw) {
    if (!byWeek.has(r.biweek)) byWeek.set(r.biweek, { biweek: r.biweek });
    const key = topSet.has(r.campaign) ? r.campaign : "Other";
    const row = byWeek.get(r.biweek);
    row[key] = (row[key] || 0) + r.revenue;
  }
  const areaRows = [...byWeek.values()].sort((a, b) => a.biweek.localeCompare(b.biweek));

  const tableRows = ranked.map(([name, v]) => ({ campaign: name, all: v.all, under: v.under }));
  const grand = { campaign: "Grand Total", all: sum(tableRows, "all"), under: sum(tableRows, "under") };

  return (
    <>
      <p className="qbr-section-intro">
        {data.currentFy} revenue by campaign, bucketed into biweekly periods from
        the start of the fiscal year through {data.asOf}. Gifts are matched to
        campaigns via mailed jobs; the top {TOP_CAMPAIGNS} campaigns are shown
        individually{hasOther ? ' and the remainder grouped as "Other"' : ""}.
      </p>

      <ChartCard title={`${data.currentFy} Revenue by Campaign`} subtitle="Biweekly, stacked by campaign" height={440}>
        <AreaChart data={areaRows} margin={{ top: 10, right: 16, left: 12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="biweek" tickFormatter={fmtBiweek} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={20} />
          <YAxis tickFormatter={moneyShort} tick={AXIS} tickLine={false} axisLine={false} width={54} />
          <Tooltip content={makeTooltip(money0)} />
          <Legend wrapperStyle={{ fontSize: 10, maxHeight: 72, overflow: "hidden" }} />
          {seriesNames.map((name, i) => (
            <Area key={name} type="monotone" dataKey={name} name={name} stackId="1"
              stroke={colorAt(i)} fill={colorAt(i)} fillOpacity={0.85} />
          ))}
        </AreaChart>
      </ChartCard>

      <QbrTable
        title={`${data.currentFy} Campaign Revenue`}
        columns={[
          { key: "campaign", label: "Campaign" },
          { key: "all", label: "All Gifts", fmt: money0 },
          { key: "under", label: "Excl. $10K+ Gifts", fmt: money0 },
        ]}
        rows={tableRows}
        totals={grand}
      />

      <DownloadBtn
        onClick={() =>
          downloadCsv(
            `QBR_${data.currentFy}_Campaigns.csv`,
            ["Campaign", "All Gifts", "Excl. $10K+"],
            tableRows.map((r) => [r.campaign, r.all, r.under])
          )
        }
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 3 — 5-Year LTV
// ═══════════════════════════════════════════════════════════════════════════
export function LtvSection({ data }) {
  const ltv = data.ltv;
  if (!ltv?.rows?.length) return <Empty />;
  const chartRows = ltv.rows;

  return (
    <>
      <p className="qbr-section-intro">
        Average five-year lifetime value of the {ltv.cohortLabel} new-donor cohort
        (donors acquired five fiscal years ago), bucketed by their first-gift
        amount. Total donors: <strong>{comma(ltv.totalDonors)}</strong> · Total
        5-year revenue: <strong>{money0(ltv.totalRevenue)}</strong>.
      </p>

      <ChartCard title={`Average 5-Year LTV of ${ltv.cohortLabel} New Donors`} subtitle="By first-gift amount">
        <BarChart data={chartRows} margin={{ top: 24, right: 12, left: 12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="bucket" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tickFormatter={moneyShort} tick={AXIS} tickLine={false} axisLine={false} width={54} />
          <Tooltip content={makeTooltip(money0)} cursor={{ fill: "rgba(0,122,77,0.06)" }} />
          <Bar dataKey="avgLtv" name="Avg 5-Year LTV" radius={[4, 4, 0, 0]}>
            {chartRows.map((r, i) => (
              <Cell key={i} fill={r.bucket === "Overall" ? "#00452f" : colorAt(i)} />
            ))}
            <LabelList dataKey="avgLtv" position="top" formatter={money0}
              style={{ fontSize: 11, fontWeight: 600, fill: "#333" }} />
          </Bar>
        </BarChart>
      </ChartCard>

      <QbrTable
        title="5-Year LTV by First-Gift Bucket"
        columns={[
          { key: "bucket", label: "First Gift Amount" },
          { key: "donors", label: "Donors", fmt: comma },
          { key: "avgLtv", label: "Avg 5-Year LTV", fmt: money0 },
          { key: "totalRev", label: "Total 5-Year Revenue", fmt: money0 },
        ]}
        rows={chartRows}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 4 — New Donors
// ═══════════════════════════════════════════════════════════════════════════
export function NewDonorsSection({ data }) {
  const { rows, fyes, cutoffMonthNum } = data.newDonors;
  if (!rows?.length) return <Empty />;
  const fyStart = data.fyStartMonth;
  const months = Array.from({ length: cutoffMonthNum }, (_, i) => i + 1);
  const fyColors = fyColorMap(fyes);

  // monthly[monthNum] = { month, label, [fy]: total across channels }
  const build = (filterFn) => {
    const map = new Map(months.map((m) => [m, { month: m, label: fiscalMonthLabel(m, fyStart) }]));
    for (const r of rows) {
      if (!filterFn(r)) continue;
      const row = map.get(r.monthNum);
      if (!row) continue;
      row[r.fy] = (row[r.fy] || 0) + r.newDonors;
    }
    return [...map.values()];
  };

  const monthly = build(() => true);
  const online = build((r) => r.channel === "Online");
  const offline = build((r) => r.channel === "Offline");

  // Cumulative FYTD per fiscal year.
  const cumulative = months.map((m) => ({ month: m, label: fiscalMonthLabel(m, fyStart) }));
  for (const fy of fyes) {
    let run = 0;
    for (let i = 0; i < months.length; i++) {
      run += monthly[i][fy] || 0;
      cumulative[i][fy] = run;
    }
  }

  const countTip = makeTooltip(comma);
  const lineChart = (rowsData, title, subtitle) => (
    <ChartCard title={title} subtitle={subtitle}>
      <LineChart data={rowsData} margin={{ top: 16, right: 16, left: 12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tickFormatter={comma} tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={countTip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {fyes.map((fy) => (
          <Line key={fy} type="monotone" dataKey={fy} name={fy} stroke={fyColors[fy]}
            strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ChartCard>
  );

  const channelBar = (rowsData, title) => (
    <ChartCard title={title} subtitle="New donors by month">
      <BarChart data={rowsData} margin={{ top: 16, right: 12, left: 12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tickFormatter={comma} tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={countTip} cursor={{ fill: "rgba(0,122,77,0.06)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {fyes.map((fy) => (
          <Bar key={fy} dataKey={fy} name={fy} fill={fyColors[fy]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ChartCard>
  );

  const tableCols = [
    { key: "label", label: "Month" },
    ...fyes.map((fy) => ({ key: fy, label: fy, fmt: (v) => comma(v || 0) })),
  ];
  const tableTotals = (rowsData) => {
    const t = { label: "Total" };
    for (const fy of fyes) t[fy] = sum(rowsData, fy);
    return t;
  };

  return (
    <>
      <p className="qbr-section-intro">
        New donors acquired by month (first-ever gift), comparing the last three
        fiscal years through the FYTD cutoff.
      </p>

      {lineChart(monthly, "New Donors Acquired by Month", "Month-by-month new donor acquisition")}
      {lineChart(cumulative, "Cumulative FYTD New Donors", "Running total through the fiscal year")}

      <div className="qbr-grid">
        {channelBar(online, "New Online Donors by Month")}
        {channelBar(offline, "New Offline Donors by Month")}
      </div>

      <div className="qbr-grid">
        <div>
          <div className="qbr-table-title">New Online Donors (FYTD)</div>
          <QbrTable columns={tableCols} rows={online} totals={tableTotals(online)} />
        </div>
        <div>
          <div className="qbr-table-title">New Offline Donors (FYTD)</div>
          <QbrTable columns={tableCols} rows={offline} totals={tableTotals(offline)} />
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 5 — New & Reactivated
// ═══════════════════════════════════════════════════════════════════════════
const RECENCY_ORDER = ["13-24 Mo.", "25-36 Mo.", "37-48 Mo.", "49-60 Mo.", "61+ Mo."];

export function ReactivatedSection({ data }) {
  const nvr = data.newVsReactivated;
  if (!nvr?.length) return <Empty />;
  const countTip = makeTooltip(comma);

  // Recency pivot: { bucket, [fy]: donors } + within-FY percentages.
  const recency = data.recency || [];
  const recencyFys = [...new Set(recency.map((r) => r.fy))].sort();
  const fyTotals = {};
  for (const fy of recencyFys) fyTotals[fy] = recency.filter((r) => r.fy === fy).reduce((s, r) => s + r.donors, 0);
  const recRows = RECENCY_ORDER.map((bucket) => {
    const row = { bucket };
    for (const fy of recencyFys) {
      const found = recency.find((r) => r.fy === fy && r.bucket === bucket);
      row[fy] = found ? found.donors : 0;
      row[`${fy}_pct`] = fyTotals[fy] ? row[fy] / fyTotals[fy] : 0;
    }
    return row;
  });
  const recColor = fyColorMap(recencyFys);

  const nvrTotals = { fy: "Total", new: sum(nvr, "new"), reactivated: sum(nvr, "reactivated") };

  return (
    <>
      <p className="qbr-section-intro">
        New vs reactivated donors by fiscal year to date. A donor is "reactivated"
        when they gave this fiscal year, are not brand-new, and skipped the entire
        prior fiscal year.
      </p>

      <ChartCard title="FYTD New vs Reactivated Donors" subtitle="Stacked donor counts by fiscal year">
        <BarChart data={nvr} margin={{ top: 24, right: 12, left: 12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="fy" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tickFormatter={comma} tick={AXIS} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={countTip} cursor={{ fill: "rgba(0,122,77,0.06)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="new" stackId="a" name="New" fill="#00452f">
            <LabelList dataKey="new" position="center" formatter={comma}
              style={{ fontSize: 10, fontWeight: 600, fill: "#fff" }} />
          </Bar>
          <Bar dataKey="reactivated" stackId="a" name="Reactivated" fill="#007A4D" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="reactivated" position="center" formatter={comma}
              style={{ fontSize: 10, fontWeight: 600, fill: "#fff" }} />
          </Bar>
        </BarChart>
      </ChartCard>

      <QbrTable
        title="FYTD New vs Reactivated"
        columns={[
          { key: "fy", label: "Fiscal Year" },
          { key: "new", label: "New", fmt: comma },
          { key: "reactivated", label: "Reactivated", fmt: comma },
        ]}
        rows={nvr}
        totals={nvrTotals}
      />

      {recRows.length > 0 && recencyFys.length > 0 && (
        <>
          <ChartCard title="Lapsed Reactivation by Recency Range"
            subtitle="Reactivated donors by months since their previous gift" height={380}>
            <BarChart data={recRows} layout="vertical" margin={{ top: 8, right: 32, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tickFormatter={comma} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis type="category" dataKey="bucket" tick={AXIS} tickLine={false} axisLine={false} width={72} />
              <Tooltip content={countTip} cursor={{ fill: "rgba(0,122,77,0.06)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {recencyFys.map((fy) => (
                <Bar key={fy} dataKey={fy} name={fy} fill={recColor[fy]} radius={[0, 3, 3, 0]} />
              ))}
            </BarChart>
          </ChartCard>

          <QbrTable
            title="Reactivation Recency Distribution"
            columns={[
              { key: "bucket", label: "Months Since Last Gift" },
              ...recencyFys.flatMap((fy) => [
                { key: fy, label: `${fy} Donors`, fmt: (v) => comma(v || 0) },
                { key: `${fy}_pct`, label: `${fy} %`, fmt: pct1 },
              ]),
            ]}
            rows={recRows}
          />
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 6 — Channel Analysis
// ═══════════════════════════════════════════════════════════════════════════
export function ChannelSection({ data }) {
  const channel = data.channel;
  if (!channel) {
    return (
      <Empty note="Channel Analysis isn't configured for this client. The channel categories are derived from client-specific appeal-code rules; add a rule set to enable this section." />
    );
  }
  const { order, rows } = channel;
  if (!rows?.length) return <Empty />;

  const fys = [...new Set(rows.map((r) => r.fy))].sort();
  const fyColors = fyColorMap(fys);

  const pivot = (valKey) => {
    const map = new Map(order.map((cat) => [cat, { category: cat }]));
    for (const r of rows) {
      if (!map.has(r.category)) map.set(r.category, { category: r.category });
      map.get(r.category)[r.fy] = r[valKey];
    }
    const out = [...map.values()].map((row) => {
      const total = fys.reduce((s, fy) => s + (row[fy] || 0), 0);
      return { ...row, total };
    });
    return out.filter((row) => row.total > 0);
  };

  const counts = pivot("giftCounts");
  const revenue = pivot("revenue");

  const grand = (rowsData) => {
    const t = { category: "Grand Total", total: sum(rowsData, "total") };
    for (const fy of fys) t[fy] = sum(rowsData, fy);
    return t;
  };

  const groupedBar = (rowsData, title, fmt, tip) => (
    <ChartCard title={title} subtitle="By category and fiscal year" height={400}>
      <BarChart data={rowsData} margin={{ top: 16, right: 12, left: 12, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="category" tick={{ ...AXIS, fontSize: 10 }} tickLine={false}
          axisLine={{ stroke: GRID }} angle={-25} textAnchor="end" interval={0} height={60} />
        <YAxis tickFormatter={fmt} tick={AXIS} tickLine={false} axisLine={false} width={54} />
        <Tooltip content={tip} cursor={{ fill: "rgba(0,122,77,0.06)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {fys.map((fy) => (
          <Bar key={fy} dataKey={fy} name={fy} fill={fyColors[fy]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ChartCard>
  );

  const cols = (fmt) => [
    { key: "category", label: "Category" },
    ...fys.map((fy) => ({ key: fy, label: fy, fmt: (v) => fmt(v || 0) })),
    { key: "total", label: "FYTD Total", fmt: (v) => fmt(v || 0) },
  ];

  return (
    <>
      <p className="qbr-section-intro">
        FYTD gift counts and revenue by marketing channel, classified from
        appeal codes. Compares the last five fiscal years through the FYTD cutoff.
      </p>

      {groupedBar(counts, "FYTD Gift Counts by Category", comma, makeTooltip(comma))}
      <QbrTable title="FYTD Gift Counts by Category" columns={cols(comma)} rows={counts} totals={grand(counts)} />

      {groupedBar(revenue, "FYTD Revenue by Category", moneyShort, makeTooltip(money0))}
      <QbrTable title="FYTD Revenue by Category" columns={cols(money0)} rows={revenue} totals={grand(revenue)} />

      <DownloadBtn
        onClick={() =>
          downloadCsv(
            `QBR_Channel_Revenue.csv`,
            ["Category", ...fys, "FYTD Total"],
            revenue.map((r) => [r.category, ...fys.map((fy) => r[fy] || 0), r.total])
          )
        }
      />
    </>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function sum(rows, key) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

function Empty({ note }) {
  return (
    <div className="data-table-wrap">
      <p className="data-table-empty">{note || "No data available for this section."}</p>
    </div>
  );
}
