import { useState } from "react";
import DigitalTab from "./components/DigitalTab.jsx";
import ClientServiceTab from "./components/ClientServiceTab.jsx";
import { PlaceholderTab } from "./components/shared.jsx";

const TABS = [
  { id: "digital", label: "Digital" },
  { id: "project-management", label: "Project Management" },
  { id: "client-service", label: "Client Service" },
  { id: "creative", label: "Creative" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("digital");

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
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "digital" && <DigitalTab />}
      {activeTab === "project-management" && <PlaceholderTab name="Project Management" />}
      {activeTab === "client-service" && <ClientServiceTab />}
      {activeTab === "creative" && <PlaceholderTab name="Creative" />}
    </div>
  );
}
