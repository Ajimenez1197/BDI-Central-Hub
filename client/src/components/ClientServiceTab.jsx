import { useState } from "react";
import { useClients, useDonorPyramid } from "../hooks/useApi.js";
import { DownloadIcon, ErrorCard } from "./shared.jsx";
import DonorPyramid from "./DonorPyramid.jsx";

const PERIODS = [
  { id: "cy", label: "Calendar Year" },
  { id: "rolling12", label: "Rolling 12 Mo" },
  { id: "fytd", label: "FYTD" },
];

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function moneyTotal(n) {
  const v = n || 0;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function ChartCard({ title, subtitle, metric, entity }) {
  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <span className="chart-card-title">{title}</span>
        {subtitle && <span className="chart-card-sub">{subtitle}</span>}
      </div>
      <DonorPyramid
        metric={metric}
        buckets={entity.buckets}
        totalDonors={entity.totalDonors}
        totalRevenue={entity.totalRevenue}
      />
    </div>
  );
}

// One CSV with all four series (donor counts + revenue, client + benchmark),
// one row per tier plus a totals row.
function buildCsv(d) {
  const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
  const tiers = [
    { key: "mass", label: "Mass", th: "$0.01-999.99" },
    { key: "middle", label: "Middle", th: "$1,000-9,999.99" },
    { key: "major", label: "Major", th: "$10,000+" },
  ];
  const headers = [
    "Tier", "Threshold",
    "Client Donors", "Client Donor %",
    "Benchmark Donors", "Benchmark Donor %",
    "Client Revenue", "Client Revenue %",
    "Benchmark Revenue", "Benchmark Revenue %",
  ];
  const c = d.client, b = d.benchmark;
  const body = tiers.map((t) => {
    const cb = c.buckets[t.key], bb = b.buckets[t.key];
    return [
      t.label, t.th,
      cb.donors, pct(cb.donors, c.totalDonors).toFixed(2),
      bb.donors, pct(bb.donors, b.totalDonors).toFixed(2),
      cb.revenue.toFixed(2), pct(cb.revenue, c.totalRevenue).toFixed(2),
      bb.revenue.toFixed(2), pct(bb.revenue, b.totalRevenue).toFixed(2),
    ];
  });
  const totalRow = [
    "Total", "",
    c.totalDonors, "100.00",
    b.totalDonors, "100.00",
    c.totalRevenue.toFixed(2), "100.00",
    b.totalRevenue.toFixed(2), "100.00",
  ];
  const meta = [
    `Donor Pyramid,${d.clientId} ${d.clientName}`,
    `${d.window.label} (${d.window.start} to ${d.window.end}); benchmark = ${d.benchmark.clientCount} production clients`,
    "",
  ];
  const esc = (v) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [...meta, [headers, ...body, totalRow].map((r) => r.map(esc).join(",")).join("\n")].join("\n");
}

export default function ClientServiceTab() {
  const { clients, loading: clientsLoading } = useClients();
  const report = useDonorPyramid();

  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState("cy");

  const busy = report.status === "loading";
  const canRun = clientId && !busy;

  function handleClientChange(v) {
    setClientId(v);
    report.reset();
  }
  function handlePeriodChange(p) {
    if (p === period) return;
    setPeriod(p);
    report.reset();
  }
  function handleRun() {
    if (canRun) report.run({ clientId, period });
  }

  const d = report.data;

  function handleDownload() {
    const csv = buildCsv(d);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DonorPyramid_${d.clientId}_${d.period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-field" style={{ flex: 1, minWidth: 260 }}>
          <label>Client</label>
          <select value={clientId} onChange={(e) => handleClientChange(e.target.value)} disabled={busy}>
            <option value="">{clientsLoading ? "Loading…" : "Select"}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.id} — {c.name}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-field">
          <label>Giving Period</label>
          <div className="seg-toggle">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                className={`seg-btn ${period === p.id ? "active" : ""}`}
                onClick={() => handlePeriodChange(p.id)}
                disabled={busy}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button className="toolbar-btn primary" disabled={!canRun} onClick={handleRun}>
          {busy ? <><span className="spinner" /> Running…</> : "Run Report"}
        </button>
      </div>

      <main className="main-content">
        {report.status === "error" && (
          <ErrorCard title="Donor Pyramid failed" detail={report.error} />
        )}

        {report.status === "success" && d && (
          <div className="fade-in">
            <div className="review-header">
              <h2>Donor Pyramid</h2>
              <p>
                {d.clientId}
                {d.clientName ? ` · ${d.clientName}` : ""} · {d.window.label} (
                {fmtDate(d.window.start)} – {fmtDate(d.window.end)})
              </p>
            </div>

            <div className="pyramid-key">
              <span className="pyramid-key-lead">Donors bucketed by cumulative giving in the period:</span>
              <span><i className="sw sw-major" /> Major $10K+</span>
              <span><i className="sw sw-middle" /> Middle $1K–10K</span>
              <span><i className="sw sw-mass" /> Mass under $1K</span>
            </div>

            <div className="chart-grid">
              <ChartCard
                title="Client — Donors"
                subtitle={`${d.client.totalDonors.toLocaleString()} donors`}
                metric="donors"
                entity={d.client}
              />
              <ChartCard
                title="Benchmark — Donors"
                subtitle={`${d.benchmark.clientCount} clients · ${d.benchmark.totalDonors.toLocaleString()} donors`}
                metric="donors"
                entity={d.benchmark}
              />
              <ChartCard
                title="Client — Revenue"
                subtitle={`${moneyTotal(d.client.totalRevenue)} raised`}
                metric="revenue"
                entity={d.client}
              />
              <ChartCard
                title="Benchmark — Revenue"
                subtitle={`${d.benchmark.clientCount} clients · ${moneyTotal(d.benchmark.totalRevenue)}`}
                metric="revenue"
                entity={d.benchmark}
              />
            </div>

            <p className="subtle-text muted" style={{ marginTop: 12 }}>
              Band size reflects each tier's share of <em>revenue</em> (so every tier stays
              visible); labels show each chart's own metric.
              {period === "fytd" &&
                ` Benchmark FYTD uses each client's own fiscal-year start; the window shown above is ${d.clientId}'s.`}
            </p>

            <div className="build-actions">
              <button className="btn btn-download" onClick={handleDownload}>
                <DownloadIcon /> Download CSV
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
