import { useState, useEffect, useRef } from "react";

const STATUS_COLORS = {
  done: "badge-success",
  pending: "badge-pending",
  no_g_proj: "badge-error",
};
const STATUS_LABELS = {
  done: "Done",
  pending: "Pending",
  no_g_proj: "No G-Proj",
};

// ─── Measurements Modal ────────────────────────────────────────────────────────
function MeasurementsModal({ onClose }) {
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/config/measurements")
      .then((r) => r.json())
      .then((d) => {
        setRaw(JSON.stringify(d, null, 2));
        setLoading(false);
      })
      .catch((e) => {
        setMsg({ type: "error", text: String(e) });
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setMsg({ type: "error", text: `Invalid JSON: ${e.message}` });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/config/measurements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsed }),
      });
      if (r.ok) {
        setMsg({ type: "success", text: "Measurements saved." });
      } else {
        const d = await r.json();
        setMsg({ type: "error", text: d.detail || "Save failed" });
      }
    } catch (e) {
      setMsg({ type: "error", text: String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6,10,18,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="card"
        style={{
          width: 780,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>
            📐 Edit prior_dimensions.json
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕ Close
          </button>
        </div>
        <div
          className="alert alert-info"
          style={{ marginBottom: 12, fontSize: 12 }}
        >
          Vehicle dimension measurements used for 3D projection. Edit as JSON.
        </div>
        {loading ? (
          <div
            style={{ display: "flex", justifyContent: "center", padding: 40 }}
          >
            <div className="spinner" />
          </div>
        ) : (
          <textarea
            className="form-control"
            style={{
              minHeight: 380,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              flex: 1,
            }}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        )}
        {msg && (
          <div
            className={`alert alert-${msg.type === "success" ? "success" : "error"}`}
            style={{ marginTop: 10 }}
          >
            {msg.text}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            className="btn btn-success"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                Saving…
              </>
            ) : (
              "💾 Save Measurements"
            )}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Wipe Confirm Modal ────────────────────────────────────────────────────────
function WipeModal({ configName, onClose, onWiped }) {
  const [typed, setTyped] = useState("");
  const [wiping, setWiping] = useState(false);
  const [msg, setMsg] = useState(null);

  async function handleWipe() {
    if (typed !== "DELETE") return;
    setWiping(true);
    setMsg(null);
    try {
      const r = await fetch(
        `/api/inference/wipe?config_name=${encodeURIComponent(configName)}`,
        { method: "DELETE" },
      );
      const d = await r.json();
      if (r.ok) {
        setMsg({ type: "success", text: d.msg || "Output wiped." });
        setTimeout(() => {
          onWiped();
          onClose();
        }, 1200);
      } else {
        setMsg({ type: "error", text: d.detail || "Wipe failed" });
      }
    } catch (e) {
      setMsg({ type: "error", text: String(e) });
    } finally {
      setWiping(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6,10,18,0.9)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="card"
        style={{
          width: 460,
          borderColor: "rgba(239,68,68,0.4)",
          background: "rgba(127,44,44,0.08)",
        }}
      >
        <div
          className="card-title"
          style={{ color: "#f87171", marginBottom: 14 }}
        >
          ⚠ Wipe Output — Config: {configName}
        </div>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: "rgba(200,216,240,0.7)",
            marginBottom: 16,
          }}
        >
          This will permanently delete all inference output files for the{" "}
          <strong style={{ color: "#e8f4ff" }}>{configName}</strong> config.
          This cannot be undone.
        </p>
        <div className="form-group">
          <label className="form-label">
            Type{" "}
            <span style={{ color: "#f87171", fontFamily: "var(--font-mono)" }}>
              DELETE
            </span>{" "}
            to confirm
          </label>
          <input
            className="form-control"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            style={{
              borderColor:
                typed === "DELETE" ? "rgba(239,68,68,0.6)" : "var(--border)",
            }}
          />
        </div>
        {msg && (
          <div
            className={`alert alert-${msg.type === "success" ? "success" : "error"}`}
            style={{ marginBottom: 12 }}
          >
            {msg.text}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="btn btn-danger"
            disabled={typed !== "DELETE" || wiping}
            onClick={handleWipe}
          >
            {wiping ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                Wiping…
              </>
            ) : (
              "🗑 Wipe Output"
            )}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Inference Page ───────────────────────────────────────────────────────
export default function Inference() {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState("");
  const [configInfo, setConfigInfo] = useState(null); // { model, tracker, measurements }
  const [tasks, setTasks] = useState([]);
  const [checked, setChecked] = useState({});
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [yamlRaw, setYamlRaw] = useState("");
  const [editingYaml, setEditingYaml] = useState(false);
  const [savingYaml, setSavingYaml] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [showWipe, setShowWipe] = useState(false);
  const sseRef = useRef(null);
  const logEndRef = useRef(null);

  function loadConfig() {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setYamlRaw(d.raw || "");
        setConfigs(d.config_names || []);
        if (!selectedConfig && d.config_names?.length > 0) {
          setSelectedConfig(d.config_names[0]);
        } else if (
          selectedConfig &&
          !d.config_names?.includes(selectedConfig) &&
          d.config_names?.length > 0
        ) {
          setSelectedConfig(d.config_names[0]);
        }
      })
      .catch(() => {});
  }

  // ── Load config on mount ──
  useEffect(() => {
    loadConfig();
  }, []);

  // ── Parse config info whenever selected config or yaml changes ──
  useEffect(() => {
    if (!yamlRaw || !selectedConfig) return;
    try {
      // simple regex extraction to avoid full yaml parsing in browser
      const cfg = parseConfigSection(yamlRaw, selectedConfig);
      if (cfg) setConfigInfo(cfg);
    } catch {}
  }, [yamlRaw, selectedConfig]);

  function parseConfigSection(raw, name) {
    // Try to find the config block by indentation (2-space YAML)
    const lines = raw.split("\n");
    let inBlock = false;
    let depth = 0;
    const block = [];
    for (const line of lines) {
      if (new RegExp(`^  ${name}:`).test(line)) {
        inBlock = true;
        depth = 2;
        continue;
      }
      if (inBlock) {
        if (line.trim() === "" || /^\s*#/.test(line)) {
          block.push(line);
          continue;
        }
        const indent = line.match(/^(\s*)/)[1].length;
        if (indent <= depth && line.trim()) break;
        block.push(line);
      }
    }
    const text = block.join("\n");
    const modelM = text.match(/weights:\s*["']?([^"'\n]+)["']?/);
    const trackerM = text.match(/tracker_type:\s*["']?([^"'\n]+)["']?/);
    const measureM = text.match(/prior_dimensions:\s*["']?([^"'\n]+)["']?/);
    return {
      model: modelM ? modelM[1].trim().split("/").pop().split("\\").pop() : "—",
      tracker: trackerM ? trackerM[1].trim() : "—",
      measurements: measureM ? measureM[1].trim() : "—",
    };
  }

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Check live status on mount
  useEffect(() => {
    fetch("/api/inference/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.running) {
          setRunning(true);
          setProgress(d.progress || 0);
          startSSE();
        }
      })
      .catch(() => {});
  }, []);

  function startSSE() {
    if (sseRef.current) sseRef.current.close();
    const es = new EventSource("/api/inference/progress");
    sseRef.current = es;
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "log") {
          setLogs((prev) => [...prev.slice(-500), msg.msg]);
        } else if (msg.type === "progress") {
          setProgress(msg.pct);
        } else if (msg.type === "status") {
          setRunning(msg.running);
          setProgress(msg.progress || 0);
        }
        if (
          msg.msg === "=== Batch Finished ===" ||
          (msg.type === "status" && !msg.running)
        ) {
          setRunning(false);
          es.close();
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      setRunning(false);
    };
  }

  async function handleScan() {
    setScanning(true);
    setTasks([]);
    setChecked({});
    try {
      const r = await fetch(
        `/api/inference/scan?config_name=${encodeURIComponent(selectedConfig)}`,
      );
      const d = await r.json();
      setTasks(d.tasks || []);
      const init = {};
      d.tasks?.forEach((t, i) => {
        init[i] = t.status === "pending";
      });
      setChecked(init);
    } catch (e) {
      setLogs((prev) => [...prev, `Scan error: ${e}`]);
    } finally {
      setScanning(false);
    }
  }

  async function handleStart() {
    const selected = tasks.filter((_, i) => checked[i]);
    if (!selected.length) return;
    setLogs([`Starting ${selected.length} task(s)…`]);
    setProgress(0);
    setRunning(true);
    try {
      const r = await fetch("/api/inference/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_name: selectedConfig, tasks: selected }),
      });
      if (r.ok) {
        startSSE();
      } else {
        const d = await r.json();
        setLogs((prev) => [...prev, `Error: ${d.detail}`]);
        setRunning(false);
      }
    } catch (e) {
      setLogs((prev) => [...prev, `Error: ${e}`]);
      setRunning(false);
    }
  }

  async function handleStop() {
    await fetch("/api/inference/stop", { method: "POST" });
    setRunning(false);
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }

  async function handleSaveYaml() {
    setSavingYaml(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: yamlRaw }),
      });
      const d = await r.json();
      if (r.ok) {
        setSaveMsg({ type: "success", text: "Config saved." });
        setEditingYaml(false);
      } else {
        setSaveMsg({ type: "error", text: d.detail || "Save failed" });
      }
    } catch (e) {
      setSaveMsg({ type: "error", text: String(e) });
    } finally {
      setSavingYaml(false);
    }
  }

  function toggleAll(val) {
    const next = {};
    tasks.forEach((t, i) => {
      if (t.g_proj) next[i] = val;
    });
    setChecked(next);
  }

  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <>
      {showMeasurements && (
        <MeasurementsModal onClose={() => setShowMeasurements(false)} />
      )}
      {showWipe && (
        <WipeModal
          configName={selectedConfig}
          onClose={() => setShowWipe(false)}
          onWiped={() => {
            setTasks([]);
            setChecked({});
          }}
        />
      )}

      <div className="page-header">
        <div className="page-title">INFERENCE</div>
        <div className="page-subtitle">
          RUN YOLO DETECTION + TRACKING ON FOOTAGE
        </div>
      </div>

      <div className="page-body fade-in">
        {/* ── Config section ── */}
        <div className="card section-gap">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <div className="card-title" style={{ marginBottom: 0 }}>
              ⚙ Configuration
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowMeasurements(true)}
              >
                📐 Edit Measurements
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingYaml((v) => !v)}
              >
                {editingYaml ? "✕ Close Editor" : "✏ Edit YAML"}
              </button>
              <button
                className="btn btn-sm"
                style={{
                  background: "rgba(127,44,44,0.3)",
                  color: "#f87171",
                  border: "1px solid rgba(239,68,68,0.3)",
                }}
                onClick={() => setShowWipe(true)}
                disabled={running}
              >
                🗑 Wipe Output
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div
              className="form-group"
              style={{ marginBottom: 0, flex: "0 0 240px" }}
            >
              <label className="form-label">Config Profile</label>
              <select
                className="form-control"
                value={selectedConfig}
                onChange={(e) => setSelectedConfig(e.target.value)}
              >
                {configs.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginBottom: 0 }}
              onClick={loadConfig}
              disabled={running}
            >
              ↻ Reload Config
            </button>
            <button
              className="btn btn-primary"
              style={{ marginBottom: 0 }}
              onClick={handleScan}
              disabled={scanning || running}
            >
              {scanning ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                  Scanning…
                </>
              ) : (
                "🔍 Scan Footage"
              )}
            </button>
          </div>

          {/* Config Info Bar */}
          {configInfo && (
            <div
              style={{
                display: "flex",
                gap: 20,
                marginTop: 14,
                padding: "10px 14px",
                background: "var(--bg-elevated)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                flexWrap: "wrap",
              }}
            >
              {[
                ["Model", configInfo.model],
                ["Tracker", configInfo.tracker],
                ["Measurements", configInfo.measurements],
              ].map(([label, val]) => (
                <div
                  key={label}
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "rgba(200,216,240,0.4)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--cyan)",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                    }}
                  >
                    {val}
                  </span>
                </div>
              ))}
            </div>
          )}

          {editingYaml && (
            <div style={{ marginTop: 16 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>
                inference_config.yaml
              </div>
              <textarea
                className="form-control"
                style={{
                  minHeight: 260,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
                value={yamlRaw}
                onChange={(e) => setYamlRaw(e.target.value)}
              />
              {saveMsg && (
                <div
                  className={`alert alert-${saveMsg.type === "success" ? "success" : "error"}`}
                  style={{ marginTop: 10 }}
                >
                  {saveMsg.text}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  className="btn btn-success"
                  onClick={handleSaveYaml}
                  disabled={savingYaml}
                >
                  {savingYaml ? (
                    <span
                      className="spinner"
                      style={{ width: 14, height: 14 }}
                    />
                  ) : (
                    "💾 Save Config"
                  )}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingYaml(false);
                    setSaveMsg(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Task table ── */}
        {tasks.length > 0 && (
          <div className="card section-gap">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div className="card-title" style={{ marginBottom: 0 }}>
                📋 Task Queue
                <span
                  className="badge badge-info"
                  style={{ marginLeft: 8, fontSize: 10 }}
                >
                  {tasks.length} files
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleAll(true)}
                >
                  Select All
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleAll(false)}
                >
                  Unselect All
                </button>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Run</th>
                  <th>Location</th>
                  <th>Footage</th>
                  <th>Status</th>
                  <th>G-Proj</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={i}>
                    <td className="check-cell">
                      <input
                        type="checkbox"
                        checked={!!checked[i]}
                        disabled={!t.g_proj}
                        onChange={(e) =>
                          setChecked((prev) => ({
                            ...prev,
                            [i]: e.target.checked,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <span
                        className="text-mono"
                        style={{ color: "var(--cyan)" }}
                      >
                        {t.loc}
                      </span>
                    </td>
                    <td
                      className="text-mono truncate"
                      style={{ maxWidth: 280 }}
                    >
                      {t.mp4}
                    </td>
                    <td>
                      <span
                        className={`badge ${STATUS_COLORS[t.status] || "badge-info"}`}
                      >
                        <span className="badge-dot" />{" "}
                        {STATUS_LABELS[t.status] || t.status}
                      </span>
                    </td>
                    <td>
                      {t.g_proj ? (
                        <span
                          className="badge badge-success"
                          style={{ fontSize: 10 }}
                        >
                          ✓
                        </span>
                      ) : (
                        <span
                          className="badge badge-error"
                          style={{ fontSize: 10 }}
                        >
                          ✗
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Execution ── */}
        <div className="card">
          <div className="card-title">▶ Execution</div>

          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 16,
              alignItems: "center",
            }}
          >
            <button
              className="btn btn-success btn-lg"
              disabled={running || checkedCount === 0}
              onClick={handleStart}
            >
              {running ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16 }} />{" "}
                  Running…
                </>
              ) : (
                `▶ Start Inference (${checkedCount} selected)`
              )}
            </button>
            <button
              className="btn btn-danger"
              disabled={!running}
              onClick={handleStop}
            >
              ⬛ Stop
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span
                className="text-mono"
                style={{ fontSize: 11, color: "rgba(200,216,240,0.5)" }}
              >
                Progress
              </span>
              <span
                className="text-mono"
                style={{ fontSize: 11, color: "var(--cyan)" }}
              >
                {progress}%
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="form-label" style={{ marginBottom: 6 }}>
            Console Output
          </div>
          <div className="log-terminal">
            {logs.length === 0 ? (
              <span style={{ color: "rgba(160, 216, 176, 0.4)" }}>
                // Ready. Scan footage and press Start.
              </span>
            ) : (
              logs.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.includes("❌") || line.includes("Error")
                      ? "log-entry-error"
                      : line.includes("⚠") || line.includes("[WARN]")
                        ? "log-entry-warn"
                        : line.includes("✅") ||
                            line.includes("Done") ||
                            line.includes("Finished")
                          ? "log-entry-done"
                          : ""
                  }
                >
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </>
  );
}
