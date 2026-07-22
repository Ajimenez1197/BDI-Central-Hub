import { useState } from "react";
import { useClients, useQBR } from "../hooks/useApi.js";
import { ErrorCard } from "./shared.jsx";
import {
  MetricsSection, CampaignSection, LtvSection,
  NewDonorsSection, ReactivatedSection, ChannelSection,
} from "./qbr/sections.jsx";

/**
 * QBRTab — Quarterly Business Report (Client Service department).
 *
 * A live recreation of the client's R Markdown QBR. Pick a client, run the
 * report, and each of the six sections renders from a single /api/qbr call.
 * The FYTD "as-of" date is the client's most recent gift; every fiscal year is
 * compared through the same relative point in the year.
 */
const SECTIONS = [
  { id: "metrics", label: "FYTD Metrics", Component: MetricsSection },
  { id: "campaigns", label: "Campaign Revenue", Component: CampaignSection },
  { id: "ltv", label: "5-Year LTV", Component: LtvSection },
  { id: "newdonors", label: "New Donors", Component: NewDonorsSection },
  { id: "reactivated", label: "New & Reactivated", Component: ReactivatedSection },
  { id: "channel", label: "Channel Analysis", Component: ChannelSection },
];

export default function QBRTab() {
  const { clients, loading: clientsLoading } = useClients();
  const qbr = useQBR();

  const [clientId, setClientId] = useState("");
  const [section, setSection] = useState(SECTIONS[0].id);

  const busy = qbr.status === "loading";
  const canRun = clientId && !busy;

  function handleClientChange(value) {
    setClientId(value);
    qbr.reset();
  }

  function handleRun() {
    if (!canRun) return;
    setSection(SECTIONS[0].id);
    qbr.run({ clientId });
  }

  const data = qbr.data;
  const active = SECTIONS.find((s) => s.id === section) || SECTIONS[0];
  const ActiveSection = active.Component;

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

        <button className="toolbar-btn primary" disabled={!canRun} onClick={handleRun}>
          {busy ? <><span className="spinner" /> Running…</> : "Run QBR"}
        </button>
      </div>

      <main className="main-content">
        {qbr.status === "error" && <ErrorCard title="QBR failed to load" detail={qbr.error} />}

        {busy && (
          <div className="card fade-in" style={{ textAlign: "center", color: "var(--text-muted)" }}>
            <span className="spinner" /> Crunching the full gift history — this can take a moment.
          </div>
        )}

        {qbr.status === "success" && data && !data.hasData && (
          <div className="data-table-wrap fade-in">
            <p className="data-table-empty">No gift activity found for this client.</p>
          </div>
        )}

        {qbr.status === "success" && data && data.hasData && (
          <div className="fade-in">
            <div className="review-header">
              <h2>Quarterly Business Report</h2>
              <p>
                {qbr.clientName ? `${qbr.clientName} · ` : ""}
                {data.currentFy} · FYTD as of {data.asOf}
              </p>
            </div>

            <nav className="qbr-section-nav" aria-label="QBR sections">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={`qbr-section-btn ${section === s.id ? "active" : ""}`}
                  onClick={() => setSection(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </nav>

            <ActiveSection data={data} />
          </div>
        )}
      </main>
    </>
  );
}
