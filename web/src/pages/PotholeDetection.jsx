import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const chartAxis = {
  ticks: { color: "rgba(200,216,240,0.78)", font: { size: 11 } },
  grid: { color: "rgba(99,102,241,0.08)" },
  border: { color: "rgba(99,102,241,0.2)" },
};

function priorityBadge(p) {
  if (p === "Critical") return "badge-error";
  if (p === "High") return "badge-pending";
  if (p === "Moderate") return "badge-info";
  return "badge-success";
}

const ZONE_LABELS = [["NW","N","NE"],["W","Center","E"],["SW","S","SE"]];

export default function PotholeDetection() {
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

  const potholeModel = data?.pothole_model || {};
  const modelInfo = potholeModel.model || {};
  const predictions = potholeModel.prediction_zones || [];
  const eventSamples = potholeModel.event_samples || [];
  const detectedClasses = potholeModel.detected_classes || {};
  const grid = data?.digital_twin?.grid || [];

  const criticalCount = predictions.filter(p => p.priority === "Critical").length;
  const highCount = predictions.filter(p => p.priority === "High").length;
  const avgConfidence = predictions.length ? (predictions.reduce((a, p) => a + (p.confidence || 0), 0) / predictions.length * 100).toFixed(1) : "0.0";

  // Zone pothole heatmap
  const zoneGrid = useMemo(() => {
    const g = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ prob: 0, label: "", hits: 0 })));
    grid.forEach(z => {
      const r = Math.min(2, Math.max(0, z.row ?? 0));
      const c = Math.min(2, Math.max(0, z.col ?? 0));
      g[r][c] = { prob: z.pothole_probability || 0, label: z.zone_label || ZONE_LABELS[r][c], hits: z.pothole_hits || 0 };
    });
    return g;
  }, [grid]);

  // Detected classes bar chart
  const classLabels = Object.keys(detectedClasses);
  const classBarData = {
    labels: classLabels.length > 0 ? classLabels : ["(none detected)"],
    datasets: [{
      label: "Detections",
      data: classLabels.length > 0 ? classLabels.map(k => detectedClasses[k]) : [0],
      backgroundColor: "rgba(239,68,68,0.55)",
      borderColor: "#ef4444",
      borderWidth: 1,
    }],
  };

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
          {loading ? "Scanning..." : "Detect Potholes"}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {/* Overview Stats */}
      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Prediction Zones</div><div className="stat-value">{predictions.length}</div></div>
        <div className="stat-card"><div className="stat-label">Critical</div><div className="stat-value" style={{ color: "#f87171" }}>{criticalCount}</div></div>
        <div className="stat-card"><div className="stat-label">High Priority</div><div className="stat-value" style={{ color: "#fbbf24" }}>{highCount}</div></div>
        <div className="stat-card"><div className="stat-label">Avg Confidence</div><div className="stat-value">{avgConfidence}<span className="stat-unit">%</span></div></div>
        <div className="stat-card"><div className="stat-label">Event Samples</div><div className="stat-value">{eventSamples.length}</div></div>
      </div>

      {/* Model Info Card */}
      <div className="card">
        <div className="card-title">Detection Model</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <div className="stat-label">Model Name</div>
            <div style={{ color: "#fff", fontWeight: 600, marginTop: 4 }}>{modelInfo.name || "N/A"}</div>
          </div>
          <div>
            <div className="stat-label">Features</div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{(modelInfo.features || []).join(" • ")}</div>
          </div>
          <div>
            <div className="stat-label">Calibration</div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{modelInfo.calibration || "N/A"}</div>
          </div>
        </div>
      </div>

      {/* Priority Queue + Zone Heatmap */}
      <div className="panel-grid panel-grid-2">
        <div className="card" style={{ minHeight: 380 }}>
          <div className="card-title">Priority Repair Queue</div>
          <div style={{ display: "grid", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {predictions.length === 0 ? (
              <div className="alert alert-info" style={{ marginBottom: 0 }}>No pothole risk zones detected in this replay.</div>
            ) : predictions.map((p, i) => (
              <div key={p.zone_id || i} className="priority-item">
                <div className={`badge ${priorityBadge(p.priority)}`}>
                  <span className="badge-dot" />{p.priority}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>{p.zone_label || p.zone_id}</div>
                  <div className="text-mono" style={{ fontSize: 11, color: "#94a3b8" }}>
                    Probability: {((p.pothole_probability || 0) * 100).toFixed(1)}% | Confidence: {((p.confidence || 0) * 100).toFixed(0)}%
                  </div>
                  {p.supporting_signals && (
                    <div className="text-mono" style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                      Hits: {p.supporting_signals.pothole_hits || 0} | Incident rate: {((p.supporting_signals.incident_rate || 0) * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="text-mono" style={{ fontSize: 11, color: "#94a3b8" }}>Repair in</div>
                  <div style={{ fontWeight: 700, color: p.repair_window_hours <= 6 ? "#f87171" : p.repair_window_hours <= 12 ? "#fbbf24" : "#94a3b8" }}>
                    {p.repair_window_hours}h
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ minHeight: 380 }}>
          <div className="card-title">Zone Pothole Risk Heatmap</div>
          <div className="zone-grid" style={{ marginBottom: 16 }}>
            {zoneGrid.map((row, ri) => row.map((cell, ci) => {
              const pct = (cell.prob * 100).toFixed(0);
              const cls = cell.prob >= 0.5 ? "zone-high" : cell.prob >= 0.25 ? "zone-medium" : "zone-low";
              return (
                <div key={`${ri}-${ci}`} className={`zone-cell ${cls}`} style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ZONE_LABELS[ri][ci]}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{pct}%</div>
                  <div style={{ fontSize: 10, marginTop: 2 }}>Hits: {cell.hits}</div>
                </div>
              );
            }))}
          </div>
          <div style={{ height: 160 }}>
            <Bar data={classBarData} options={{
              responsive: true, maintainAspectRatio: false, indexAxis: "y",
              plugins: { legend: { labels: { color: "rgba(220,240,255,0.9)" } } },
              scales: { x: chartAxis, y: chartAxis },
            }} />
          </div>
        </div>
      </div>

      {/* Event Evidence */}
      <div className="card">
        <div className="card-title">Event Evidence Log ({eventSamples.length} samples)</div>
        <div className="log-terminal" style={{ maxHeight: 240 }}>
          {eventSamples.length === 0 ? <div className="text-muted">No pothole events detected in this replay.</div> :
            eventSamples.slice(0, 40).map((ev, i) => (
              <div key={i} style={{ color: ev.confidence >= 0.7 ? "#f87171" : "#94a3b8" }}>
                Frame {ev.frame} | {ev.zone_label} | {ev.label} | conf: {(ev.confidence * 100).toFixed(0)}% | pos: [{ev.center?.[0]}, {ev.center?.[1]}]
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
