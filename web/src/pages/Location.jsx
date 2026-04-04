import { useState, useEffect, useRef } from "react";

function FileUploadField({ label, accept, value, onChange, hint }) {
  const ref = useRef();
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div
        className="file-drop-zone"
        style={{
          position: "relative",
          padding: "16px 20px",
          textAlign: "left",
        }}
        onClick={() => ref.current?.click()}
      >
        <input
          ref={ref}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => onChange(e.target.files[0])}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>📂</span>
          <div>
            <div
              style={{ fontSize: 13, color: "var(--cyan)", fontWeight: 600 }}
            >
              {value ? value.name : `Choose ${label}`}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(200,216,240,0.4)",
                marginTop: 2,
              }}
            >
              {hint}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiFileUploadField({ label, accept, values, onChange, hint }) {
  const ref = useRef();
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div
        className="file-drop-zone"
        style={{
          position: "relative",
          padding: "16px 20px",
          textAlign: "left",
        }}
        onClick={() => ref.current?.click()}
      >
        <input
          ref={ref}
          type="file"
          multiple
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => onChange(Array.from(e.target.files || []))}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎬</span>
          <div>
            <div
              style={{ fontSize: 13, color: "var(--cyan)", fontWeight: 600 }}
            >
              {values?.length
                ? `${values.length} file(s) selected`
                : `Choose ${label}`}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(200,216,240,0.4)",
                marginTop: 2,
              }}
            >
              {hint}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Location() {
  const [locations, setLocations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [locDetail, setLocDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create form state
  const [code, setCode] = useState("");
  const [cctv, setCctv] = useState(null);
  const [sat, setSat] = useState(null);
  const [layout, setLayout] = useState(null);
  const [roi, setRoi] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState(null);
  const [cctvPreview, setCctvPreview] = useState(null);
  const [satPreview, setSatPreview] = useState(null);

  // Footage upload state
  const [footageFiles, setFootageFiles] = useState([]);
  const [importLocation, setImportLocation] = useState("");
  const [uploadingFootage, setUploadingFootage] = useState(false);
  const [footageMsg, setFootageMsg] = useState(null);
  const [footageLog, setFootageLog] = useState([]);

  // Modal / Lightbox state
  const [lightbox, setLightbox] = useState(null); // { url: string, title: string }

  // G-projection upload
  const [gFile, setGFile] = useState(null);
  const [uploadingG, setUploadingG] = useState(false);
  const [gMsg, setGMsg] = useState(null);

  function loadLocations() {
    fetch("/api/locations")
      .then((r) => r.json())
      .then(setLocations)
      .catch(() => {});
  }

  function loadLocationDetail(codeValue) {
    const code = codeValue || selected;
    if (!code) {
      setLocDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/locations/${code}`)
      .then((r) => r.json())
      .then((d) => {
        setLocDetail(d);
        setLoadingDetail(false);
      })
      .catch(() => setLoadingDetail(false));
  }

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    if (!importLocation && locations.length > 0) {
      setImportLocation(locations[0].code);
    }
  }, [locations, importLocation]);

  useEffect(() => {
    if (!selected) {
      setLocDetail(null);
      return;
    }
    loadLocationDetail(selected);
  }, [selected]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!code.trim() || !cctv || !sat) {
      setCreateMsg({
        type: "error",
        text: "Location code, CCTV and SAT images are required.",
      });
      return;
    }
    setCreating(true);
    setCreateMsg(null);
    const fd = new FormData();
    fd.append("code", code.trim());
    fd.append("cctv", cctv);
    fd.append("sat", sat);
    if (layout) fd.append("layout", layout);
    if (roi) fd.append("roi", roi);
    try {
      const r = await fetch("/api/locations", { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok) {
        setCreateMsg({
          type: "success",
          text: `Location '${code}' created successfully.`,
        });
        setCode("");
        setCctv(null);
        setSat(null);
        setLayout(null);
        setRoi(null);
        setCctvPreview(null);
        setSatPreview(null);
        loadLocations();
        setSelected(code.trim());
        setImportLocation(code.trim());
      } else {
        setCreateMsg({
          type: "error",
          text: d.detail || "Failed to create location.",
        });
      }
    } catch (err) {
      setCreateMsg({ type: "error", text: String(err) });
    } finally {
      setCreating(false);
    }
  }

  async function handleFootageUpload() {
    const target = importLocation || selected;
    if (!target || footageFiles.length === 0) return;
    setUploadingFootage(true);
    setFootageMsg(null);
    try {
      const fd = new FormData();
      for (const f of footageFiles) fd.append("files", f);

      const useBatch = footageFiles.length > 1;
      const endpoint = useBatch
        ? `/api/locations/${target}/footage/batch`
        : `/api/locations/${target}/footage`;

      if (!useBatch) {
        fd.delete("files");
        fd.append("file", footageFiles[0]);
      }

      const r = await fetch(endpoint, { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok) {
        const items = useBatch ? d.items || [] : [d];
        setFootageMsg({
          type: "success",
          text: `Imported ${items.length} footage file(s).`,
        });
        setFootageFiles([]);
        for (const item of items) {
          const m = item.metadata || {};
          const logLine = `[${new Date().toLocaleTimeString()}] [${target}] ${item.saved_as} | ${m.width || 0}x${m.height || 0}, ${m.fps || 0} FPS, ${m.frames || 0} frames`;
          setFootageLog((prev) => [...prev.slice(-29), logLine]);
        }
        if (selected === target) loadLocationDetail(target);
        loadLocations();
      } else {
        setFootageMsg({ type: "error", text: d.detail || "Upload failed" });
      }
    } catch (err) {
      setFootageMsg({ type: "error", text: String(err) });
    } finally {
      setUploadingFootage(false);
    }
  }

  async function handleGUpload() {
    if (!selected || !gFile) return;
    setUploadingG(true);
    setGMsg(null);
    const fd = new FormData();
    fd.append("file", gFile);
    try {
      const r = await fetch(`/api/locations/${selected}/g_projection`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (r.ok) {
        setGMsg({
          type: "success",
          text: "G-projection uploaded successfully.",
        });
        setGFile(null);
        setSelected((s) => {
          setTimeout(() => setSelected(s), 10);
          return null;
        });
      } else {
        setGMsg({ type: "error", text: d.detail || "Upload failed" });
      }
    } catch (err) {
      setGMsg({ type: "error", text: String(err) });
    } finally {
      setUploadingG(false);
    }
  }

  return (
    <>
      {lightbox && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6,10,18,0.95)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            cursor: "zoom-out",
          }}
          onClick={() => setLightbox(null)}
        >
          <div
            style={{
              position: "absolute",
              top: 20,
              width: "100%",
              textAlign: "center",
              color: "var(--cyan)",
              fontFamily: "var(--font-display)",
              fontSize: 18,
              letterSpacing: 2,
            }}
          >
            {lightbox.title}
          </div>
          <img
            src={lightbox.url}
            style={{
              maxWidth: "95vw",
              maxHeight: "85vh",
              boxShadow: "0 0 80px rgba(0,212,255,0.2)",
              border: "1px solid var(--border-bright)",
            }}
            alt="Full view"
          />
          <div
            style={{
              position: "absolute",
              bottom: 30,
              color: "rgba(200,216,240,0.5)",
              fontSize: 12,
            }}
          >
            Click anywhere to close
          </div>
        </div>
      )}
      <div className="page-header">
        <div className="page-title">LOCATION</div>
        <div className="page-subtitle">
          MANAGE CCTV LOCATIONS, IMAGERY & FOOTAGE
        </div>
      </div>

      <div
        className="page-body fade-in"
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* ─── Left: Location list + Create ─────────── */}
        <div>
          {/* Location List */}
          <div className="card section-gap">
            <div className="card-title">📍 Locations</div>
            {locations.length === 0 ? (
              <div
                style={{
                  color: "rgba(200,216,240,0.4)",
                  fontSize: 13,
                  textAlign: "center",
                  padding: "20px 0",
                }}
              >
                No locations found
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {locations.map((loc) => (
                  <button
                    key={loc.code}
                    onClick={() => setSelected(loc.code)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderRadius: "var(--radius)",
                      border: "1px solid",
                      borderColor:
                        selected === loc.code
                          ? "var(--border-bright)"
                          : "var(--border)",
                      background:
                        selected === loc.code
                          ? "rgba(0,212,255,0.08)"
                          : "var(--bg-elevated)",
                      cursor: "pointer",
                      transition: "var(--transition)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 13,
                          color:
                            selected === loc.code ? "var(--cyan)" : "#e8f4ff",
                          fontWeight: 600,
                        }}
                      >
                        {loc.code}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(200,216,240,0.4)",
                          marginTop: 2,
                        }}
                      >
                        {loc.footage_count} clip
                        {loc.footage_count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                        alignItems: "flex-end",
                      }}
                    >
                      {loc.has_g_projection && (
                        <span
                          className="badge badge-success"
                          style={{ fontSize: 9, padding: "2px 6px" }}
                        >
                          G-PROJ
                        </span>
                      )}
                      {loc.has_cctv && loc.has_sat && (
                        <span
                          className="badge badge-info"
                          style={{ fontSize: 9, padding: "2px 6px" }}
                        >
                          IMAGES
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button
              className="btn btn-ghost btn-sm w-full mt-16"
              onClick={loadLocations}
            >
              ↻ Refresh
            </button>
          </div>

          {/* Create Location */}
          <div className="card">
            <div className="card-title">➕ Create Location</div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Location Code</label>
                <input
                  className="form-control"
                  placeholder="e.g. 119NH"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <FileUploadField
                label="CCTV Frame"
                accept="image/*"
                value={cctv}
                onChange={(f) => {
                  setCctv(f);
                  if (f) setCctvPreview(URL.createObjectURL(f));
                }}
                hint="PNG/JPG frame from CCTV camera"
              />
              <FileUploadField
                label="Satellite Image"
                accept="image/*"
                value={sat}
                onChange={(f) => {
                  setSat(f);
                  if (f) setSatPreview(URL.createObjectURL(f));
                }}
                hint="Overhead satellite/map image"
              />
              <FileUploadField
                label="Layout SVG (optional)"
                accept=".svg"
                value={layout}
                onChange={setLayout}
                hint="Road layout SVG overlay"
              />
              <FileUploadField
                label="ROI Mask (optional)"
                accept="image/*"
                value={roi}
                onChange={setRoi}
                hint="Region of interest PNG mask"
              />
              {createMsg && (
                <div
                  className={`alert alert-${createMsg.type === "success" ? "success" : "error"}`}
                  style={{ marginBottom: 12 }}
                >
                  {createMsg.text}
                </div>
              )}
              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={creating}
              >
                {creating ? (
                  <>
                    <span
                      className="spinner"
                      style={{ width: 14, height: 14 }}
                    />{" "}
                    Creating…
                  </>
                ) : (
                  "+ Create Location"
                )}
              </button>
            </form>

            {/* Media Preview (like Python GUI MediaViewer) */}
            {(cctvPreview || satPreview) && (
              <div style={{ marginTop: 20 }}>
                <div className="form-label" style={{ marginBottom: 10 }}>
                  Media Preview
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(200,216,240,0.4)",
                        marginBottom: 6,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      CCTV
                    </div>
                    {cctvPreview ? (
                      <img
                        src={cctvPreview}
                        alt="CCTV Preview"
                        className="img-preview"
                      />
                    ) : (
                      <div
                        className="img-preview"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "rgba(200,216,240,0.25)",
                          fontSize: 13,
                        }}
                      >
                        No CCTV
                      </div>
                    )}
                    <button
                      className="btn btn-ghost btn-sm w-full"
                      style={{ marginTop: 6 }}
                      onClick={() =>
                        setLightbox({ url: cctvPreview, title: "CCTV FRAME" })
                      }
                      type="button"
                    >
                      Fit CCTV
                    </button>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(200,216,240,0.4)",
                        marginBottom: 6,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      SATELLITE
                    </div>
                    {satPreview ? (
                      <img
                        src={satPreview}
                        alt="SAT Preview"
                        className="img-preview"
                        onClick={() =>
                          setLightbox({
                            url: satPreview,
                            title: "SATELLITE IMAGE",
                          })
                        }
                        style={{ cursor: "zoom-in" }}
                      />
                    ) : (
                      <div
                        className="img-preview"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "rgba(200,216,240,0.25)",
                          fontSize: 13,
                        }}
                      >
                        No SAT
                      </div>
                    )}
                    <button
                      className="btn btn-ghost btn-sm w-full"
                      style={{ marginTop: 6 }}
                      onClick={() =>
                        setLightbox({
                          url: satPreview,
                          title: "SATELLITE IMAGE",
                        })
                      }
                      type="button"
                    >
                      Fit SAT
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title">
              🎞 Import Footage Into Existing Location
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <select
                className="form-control"
                value={importLocation}
                onChange={(e) => setImportLocation(e.target.value)}
              >
                {locations.length === 0 && <option value="">(none)</option>}
                {locations.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code}
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost btn-sm" onClick={loadLocations}>
                Refresh
              </button>
            </div>

            <MultiFileUploadField
              label="Add footage (mp4)"
              accept=".mp4,video/mp4"
              values={footageFiles}
              onChange={setFootageFiles}
              hint="Select one or multiple MP4 files"
            />

            <button
              className="btn btn-primary w-full"
              disabled={
                !importLocation || footageFiles.length === 0 || uploadingFootage
              }
              onClick={handleFootageUpload}
            >
              {uploadingFootage ? (
                <span className="spinner" style={{ width: 14, height: 14 }} />
              ) : (
                "Add footage (mp4)"
              )}
            </button>

            {footageMsg && (
              <div
                className={`alert alert-${footageMsg.type === "success" ? "success" : "error"}`}
                style={{ marginTop: 12 }}
              >
                {footageMsg.text}
              </div>
            )}

            <div
              className="log-terminal"
              style={{ minHeight: 120, marginTop: 12, fontSize: 11 }}
            >
              {footageLog.length === 0 ? (
                <div style={{ color: "rgba(160,216,176,0.35)" }}>
                  // Footage import log will appear here.
                </div>
              ) : (
                footageLog.map((line, idx) => <div key={idx}>{line}</div>)
              )}
            </div>
          </div>
        </div>

        {/* ─── Right: Location Detail ────────────────── */}
        <div>
          {!selected ? (
            <div
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 300,
              }}
            >
              <div
                style={{ textAlign: "center", color: "rgba(200,216,240,0.3)" }}
              >
                <div style={{ fontSize: 48, marginBottom: 12 }}>📍</div>
                <div style={{ fontSize: 14 }}>
                  Select a location to view details
                </div>
              </div>
            </div>
          ) : loadingDetail ? (
            <div
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 300,
              }}
            >
              <div className="spinner" />
            </div>
          ) : locDetail ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Header */}
              <div
                className="card"
                style={{
                  background:
                    "linear-gradient(135deg,rgba(0,212,255,0.06),rgba(124,58,237,0.06))",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 22,
                        fontWeight: 700,
                        color: "var(--cyan)",
                        letterSpacing: 2,
                      }}
                    >
                      {locDetail.code}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(200,216,240,0.5)",
                        marginTop: 4,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      Location Code
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {locDetail.g_projection && (
                      <span className="badge badge-success">
                        G-PROJECTION ✓
                      </span>
                    )}
                    {locDetail.cctv_url && (
                      <span className="badge badge-info">CCTV ✓</span>
                    )}
                    {locDetail.sat_url && (
                      <span className="badge badge-info">SAT ✓</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Images */}
              {(locDetail.cctv_url || locDetail.sat_url) && (
                <div className="card">
                  <div className="card-title">🖼️ Location Imagery</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(200,216,240,0.5)",
                          marginBottom: 6,
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        CCTV FRAME
                      </div>
                      {locDetail.cctv_url ? (
                        <img
                          src={locDetail.cctv_url}
                          alt="CCTV"
                          className="img-preview"
                        />
                      ) : (
                        <div
                          className="img-preview"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "rgba(200,216,240,0.3)",
                          }}
                        >
                          No CCTV image
                        </div>
                      )}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(200,216,240,0.5)",
                          marginBottom: 6,
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        SATELLITE
                      </div>
                      {locDetail.sat_url ? (
                        <img
                          src={locDetail.sat_url}
                          alt="SAT"
                          className="img-preview"
                        />
                      ) : (
                        <div
                          className="img-preview"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "rgba(200,216,240,0.3)",
                          }}
                        >
                          No SAT image
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Footage */}
              <div className="card">
                <div
                  className="card-title"
                  style={{ justifyContent: "space-between" }}
                >
                  <span>🎥 Footage Clips</span>
                  <span className="badge badge-info">
                    {locDetail.footage?.length || 0}
                  </span>
                </div>
                {locDetail.footage?.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Resolution</th>
                        <th>FPS</th>
                        <th>Duration</th>
                        <th>Frames</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locDetail.footage.map((f) => (
                        <tr key={f.name}>
                          <td>
                            <span
                              className="text-mono"
                              style={{ color: "var(--cyan)" }}
                            >
                              {f.name}
                            </span>
                          </td>
                          <td className="text-mono">
                            {f.width}×{f.height}
                          </td>
                          <td className="text-mono">{f.fps}</td>
                          <td className="text-mono">{f.duration_s}s</td>
                          <td className="text-mono">{f.frames}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div
                    style={{
                      color: "rgba(200,216,240,0.4)",
                      fontSize: 13,
                      padding: "12px 0",
                    }}
                  >
                    No footage clips yet
                  </div>
                )}
                <div className="divider" />
                <div className="alert alert-info" style={{ marginTop: 12 }}>
                  Use the left-side "Import Footage Into Existing Location"
                  section to add MP4 clips.
                </div>
              </div>

              {/* G-projection upload */}
              <div className="card">
                <div className="card-title">🎯 G-Projection</div>
                {!locDetail.g_projection ? (
                  <div
                    className="alert alert-error"
                    style={{ marginBottom: 16 }}
                  >
                    No G-projection found. Please upload one or use the
                    Calibration tool.
                  </div>
                ) : (
                  <div
                    className="alert alert-success"
                    style={{ marginBottom: 16 }}
                  >
                    G-projection loaded.{" "}
                    {locDetail.g_projection.use_svg
                      ? "SVG mode."
                      : "Raster mode."}
                  </div>
                )}
                <div
                  style={{ display: "flex", gap: 12, alignItems: "flex-end" }}
                >
                  <FileUploadField
                    label="Upload G_projection JSON"
                    accept=".json"
                    value={gFile}
                    onChange={setGFile}
                    hint="G_projection_{code}.json"
                  />
                  <button
                    className="btn btn-primary"
                    style={{ marginBottom: 16, flexShrink: 0 }}
                    disabled={!gFile || uploadingG}
                    onClick={handleGUpload}
                  >
                    {uploadingG ? (
                      <span
                        className="spinner"
                        style={{ width: 14, height: 14 }}
                      />
                    ) : (
                      "⬆ Upload"
                    )}
                  </button>
                </div>
                {gMsg && (
                  <div
                    className={`alert alert-${gMsg.type === "success" ? "success" : "error"}`}
                  >
                    {gMsg.text}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
