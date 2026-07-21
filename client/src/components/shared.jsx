/**
 * shared.jsx — Components used across tabs.
 */

export const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/** Error banner in a card. `detail` may be a string or JSX; children render below it. */
export function ErrorCard({ title, detail, children }) {
  return (
    <div className="card fade-in">
      <div className="result-banner error">
        <strong>{title}</strong>
        {detail != null && <div className="error-detail">{detail}</div>}
        {children}
      </div>
    </div>
  );
}

/** Full-tab placeholder for departments whose reports aren't built yet. */
export function PlaceholderTab({ name }) {
  return (
    <div className="placeholder-panel fade-in">
      <span className="placeholder-badge">{name}</span>
      <h2>Coming soon</h2>
      <p>
        The {name} reports haven't been added to the Central Hub yet. This tab is
        ready to host them as they come online.
      </p>
    </div>
  );
}
