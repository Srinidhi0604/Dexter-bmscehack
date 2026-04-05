import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bar, Line } from "react-chartjs-2";
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend,
  LineElement, LinearScale, PointElement, Tooltip,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const chartAxis = {
  ticks: { color: "rgba(200,216,240,0.78)", font: { size: 11 } },
  grid: { color: "rgba(99,102,241,0.08)" },
  border: { color: "rgba(99,102,241,0.2)" },
};

function statusBadge(s) {
  if (s === "CRITICAL") return "badge-error";
  if (s === "WATCH") return "badge-pending";
  return "badge-success";
}

const ZONE_LABELS = [["NW","N","NE"],["W","Center","E"],["SW","S","SE"]];

export default function DisasterRerouting() {
  const loc = useLocation();
  const queryPath = useMemo(() => new URLSearchParams(loc.search).get("path") || "", [loc.search]);

  const [files, setFiles] = useState([]);
  const [selectedPath, setSelectedPath] = useState(queryPath);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/visualization/files")
      .then(r => r.json())
      .then(d => { const l = Array.isArray(d) ? d : []; setFiles(l); if (!queryPath && l.length > 0 && !selectedPath) setSelectedPath(l[0].path); })
      .catch(() => {});
  }, []);

  useEffect(() => { if (queryPath) setSelectedPath(queryPath); }, [queryPath]);

  async function loadData(path = selectedPath) {
    if (!path) return;
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/visualization/disaster-management?path=${encodeURIComponent(path)}&sample_step=4`);
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`); }
      setData(await r.json());
    } catch (e) { setError(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (selectedPath) loadData(selectedPath); }, [selectedPath]);

  const summary = data?.summary || {};
  const zoneSummary = data?.zone_summary || {};
  const rerouting = data?.rerouting_plan || [];
  const digitalTwin = data?.digital_twin || {};
  const grid = digitalTwin.grid || [];
  const scenarios = digitalTwin.scenarios || [];
  const bestScenario = digitalTwin.best_scenario || null;
  const baseline = digitalTwin.baseline || {};
  const projectedTimeline = digitalTwin.projected_risk_timeline || [];
  const playbook = data?.playbook || [];
  const disasterIndex = Number(data?.disaster_index || 0);
  const status = data?.report?.status || "STABLE";

  // 3x3 zone grid
  const zoneGrid = useMemo(() => {
    const g = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ risk: 0, sev: "LOW", label: "" })));
    grid.forEach(z => {
      const r = Math.min(2, Math.max(0, z.row ?? 0));
      const c = Math.min(2, Math.max(0, z.col ?? 0));
      g[r][c] = { risk: z.risk_score || 0, sev: z.severity || "LOW", label: z.zone_label || ZONE_LABELS[r][c] };
    });
    return g;
  }, [grid]);

  // Scenario comparison chart
  const scenarioData = {
    labels: scenarios.map(s => s.name),
    datasets: [{
      label: "Resilience Index",
      data: scenarios.map(s => Number(s.resilience_index || 0)),
      backgroundColor: "rgba(99,102,241,0.55)", borderColor: "#6366f1", borderWidth: 1,
    }, {
      label: "ETA Gain %",
      data: scenarios.map(s => Number(s.eta_gain_projection_pct || 0)),
      backgroundColor: "rgba(16,185,129,0.5)", borderColor: "#10b981", borderWidth: 1,
    }],
  };

  // Risk recovery
  const recoveryData = {
    labels: projectedTimeline.map((_, i) => `T+${i + 1}`),
    datasets: [{
      label: "Projected Risk", data: projectedTimeline,
      borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.2)", fill: true, tension: 0.28,
    }],
  };

  // Before vs After comparison
  const afterMetrics = bestScenario?.metrics_after || {};
  const compareItems = [
    { label: "Density", before: baseline.density || 0, after: afterMetrics.density || 0, fmt: v => (v * 100).toFixed(1) + "%" },
    { label: "Avg Speed", before: baseline.avg_speed_kmh || 0, after: afterMetrics.avg_speed_kmh || 0, fmt: v => v.toFixed(1) + " km/h" },
    { label: "Risk Score", before: baseline.risk_score || 0, after: afterMetrics.risk_score || 0, fmt: v => (v * 100).toFixed(1) + "%" },
  ];

  return (
    <div className="fade-in" style={{ display: "grid", gap: 16 }}>
      {/* Source selector */}
      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Replay Source</label>
          <select className="form-control" value={selectedPath} onChange={e => setSelectedPath(e.target.value)}>
            {files.length === 0 && <option value="">(no replay files)</option>}
            {files.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => loadData(selectedPath)} disabled={!selectedPath || loading}>
          {loading ? "Computing..." : "Generate Rerouting Plan"}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {/* Status Banner */}
      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
            Disaster Management — System Overview
          </div>
          <div className="text-mono" style={{ color: "#94a3b8", fontSize: 12 }}>
            {data?.report?.headline || "Load a replay to generate rerouting analysis"}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="stat-label">Disaster Index</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: disasterIndex >= 60 ? "#f87171" : disasterIndex >= 35 ? "#fbbf24" : "#34d399" }}>
            {disasterIndex.toFixed(1)}
          </div>
          <div className={`badge ${statusBadge(status)}`} style={{ marginTop: 6 }}><span className="badge-dot" />{status}</div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Active Reroutes</div><div className="stat-value">{rerouting.length}</div></div>
        <div className="stat-card"><div className="stat-label">High Risk Zones</div><div className="stat-value" style={{ color: "#f87171" }}>{zoneSummary.HIGH || 0}</div></div>
        <div className="stat-card"><div className="stat-label">Medium Zones</div><div className="stat-value" style={{ color: "#fbbf24" }}>{zoneSummary.MEDIUM || 0}</div></div>
        <div className="stat-card"><div className="stat-label">Safe Zones</div><div className="stat-value" style={{ color: "#34d399" }}>{zoneSummary.LOW || 0}</div></div>
        <div className="stat-card"><div className="stat-label">Best Strategy</div><div className="stat-value" style={{ fontSize: 14 }}>{bestScenario?.name || "N/A"}</div></div>
      </div>

      {/* Active Rerouting Plan + Zone Grid */}
      <div className="panel-grid panel-grid-2">
        <div className="card" style={{ minHeight: 380 }}>
          <div className="card-title">Active Rerouting Plan</div>
          <div style={{ display: "grid", gap: 10, maxHeight: 320, overflowY: "auto" }}>
            {rerouting.length === 0 ? (
              <div className="alert alert-info" style={{ marginBottom: 0 }}>No reroutes required for current conditions.</div>
            ) : rerouting.map((rt, i) => (
              <div key={rt.route_id || i} style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14,
                background: "rgba(30,41,59,0.25)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className={`badge ${rt.priority === "Immediate" ? "badge-error" : "badge-pending"}`}>
                      <span className="badge-dot" />{rt.priority}
                    </span>
                    <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{rt.route_id}</span>
                  </div>
                  <span className="badge badge-success">+{Number(rt.eta_gain_pct || 0).toFixed(1)}% ETA</span>
                </div>
                <div className="text-mono" style={{ fontSize: 12, color: "#94a3b8" }}>
                  <span style={{ color: "#f87171" }}>{rt.source_zone}</span>
                  <span style={{ color: "#64748b", margin: "0 8px" }}>→</span>
                  <span style={{ color: "#34d399" }}>{rt.target_zone}</span>
                </div>
                {rt.signal_directive && (
                  <div className="text-mono" style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    Signal: {rt.signal_directive}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ minHeight: 380 }}>
          <div className="card-title">Zone Risk Grid</div>
          <div className="zone-grid" style={{ marginBottom: 16 }}>
            {zoneGrid.map((row, ri) => row.map((cell, ci) => {
              const cls = cell.sev === "HIGH" ? "zone-high" : cell.sev === "MEDIUM" ? "zone-medium" : "zone-low";
              return (
                <div key={`${ri}-${ci}`} className={`zone-cell ${cls}`} style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ZONE_LABELS[ri][ci]}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{(cell.risk * 100).toFixed(0)}%</div>
                  <div style={{ fontSize: 10 }}>{cell.sev}</div>
                </div>
              );
            }))}
          </div>
          {/* Before vs After */}
          {bestScenario && (
            <div>
              <div className="card-title" style={{ fontSize: 13, marginTop: 8 }}>Before vs After ({bestScenario.name})</div>
              {compareItems.map(item => (
                <div key={item.label} style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <div className="text-mono" style={{ fontSize: 11, color: "#94a3b8" }}>{item.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div className="progress-track" style={{ flex: 1, height: 6 }}>
                      <div className="progress-fill" style={{ width: `${Math.min(100, item.before * 100)}%`, background: "#ef4444" }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#f87171", fontFamily: "var(--font-mono)" }}>{item.fmt(item.before)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div className="progress-track" style={{ flex: 1, height: 6 }}>
                      <div className="progress-fill" style={{ width: `${Math.min(100, item.after * 100)}%`, background: "#10b981" }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#34d399", fontFamily: "var(--font-mono)" }}>{item.fmt(item.after)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scenarios + Recovery */}
      <div className="panel-grid panel-grid-2">
        <div className="card" style={{ minHeight: 320 }}>
          <div className="card-title">Digital Twin Scenarios</div>
          {scenarios.length > 0 ? (
            <div style={{ height: 240 }}>
              <Bar data={scenarioData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: "rgba(220,240,255,0.92)" } } },
                scales: { x: chartAxis, y: chartAxis },
              }} />
            </div>
          ) : (
            <div className="alert alert-info" style={{ marginBottom: 0 }}>No scenarios available.</div>
          )}
        </div>
        <div className="card" style={{ minHeight: 320 }}>
          <div className="card-title">Projected Risk Recovery</div>
          {projectedTimeline.length > 0 ? (
            <div style={{ height: 240 }}>
              <Line data={recoveryData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: "rgba(220,240,255,0.92)" } } },
                scales: { x: chartAxis, y: { ...chartAxis, min: 0, max: 1 } },
              }} />
            </div>
          ) : (
            <div className="alert alert-info" style={{ marginBottom: 0 }}>No risk projection available.</div>
          )}
        </div>
      </div>

      {/* Playbook */}
      <div className="card">
        <div className="card-title">Emergency Response Playbook</div>
        <div style={{ display: "grid", gap: 8 }}>
          {playbook.length === 0 ? (
            <div className="alert alert-info" style={{ marginBottom: 0 }}>No playbook generated.</div>
          ) : playbook.map((line, i) => (
            <div key={i} className="priority-item" style={{ gridTemplateColumns: "auto 1fr" }}>
              <div className="badge badge-info">Step {i + 1}</div>
              <div style={{ color: "#e2e8f0", fontSize: 13 }}>{line}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
