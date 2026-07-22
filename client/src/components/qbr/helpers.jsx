/**
 * helpers.jsx — Shared primitives for the Quarterly Business Report sections:
 * number formatters, the categorical color palette, a titled chart frame, a
 * styled data table, the custom Recharts tooltip, and small utilities.
 */

import { ResponsiveContainer } from "recharts";

// ── Palette ──────────────────────────────────────────────────────────────────
// Green-forward categorical palette (BDI green first), echoing the R report.
export const PALETTE = [
  "#007A4D", // BDI green
  "#1d98b2", // teal
  "#a0d187", // light green
  "#00452f", // deep green
  "#9e9c85", // stone
  "#d84a5d", // coral
  "#ffce40", // gold
  "#6a4c93", // violet
  "#e07a5f", // terracotta
  "#3d5a80", // slate blue
  "#81b29a", // sage
  "#bc6c25", // amber
];

/** Stable color for the Nth series. */
export const colorAt = (i) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

/**
 * Fiscal-year series colors — a green ramp so older years read lighter and the
 * current year reads as the strong BDI green (matches the report's intent).
 */
const FY_RAMP = ["#c9e6d5", "#8fc7a6", "#4da47a", "#1d8a5e", "#007A4D"];
export function fyColorMap(fyLabels) {
  const map = {};
  const n = fyLabels.length;
  fyLabels.forEach((fy, i) => {
    // Right-align onto the ramp so the most recent year is the darkest green.
    map[fy] = FY_RAMP[Math.max(0, FY_RAMP.length - n + i)] || colorAt(i);
  });
  return map;
}

// ── Formatters ───────────────────────────────────────────────────────────────
export const money0 = (v) =>
  `$${Math.round(Number(v) || 0).toLocaleString()}`;

export const moneyShort = (v) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};

export const comma = (v) => (Number(v) || 0).toLocaleString();

export const pct1 = (v) =>
  `${((Number(v) || 0) * 100).toFixed(1)}%`;

// Fiscal month labels: index by (num-1) after rotating to the FY start month.
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fiscalMonthLabel(num, fyStartMonth) {
  const calendarIdx = ((fyStartMonth - 1) + (num - 1)) % 12;
  return MONTH_NAMES[calendarIdx];
}

// ── Chart frame ──────────────────────────────────────────────────────────────
/** Titled, responsive container for a single chart. */
export function ChartCard({ title, subtitle, height = 340, children }) {
  return (
    <div className="qbr-chart-card">
      {title && <div className="qbr-chart-title">{title}</div>}
      {subtitle && <div className="qbr-chart-sub">{subtitle}</div>}
      <div className="qbr-chart-body" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Custom tooltip ───────────────────────────────────────────────────────────
/** Recharts tooltip content styled to the app; `fmt` formats each value. */
export function makeTooltip(fmt) {
  return function QbrTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="qbr-recharts-tip">
        <div className="tip-label">{label}</div>
        {payload
          .filter((p) => p.value !== 0 && p.value != null)
          .map((p, i) => (
            <div className="tip-row" key={i}>
              <span className="tip-swatch" style={{ background: p.color || p.fill }} />
              {p.name}: {fmt(p.value)}
            </div>
          ))}
      </div>
    );
  };
}

// ── Data table ───────────────────────────────────────────────────────────────
/**
 * Styled table matching the app's .data-table.
 * @param {object[]} columns - { key, label, fmt?, align? }
 * @param {object[]} rows
 * @param {object}  [totals] - optional totals row (same keys); rendered bold
 * @param {string}  [firstColLabel] - header for the sticky first column
 */
export function QbrTable({ columns, rows, totals, title }) {
  return (
    <div className="data-table-wrap" style={{ marginBottom: 16 }}>
      {title && (
        <div className="data-table-header">
          {title}
          <span className="data-table-count">{rows.length} rows</span>
        </div>
      )}
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c.key} className={i === 0 ? "period-cell" : ""}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((c, ci) => (
                  <td key={c.key} className={ci === 0 ? "period-cell" : ""}>
                    {c.fmt ? c.fmt(row[c.key], row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {totals && (
              <tr className="totals-row">
                {columns.map((c, ci) => (
                  <td key={c.key} className={ci === 0 ? "period-cell" : ""}>
                    {ci === 0
                      ? totals[c.key] ?? "Total"
                      : c.fmt
                      ? c.fmt(totals[c.key], totals)
                      : totals[c.key]}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CSV export ───────────────────────────────────────────────────────────────
export function downloadCsv(filename, headerRow, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headerRow.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
