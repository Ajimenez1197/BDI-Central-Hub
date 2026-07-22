import { useState } from "react";
import Department from "./components/Department.jsx";
import DigitalTab from "./components/DigitalTab.jsx";
import BlueBooksTab from "./components/BlueBooksTab.jsx";
import QBRTab from "./components/QBRTab.jsx";

/**
 * Central Hub is organized by department (top-level tabs). Each department owns
 * a set of reports rendered as a secondary sub-nav (see Department.jsx). Add a
 * report by dropping a component into the department's `reports` array; add a
 * department by adding an entry here. Empty departments show a placeholder.
 */
const DEPARTMENTS = [
  {
    id: "digital",
    label: "Digital",
    reports: [
      { id: "new-reactivated", label: "New & Reactivated Donors", component: DigitalTab },
    ],
  },
  {
    id: "project-management",
    label: "Project Management",
    reports: [],
  },
  {
    id: "client-service",
    label: "Client Service",
    reports: [
      { id: "qbr", label: "Quarterly Business Report", component: QBRTab },
      { id: "blue-books", label: "Blue Books", component: BlueBooksTab },
    ],
  },
  {
    id: "creative",
    label: "Creative",
    reports: [],
  },
];

export default function App() {
  const [activeDept, setActiveDept] = useState(DEPARTMENTS[0].id);

  const department = DEPARTMENTS.find((d) => d.id === activeDept) || DEPARTMENTS[0];

  return (
    <div className="app">
      <header className="toolbar-header">
        <div className="toolbar-brand">
          <img
            src="https://bdibeefreeassets.blob.core.windows.net/client-assets/bdi-logo.png"
            alt="BDI"
            className="brand-logo"
          />
          <h1><span>Central Hub</span></h1>
        </div>
        <nav className="tab-nav">
          {DEPARTMENTS.map((dept) => (
            <button
              key={dept.id}
              className={`tab-btn ${activeDept === dept.id ? "active" : ""}`}
              onClick={() => setActiveDept(dept.id)}
            >
              {dept.label}
            </button>
          ))}
        </nav>
      </header>

      <Department key={department.id} department={department} />
    </div>
  );
}
