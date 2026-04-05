import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bar, Line, Radar, Doughnut } from "react-chartjs-2";
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS,
  Filler, Legend, LineElement, LinearScale, PointElement,
  RadialLinearScale, Tooltip,
} from "chart.js";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, RadialLinearScale, Tooltip, Legend, Filler,
);

const chartAxis = {
  ticks: { color: "rgba(200,216,240,0.78)", font: { size: 11 } },
  grid: { color: "rgba(99,102,241,0.08)" },
  border: { color: "rgba(99,102,241,0.2)" },
};

const smallOpts = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: "rgba(220,240,255,0.92)" } } },
  scales: { x: chartAxis, y: chartAxis },
};

export default function BehaviorPatterns() {
  const loc = useLocation();
  const queryPath = useMemo(() => new URLSearchParams(loc.search).get("path") || "", [loc.search]);

  const [files, setFiles] = useState([]);
  const [selectedPath, setSelectedPath] = useState(queryPath);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/visualization/files")
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : [];
        setFiles(list);
        if (!queryPath && list.length > 0 && !selectedPath) setSelectedPath(list[0].path);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { if (queryPath) setSelectedPath(queryPath); }, [queryPath]);

  async function loadData(path = selectedPath) {
    if (!path) return;
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/visualization/analytics?path=${encodeURIComponent(path)}&sample_step=3`);
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`); }
      setAnalytics(await r.json());
    } catch (e) { setError(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (selectedPath) loadData(selectedPath); }, [selectedPath]);

  const timeline = analytics?.timeline || [];
  const summary = analytics?.summary || {};
  const kpis = analytics?.kpis || {};
  const distributions = analytics?.distributions || {};
  const hotspots = analytics?.hotspots || {};
  const labels = timeline.map(t => String(t.frame));

  // Speed distribution buckets
  const speedBuckets = useMemo(() => {
    const buckets = { "0-5": 0, "5-10": 0, "10-15": 0, "15-20": 0, "20-30": 0, "30+": 0 };
    timeline.forEach(t => {
      const s = Number(t.avg_speed_kmh || 0);
      if (s < 5) buckets["0-5"]++;
      else if (s < 10) buckets["5-10"]++;
      else if (s < 15) buckets["10-15"]++;
      else if (s < 20) buckets["15-20"]++;
      else if (s < 30) buckets["20-30"]++;
      else buckets["30+"]++;
    });
    return buckets;
  }, [timeline]);

  // Congestion state transition counts
  const transitions = useMemo(() => {
    const t = { "LOW→LOW": 0, "LOW→MED": 0, "LOW→HIGH": 0, "MED→LOW": 0, "MED→MED": 0, "MED→HIGH": 0, "HIGH→LOW": 0, "HIGH→MED": 0, "HIGH→HIGH": 0 };
    const short = { LOW: "LOW", MEDIUM: "MED", HIGH: "HIGH" };
    for (let i = 1; i < timeline.length; i++) {
      const prev = short[timeline[i - 1].congestion_level] || "LOW";
      const curr = short[timeline[i].congestion_level] || "LOW";
      const key = `${prev}→${curr}`;
      if (key in t) t[key]++;
    }
    return t;
  }, [timeline]);

  // Density evolution line
  const densityData = {
    labels,
    datasets: [{
      label: "Density", data: timeline.map(t => t.density),
      borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.2)", fill: true, tension: 0.28,
    }, {
      label: "Congestion Score", data: timeline.map(t => t.congestion_score),
      borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.15)", fill: false, tension: 0.24,
    }],
  };

  // Speed histogram
  const speedHistData = {
    labels: Object.keys(speedBuckets),
    datasets: [{
      label: "Frames in Range",
      data: Object.values(speedBuckets),
      backgroundColor: ["rgba(16,185,129,0.5)", "rgba(99,102,241,0.5)", "rgba(139,92,246,0.5)", "rgba(245,158,11,0.5)", "rgba(239,68,68,0.4)", "rgba(239,68,68,0.6)"],
      borderColor: ["#10b981", "#6366f1", "#8b5cf6", "#f59e0b", "#ef4444", "#ef4444"],
      borderWidth: 1,
    }],
  };

  // Vehicle class doughnut
  const classTotals = distributions.class_totals || {};
  const classData = {
    labels: ["Car", "Bike", "Bus", "Truck", "Other"],
    datasets: [{
      data: [classTotals.car || 0, classTotals.bike || 0, classTotals.bus || 0, classTotals.truck || 0, classTotals.other || 0],
      backgroundColor: ["rgba(99,102,241,0.65)", "rgba(16,185,129,0.65)", "rgba(139,92,246,0.65)", "rgba(245,158,11,0.65)", "rgba(239,68,68,0.65)"],
      borderColor: ["#6366f1", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"],
    }],
  };

  // KPI radar
  const radarData = {
    labels: ["Throughput", "Stability", "Safety", "Readiness"],
    datasets: [{
      label: "Current", data: [kpis.throughput_index || 0, kpis.stability_index || 0, kpis.safety_index || 0, kpis.junction_readiness || 0],
      borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.2)",
    }, {
      label: "Ideal", data: [85, 90, 95, 88],
      borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.08)", borderDash: [4, 4],
    }],
  };

  // Vehicle count + stopped vehicles
  const flowData = {
    labels,
    datasets: [{
      label: "Vehicles", data: timeline.map(t => t.vehicle_count),
      borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.18)", fill: true, tension: 0.28, yAxisID: "yL",
    }, {
      label: "Stopped", data: timeline.map(t => t.stopped_vehicles || 0),
      borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.2)", fill: true, tension: 0.24, yAxisID: "yR",
    }],
  };

  const flowOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "rgba(220,240,255,0.92)" } } },
    scales: {
      x: chartAxis,
      yL: { ...chartAxis, position: "left" },
      yR: { ...chartAxis, position: "right", grid: { drawOnChartArea: false } },
    },
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
          {loading ? "Loading..." : "Analyze"}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {/* KPI Overview */}
      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Avg Speed</div><div className="stat-value">{Number(summary.avg_speed_kmh || 0).toFixed(1)}<span className="stat-unit">km/h</span></div></div>
        <div className="stat-card"><div className="stat-label">Avg Vehicles</div><div className="stat-value">{Number(summary.avg_vehicle_count || 0).toFixed(0)}</div></div>
        <div className="stat-card"><div className="stat-label">Peak Count</div><div className="stat-value">{summary.peak_vehicle_count ?? 0}</div></div>
        <div className="stat-card"><div className="stat-label">Stability</div><div className="stat-value">{Number(kpis.stability_index || 0).toFixed(1)}</div></div>
        <div className="stat-card"><div className="stat-label">Safety</div><div className="stat-value">{Number(kpis.safety_index || 0).toFixed(1)}</div></div>
      </div>

      {/* Row 1: Speed Distribution + Class Composition */}
      <div className="panel-grid panel-grid-2">
        <div className="card" style={{ minHeight: 320 }}>
          <div className="card-title">Speed Distribution Profile (km/h)</div>
          <div style={{ height: 250 }}>
            <Bar data={speedHistData} options={smallOpts} />
          </div>
        </div>
        <div className="card" style={{ minHeight: 320 }}>
          <div className="card-title">Vehicle Class Composition</div>
          <div style={{ height: 250 }}>
            <Doughnut data={classData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "rgba(220,240,255,0.9)" } } } }} />
          </div>
        </div>
      </div>

      {/* Row 2: Vehicle Flow + Density/Congestion */}
      <div className="panel-grid panel-grid-2">
        <div className="card" style={{ minHeight: 320 }}>
          <div className="card-title">Vehicle Count vs Stopped Vehicles</div>
          <div style={{ height: 250 }}><Line data={flowData} options={flowOpts} /></div>
        </div>
        <div className="card" style={{ minHeight: 320 }}>
          <div className="card-title">Density & Congestion Timeline</div>
          <div style={{ height: 250 }}><Line data={densityData} options={{ ...smallOpts, scales: { x: chartAxis, y: { ...chartAxis, min: 0, max: 1 } } }} /></div>
        </div>
      </div>

      {/* Row 3: KPI Radar + Congestion Transitions */}
      <div className="panel-grid panel-grid-2">
        <div className="card" style={{ minHeight: 340 }}>
          <div className="card-title">KPI Behavior Fingerprint (Current vs Ideal)</div>
          <div style={{ height: 270 }}>
            <Radar data={radarData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { labels: { color: "rgba(220,240,255,0.92)" } } },
              scales: { r: { angleLines: { color: "rgba(99,102,241,0.15)" }, grid: { color: "rgba(99,102,241,0.15)" }, pointLabels: { color: "rgba(220,240,255,0.85)" }, ticks: { display: false }, min: 0, max: 100 } },
            }} />
          </div>
        </div>
        <div className="card" style={{ minHeight: 340 }}>
          <div className="card-title">Congestion State Transitions</div>
          <div style={{ fontSize: 12 }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead><tr><th>From → To</th><th>Count</th><th>Share</th></tr></thead>
              <tbody>
                {Object.entries(transitions).map(([key, count]) => {
                  const total = Math.max(1, timeline.length - 1);
                  const pct = ((count / total) * 100).toFixed(1);
                  const color = key.includes("HIGH") ? "#f87171" : key.includes("MED") ? "#fbbf24" : "#34d399";
                  return (
                    <tr key={key}>
                      <td style={{ fontFamily: "var(--font-mono)", color }}>{key}</td>
                      <td>{count}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="progress-track" style={{ flex: 1, height: 4 }}>
                            <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Hotspot Evidence */}
      <div className="card">
        <div className="card-title">Hotspot Density Evidence</div>
        <div className="json-viewer" style={{ maxHeight: 200 }}>
{JSON.stringify({ density: (hotspots.density || []).slice(0, 8), stopped: (hotspots.stopped || []).slice(0, 6) }, null, 2)}
        </div>
      </div>
    </div>
  );
}
