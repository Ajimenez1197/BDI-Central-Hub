import { useState } from "react";
import { useClients, useNewReactivated } from "../hooks/useApi.js";
import { DownloadIcon, ErrorCard } from "./shared.jsx";

/**
 * Column layout for the New & Reactivated Donors report. Each group renders a
 * centered band across its two channel columns (Online / Print). "Print" is the
 * Offline channel, kept as the business-facing label.
 */
const GROUPS = [
  {
    label: "New Donors",
    cols: [
      { key: "NewDonorsOnline", sub: "Online", type: "count" },
      { key: "NewDonorsPrint", sub: "Print", type: "count" },
    ],
  },
  {
    label: "Reactivated Donors",
    cols: [
      { key: "ReactivatedDonorsOnline", sub: "Online", type: "count" },
      { key: "ReactivatedDonorsPrint", sub: "Print", type: "count" },
    ],
  },
  {
    label: "New Donor First-Gift $",
    cols: [
      { key: "NewDonorFirstGiftTotalOnline", sub: "Online", type: "money" },
      { key: "NewDonorFirstGiftTotalPrint", sub: "Print", type: "money" },
    ],
  },
  {
    label: "Reactivated First-Gift $",
    cols: [
      { key: "ReactivatedFirstGiftTotalOnline", sub: "Online", type: "money" },
      { key: "ReactivatedFirstGiftTotalPrint", sub: "Print", type: "money" },
    ],
  },
];

const FLAT_COLS = GROUPS.flatMap((g) => g.cols);

function fmt(type, val) {
  const n = Number(val) || 0;
  if (type === "money") {
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return n.toLocaleString();
}

/** Sum every metric column across the returned rows for the totals row. */
function computeTotals(rows) {
  const totals = {};
  for (const col of FLAT_COLS) {
    totals[col.key] = rows.reduce((sum, r) => sum + (Number(r[col.key]) || 0), 0);
  }
  return totals;
}

function toCsv(rows, periodHeader) {
  const headers = [periodHeader, ...GROUPS.flatMap((g) => g.cols.map((c) => `${g.label} ${c.sub}`))];
  const lines = rows.map((r) =>
    [r.Period, ...FLAT_COLS.map((c) => Number(r[c.key]) || 0)]
      .map((v) => (typeof v === "string" && v.includes(",") ? `"${v}"` : v))
      .join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}

export default function DigitalTab() {
  const { clients, loading: clientsLoading } = useClients();
  const report = useNewReactivated();

  const [clientId, setClientId] = useState("");
  const [view, setView] = useState("monthly"); // monthly | fytd

  const busy = report.status === "loading";
  const canRun = clientId && !busy;

  function handleClientChange(value) {
    setClientId(value);
    report.reset();
  }

  function handleViewChange(next) {
    if (next === view) return;
    setView(next);
    report.reset();
  }

  function handleRun() {
    if (!canRun) return;
    report.run({ clientId, view });
  }

  function handleDownload() {
    const periodHeader = report.view === "fytd" ? "Fiscal Year" : "Month";
    const csv = toCsv(report.rows, periodHeader);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NewReactivated_${clientId}_${report.view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const periodLabel = report.view === "fytd" ? "Fiscal Year" : "Month";
  const totals = report.rows && report.rows.length ? computeTotals(report.rows) : null;

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-field" style={{ flex: 1, minWidth: 260 }}>
          <label>Client</label>
          <select value={clientId} onChange={(e) => handleClientChange(e.target.value)} disabled={busy}>
            <option value="">{clientsLoading ? "Loading…" : "Select"}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-field">
          <label>View</label>
          <div className="seg-toggle">
            <button
              className={`seg-btn ${view === "monthly" ? "active" : ""}`}
              onClick={() => handleViewChange("monthly")}
              disabled={busy}
            >
              Monthly
            </button>
            <button
              className={`seg-btn ${view === "fytd" ? "active" : ""}`}
              onClick={() => handleViewChange("fytd")}
              disabled={busy}
            >
              FYTD
            </button>
          </div>
        </div>

        <button className="toolbar-btn primary" disabled={!canRun} onClick={handleRun}>
          {busy ? <><span className="spinner" /> Running…</> : "Run Report"}
        </button>
      </div>

      <main className="main-content">
        {report.status === "error" && (
          <ErrorCard title="New & Reactivated report failed" detail={report.error} />
        )}

        {report.status === "success" && (
          <div className="fade-in">
            <div className="review-header">
              <h2>New &amp; Reactivated Donors</h2>
              <p>
                {clientId}
                {report.clientName ? ` · ${report.clientName}` : ""} ·{" "}
                {report.view === "fytd"
                  ? "Fiscal year to date (rolled up by fiscal year)"
                  : "By month, from January 2023"}
              </p>
            </div>

            <div className="data-table-wrap">
              <div className="data-table-header">
                {report.view === "fytd" ? "Fiscal Year Roll-Up" : "Monthly Breakdown"}
                <span className="data-table-count">{report.rows.length} rows</span>
              </div>

              {report.rows.length === 0 ? (
                <p className="data-table-empty">No gift activity found for this client since 2023.</p>
              ) : (
                <div className="data-table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="period-cell" rowSpan={2}>{periodLabel}</th>
                        {GROUPS.map((g) => (
                          <th key={g.label} className="group-head" colSpan={2}>{g.label}</th>
                        ))}
                      </tr>
                      <tr>
                        {GROUPS.flatMap((g) =>
                          g.cols.map((c) => <th key={c.key}>{c.sub}</th>)
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row, i) => (
                        <tr key={i}>
                          <td className="period-cell">{row.Period}</td>
                          {FLAT_COLS.map((c) => (
                            <td key={c.key}>{fmt(c.type, row[c.key])}</td>
                          ))}
                        </tr>
                      ))}
                      {totals && (
                        <tr className="totals-row">
                          <td className="period-cell">Total</td>
                          {FLAT_COLS.map((c) => (
                            <td key={c.key}>{fmt(c.type, totals[c.key])}</td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {report.rows.length > 0 && (
              <div className="build-actions">
                <button className="btn btn-download" onClick={handleDownload}>
                  <DownloadIcon /> Download CSV
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
