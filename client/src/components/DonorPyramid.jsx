/**
 * DonorPyramid.jsx — a stacked-trapezoid ("funnel") donor pyramid.
 *
 * Tiers stack Major (apex) → Middle → Mass (base). Band WIDTHS are always
 * scaled to the *revenue* distribution, not the metric being labeled. Donor
 * counts are far too skewed to chart directly (Major is routinely <1% of the
 * file, which collapses to an invisible sliver), so we borrow the more even
 * revenue split for the shape and let the labels carry the real numbers. That
 * means the donor and revenue charts for a given entity share a silhouette and
 * differ only in their labels — by design.
 */

// Top → bottom. Colors are the BDI green family (dark apex → light base).
const TIERS = [
  { key: "major",  label: "Major",  hint: "$10K+",   color: "#013d27", text: "#ffffff" },
  { key: "middle", label: "Middle", hint: "$1K–10K", color: "#017a4d", text: "#ffffff" },
  { key: "mass",   label: "Mass",   hint: "<$1K",    color: "#7ac4a4", text: "#013d27" },
];

function money(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function DonorPyramid({ metric, buckets, totalDonors, totalRevenue }) {
  const isRevenue = metric === "revenue";
  const pctOf = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

  // rows[0]=major (top) … rows[2]=mass (base)
  const rows = TIERS.map((t) => {
    const b = buckets[t.key];
    return {
      ...t,
      // Shape: always the revenue share, so every tier stays visible.
      shapePct: pctOf(b.revenue, totalRevenue),
      // Label: this chart's own metric.
      value: isRevenue ? b.revenue : b.donors,
      labelPct: isRevenue ? pctOf(b.revenue, totalRevenue) : pctOf(b.donors, totalDonors),
    };
  });

  const hasData = isRevenue ? totalRevenue > 0 : totalDonors > 0;
  if (!hasData) {
    return <p className="data-table-empty">No donors gave in this period.</p>;
  }

  const fmt = (v) => (isRevenue ? money(v) : Math.round(v).toLocaleString());

  // Geometry — pyramid centered in the middle zone; labels in the side gutters.
  const W = 340, H = 210;
  const cx = 168;
  const maxHalf = 82; // 100% → 164px wide at the base
  const bandH = H / 3;
  const half = (pct) => (pct / 100) * maxHalf;

  const hMajor = half(rows[0].shapePct);
  const hMiddle = half(rows[1].shapePct);
  const hMass = half(rows[2].shapePct);

  // Each tier band is a trapezoid whose width tracks its revenue share, sharing
  // an edge with its neighbour. The top tier (Major) gets a flat cap rather than
  // a point, so the silhouette morphs with the data: a pyramid when Mass leads,
  // an inverted trapezoid when Major leads, a box when the three are even.
  const bands = [
    { row: rows[0], yT: 0,         hT: hMajor,  yB: bandH,     hB: hMajor },
    { row: rows[1], yT: bandH,     hT: hMajor,  yB: bandH * 2, hB: hMiddle },
    { row: rows[2], yT: bandH * 2, hT: hMiddle, yB: H,         hB: hMass },
  ];

  const poly = (b) =>
    `${cx - b.hT},${b.yT} ${cx + b.hT},${b.yT} ${cx + b.hB},${b.yB} ${cx - b.hB},${b.yB}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pyramid-svg" role="img"
      aria-label={`Donor pyramid by ${isRevenue ? "revenue" : "donor count"}`}>
      {bands.map((b) => {
        const midY = (b.yT + b.yB) / 2;
        return (
          <g key={b.row.key}>
            <polygon points={poly(b)} fill={b.row.color} stroke="#ffffff" strokeWidth="1.5" />
            {/* tier name + threshold on the left */}
            <text x="4" y={midY - 2} className="pyr-tier">{b.row.label}</text>
            <text x="4" y={midY + 12} className="pyr-hint">{b.row.hint}</text>
            {/* value + share on the right */}
            <text x={W - 4} y={midY - 2} textAnchor="end" className="pyr-val">{fmt(b.row.value)}</text>
            <text x={W - 4} y={midY + 12} textAnchor="end" className="pyr-pct-sm">
              {b.row.labelPct.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
