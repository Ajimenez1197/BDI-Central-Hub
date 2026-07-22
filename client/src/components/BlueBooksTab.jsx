import { useState } from "react";
import { useClients, useAppealIds, useBlueBook } from "../hooks/useApi.js";
import { DownloadIcon, ErrorCard } from "./shared.jsx";

// Columns whose values represent currency (for display formatting).
const MONEY_COLS = new Set(["Revenue", "Cost"]);

function fmt(col, val) {
  if (val === null || val === undefined || val === "") return val === "" ? "" : "—";
  if (typeof val !== "number") return val;
  if (col === "Response %") return `${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  if (col === "ROI") return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
  if (MONEY_COLS.has(col)) return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Light fill + dark text so the ROI value stays fully legible (matches the xlsx).
function roiStyle(val) {
  if (typeof val !== "number") return undefined;
  if (val > 1) return { background: "#C6EFCE", color: "#006100", fontWeight: 600 };   // strictly above 1
  if (val > 0) return { background: "#FFEB9C", color: "#9C6500", fontWeight: 600 };    // 0 < roi <= 1 (1.0 yellow)
  return { background: "#FFC7CE", color: "#9C0006", fontWeight: 600 };
}

export default function BlueBooksTab() {
  const { clients, loading: clientsLoading } = useClients("all");
  const blueBook = useBlueBook();

  const [clientId, setClientId] = useState("");
  const [appealCode, setAppealCode] = useState("");

  const { appeals, loading: appealsLoading } = useAppealIds(clientId, "backtest");

  const busy = blueBook.status === "loading";
  const canRun = clientId && appealCode && !busy;

  function handleClientChange(value) {
    setClientId(value);
    setAppealCode("");
    blueBook.reset();
  }

  function handleAppealChange(value) {
    setAppealCode(value);
    blueBook.reset();
  }

  function handleRun() {
    if (!canRun) return;
    blueBook.run({ clientId, appealCode });
  }

  const cols = blueBook.rows && blueBook.rows.length ? Object.keys(blueBook.rows[0]) : [];
  const cpmNote =
    blueBook.cpm && (blueBook.cpm.package || blueBook.cpm.postage)
      ? `CPM: Package $${blueBook.cpm.package.toFixed(2)} + Postage $${blueBook.cpm.postage.toFixed(2)} = $${(blueBook.cpm.package + blueBook.cpm.postage).toFixed(2)}/1,000`
      : "No CPM found in c_jobs for this appeal — Cost and ROI will be blank.";

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-field">
          <label>Client</label>
          <select value={clientId} onChange={(e) => handleClientChange(e.target.value)} disabled={busy}>
            <option value="">{clientsLoading ? "Loading…" : "Select"}</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="toolbar-field" style={{ flex: 1, minWidth: 240 }}>
          <label>Appeal</label>
          <select value={appealCode} onChange={(e) => handleAppealChange(e.target.value)} disabled={busy || !clientId}>
            <option value="">{!clientId ? "Select client first" : appealsLoading ? "Loading…" : "Select"}</option>
            {appeals.map((a) => (
              <option key={a.AppealCode} value={a.AppealCode}>{a.AppealCode} — {a.CampaignName}</option>
            ))}
          </select>
        </div>
        <button className="toolbar-btn primary" disabled={!canRun} onClick={handleRun}>
          {busy ? <><span className="spinner" /> Running…</> : "Run Blue Book"}
        </button>
      </div>

      <main className="main-content">
        {blueBook.status === "error" && (
          <ErrorCard title="Blue Book query failed" detail={blueBook.error} />
        )}

        {blueBook.status === "success" && (
          <div className="fade-in">
            <div className="review-header">
              <h2>Response by RFM_ID</h2>
              <p>
                {clientId}
                {blueBook.campaignId ? ` · ${blueBook.campaignId}` : ""} · Appeal {appealCode} — {cpmNote}
              </p>
            </div>

            <div className="data-table-wrap">
              <div className="data-table-header">
                Blue Book
                <span className="data-table-count">{blueBook.rows.length} segments</span>
              </div>
              {blueBook.rows.length === 0 ? (
                <p className="data-table-empty">No mailed or response records found for this appeal.</p>
              ) : (
                <div className="data-table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {blueBook.rows.map((row, i) => (
                        <tr key={i}>
                          {cols.map((c) => (
                            <td key={c} style={c === "ROI" ? roiStyle(row[c]) : undefined}>
                              {fmt(c, row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {blueBook.totals && (
                        <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border, #ccc)" }}>
                          {cols.map((c) => (
                            <td key={c} style={c === "ROI" ? roiStyle(blueBook.totals[c]) : undefined}>
                              {fmt(c, blueBook.totals[c])}
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {blueBook.downloadUrl && (
              <div className="build-actions fade-in">
                <a
                  href={blueBook.downloadUrl}
                  className="btn btn-download"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "none", display: "flex" }}
                >
                  <DownloadIcon /> Download Excel
                </a>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
