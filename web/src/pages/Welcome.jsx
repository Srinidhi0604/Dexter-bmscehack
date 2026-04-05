import { useEffect, useState } from "react";
import { Terminal, Map as MapIcon, Database, Eye, Play } from 'lucide-react';

export default function Welcome() {
  const [apiOk, setApiOk] = useState(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setApiOk(d.status === "ok"))
      .catch(() => setApiOk(false));
  }, []);

  return (
    <div className="page-body fade-in">
      <div className="stat-row" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Core Engine Status</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <div
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: apiOk === null ? "#888" : apiOk ? "#22c55e" : "#ef4444",
                boxShadow: `0 0 12px ${apiOk === null ? "#888" : apiOk ? "#22c55e" : "#ef4444"}`
              }}
            />
            <span className="text-mono" style={{ fontSize: 13, color: apiOk === null ? "#888" : apiOk ? "#22c55e" : "#ef4444" }}>
              {apiOk === null ? "Pinging..." : apiOk ? "Connected. Pipeline Active" : "Offline / Unreachable"}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Platform Core</div>
          <div className="stat-value" style={{ fontSize: 14, marginTop: 4 }}>
            TrafficLab Distributed
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Version</div>
          <div className="stat-value text-mono" style={{ fontSize: 14, marginTop: 4 }}>
            v1.1.0-beta
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Main Hero Card */}
          <div className="card" style={{ padding: 32, background: 'linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))', borderColor: 'rgba(99, 102, 241, 0.4)' }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: -1, marginBottom: 12 }}>
              TRAFFIC<span style={{ color: "#6366f1" }}>LAB</span> 3D
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.65)", maxWidth: 600 }}>
              AI-powered traffic analysis system built for drone and CCTV footage. Seamlessly integrate YOLO object detection, deep multi-object tracking, 3D vehicle lifting algorithms, and strict satellite map projection protocols.
            </p>
          </div>

          {/* Quick Start Steps */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 20 }}>Workflow Initialization</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                ["Location Map", "Initialize workspace with raw CCTV extraction and corresponding high-res satellite imagery.", MapIcon],
                ["Calibration", "Calculate Homography matrices matching the 2D plane to the Geo-projection.", Database],
                ["Inference", "Run YOLO bounding-box scanning across footage arrays in real-time.", Eye],
                ["Visualization", "Compile outputs and replay annotated footage natively within the digital twin engine.", Play]
              ].map(([step, desc, Icon], i) => (
                <div key={i} style={{ display: "flex", gap: 16, alignItems: "center", padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Step 0{i + 1} — {step}</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Core Technical Specifications List */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 20 }}>Core Specs & Tooling</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ["YOLO Detection", "YOLOv11 fine-tuned over VisDrone dataset"],
                ["ByteTrack MOT", "Persistent vehicle UUID assignments"],
                ["3D Object Lifting", "Deep geo-referenced volume mapping"],
                ["Satellite Projection", "Strict homography-based bird's-eye view mapping"],
                ["Kinematics Output", "Live speed (km/h) evaluation & trajectory smoothing"],
              ].map(([title, desc]) => (
                <div key={title} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={14} style={{ color: '#6366f1' }}/>
              Keyboard Bindings
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Keystroke</th>
                  <th>Action bound</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Space", "Pause / Play pipeline playback"],
                  ["<- / ->", "Step frame manually"],
                  ["1", "Toggle color-by-ID visualizer"],
                  ["3", "Toggle 3D wireframe boxes"],
                  ["F", "Toggle Geo-FOV lens overlay"],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <code style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', padding: '2px 6px', borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                        {k}
                      </code>
                    </td>
                    <td style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
