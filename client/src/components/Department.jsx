import { useState } from "react";
import { PlaceholderTab } from "./shared.jsx";

/**
 * Department — renders one department's reports.
 *
 * Every department is a collection of reports (its "reporting tabs"). This
 * component draws the secondary report sub-nav and mounts the active report.
 * A department with no reports yet falls back to the coming-soon placeholder,
 * so new departments light up the moment a report is added to the config.
 *
 * @param {{ department: { id, label, reports: {id,label,component}[] } }} props
 */
export default function Department({ department }) {
  const reports = department.reports || [];
  const [activeReport, setActiveReport] = useState(reports[0]?.id ?? null);

  if (reports.length === 0) {
    return <PlaceholderTab name={department.label} />;
  }

  const current = reports.find((r) => r.id === activeReport) || reports[0];
  const ReportComponent = current.component;

  return (
    <>
      <nav className="subtab-nav" aria-label={`${department.label} reports`}>
        {reports.map((r) => (
          <button
            key={r.id}
            className={`subtab-btn ${current.id === r.id ? "active" : ""}`}
            onClick={() => setActiveReport(r.id)}
          >
            {r.label}
          </button>
        ))}
      </nav>

      <ReportComponent />
    </>
  );
}
