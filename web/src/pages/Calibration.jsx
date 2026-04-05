import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";

const STEPS = [
  { full: "Pick", short: "Pick" },
  { full: "Intrinsics", short: "Lens" },
  { full: "Undistort", short: "Undis" },
  { full: "Validation 1", short: "Val1" },
  { full: "Homography Anchors", short: "HomA" },
  { full: "Homography FOV", short: "HomF" },
  { full: "Validation 2", short: "Val2" },
  { full: "Parallax Subjects", short: "ParS" },
  { full: "Distance Reference", short: "Dist" },
  { full: "Validation 3", short: "Val3" },
  { full: "SVG", short: "SVG" },
  { full: "ROI", short: "ROI" },
  { full: "Final Validation", short: "Final" },
  { full: "Save", short: "Save" },
];

function FileUploadField({ label, accept, value, onChange, hint }) {
  const ref = useRef();
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div
        className="file-drop-zone"
        style={{
          position: "relative",
          padding: "14px 18px",
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
          <FolderOpen size={18} className="text-muted" />
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

function cloneJson(v) {
  return v ? JSON.parse(JSON.stringify(v)) : null;
}

function defaultProjection(code, useSvg, useRoi) {
  return {
    meta: {
      location_code: code,
      timestamp: new Date().toISOString().slice(0, 19),
    },
    inputs: {
      cctv_path: `cctv_${code}.png`,
      sat_path: `sat_${code}.png`,
      layout_path: `layout_${code}.svg`,
      roi_path: `roi_${code}.png`,
      note: "Input paths are relative to this json file",
    },
    undistort: {
      resolution: [1280, 720],
      K: [
        [1280, 0, 640],
        [0, 1280, 360],
        [0, 0, 1],
      ],
      D: [0, 0, 0, 0, 0],
      model: "radial_tangential",
    },
    homography: {
      H: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      fov_polygon: [],
      anchors_list: [],
    },
    parallax: {
      x_cam_coords_sat: 0,
      y_cam_coords_sat: 0,
      z_cam_meters: 0,
      px_per_meter: 1,
    },
    use_svg: !!useSvg,
    layout_svg: { A: [], association_pairs: [] },
    use_roi: !!useRoi,
    roi_method: "partial",
    ref_method: "center_box",
    proj_method: "down_h_2",
  };
}

function StagePlaceholder({ title, note }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="alert alert-info">{note}</div>
    </div>
  );
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBox(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return {
    x1,
    y1,
    x2,
    y2,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function safeMatrix3(maybeMatrix) {
  if (!Array.isArray(maybeMatrix) || maybeMatrix.length !== 3) return null;
  const m = maybeMatrix.map((row) =>
    Array.isArray(row) && row.length === 3 ? row.map((v) => toNum(v, 0)) : null,
  );
  if (m.some((row) => row === null)) return null;
  return m;
}

function invert3x3(m) {
  const a = m[0][0];
  const b = m[0][1];
  const c = m[0][2];
  const d = m[1][0];
  const e = m[1][1];
  const f = m[1][2];
  const g = m[2][0];
  const h = m[2][1];
  const i = m[2][2];

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-9) return null;

  const invDet = 1 / det;
  return [
    [A * invDet, D * invDet, G * invDet],
    [B * invDet, E * invDet, H * invDet],
    [C * invDet, F * invDet, I * invDet],
  ];
}

function applyHomography(H, x, y) {
  if (!H) return null;
  const w = H[2][0] * x + H[2][1] * y + H[2][2];
  if (Math.abs(w) < 1e-9) return null;
  return {
    x: (H[0][0] * x + H[0][1] * y + H[0][2]) / w,
    y: (H[1][0] * x + H[1][1] * y + H[1][2]) / w,
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function getValidK(K, width, height) {
  const k = safeMatrix3(K);
  if (k) return k;
  return [
    [width, 0, width / 2],
    [0, width, height / 2],
    [0, 0, 1],
  ];
}

function getValidD(D) {
  const arr = Array.isArray(D) ? D.map((v) => toNum(v, 0)) : [];
  while (arr.length < 5) arr.push(0);
  return arr.slice(0, 5);
}

function undistortPointApprox(pt, K, D, iterations = 5) {
  if (!pt || !K) return null;
  const d = getValidD(D);
  const [k1, k2, p1, p2, k3] = d;
  const fx = toNum(K[0][0], 1);
  const fy = toNum(K[1][1], 1);
  const cx = toNum(K[0][2], 0);
  const cy = toNum(K[1][2], 0);
  if (Math.abs(fx) < 1e-9 || Math.abs(fy) < 1e-9) return null;

  const x = (pt.x - cx) / fx;
  const y = (pt.y - cy) / fy;

  let xu = x;
  let yu = y;
  for (let i = 0; i < iterations; i += 1) {
    const r2 = xu * xu + yu * yu;
    const radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
    if (Math.abs(radial) < 1e-9) break;
    const deltaX = 2 * p1 * xu * yu + p2 * (r2 + 2 * xu * xu);
    const deltaY = p1 * (r2 + 2 * yu * yu) + 2 * p2 * xu * yu;
    xu = (x - deltaX) / radial;
    yu = (y - deltaY) / radial;
  }

  return {
    x: fx * xu + cx,
    y: fy * yu + cy,
  };
}

function sampleBilinear(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    return [0, 0, 0, 255];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const dx = x - x0;
  const dy = y - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const out = [0, 0, 0, 255];
  for (let c = 0; c < 4; c += 1) {
    const v0 = data[i00 + c] * (1 - dx) + data[i10 + c] * dx;
    const v1 = data[i01 + c] * (1 - dx) + data[i11 + c] * dx;
    out[c] = v0 * (1 - dy) + v1 * dy;
  }
  return out;
}

function renderUndistortedToCanvas(imgEl, canvasEl, K, D, maxDim = 680) {
  if (!imgEl || !canvasEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
    return null;
  }

  const srcW = imgEl.naturalWidth;
  const srcH = imgEl.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const outW = Math.max(2, Math.round(srcW * scale));
  const outH = Math.max(2, Math.round(srcH * scale));

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = outW;
  srcCanvas.height = outH;
  const sctx = srcCanvas.getContext("2d");
  sctx.drawImage(imgEl, 0, 0, outW, outH);
  const srcData = sctx.getImageData(0, 0, outW, outH);

  const outCanvas = canvasEl;
  outCanvas.width = outW;
  outCanvas.height = outH;
  const octx = outCanvas.getContext("2d");
  const outData = octx.createImageData(outW, outH);

  const validK = getValidK(K, srcW, srcH);
  const validD = getValidD(D);
  const [k1, k2, p1, p2, k3] = validD;

  const sx = outW / srcW;
  const sy = outH / srcH;
  const fx = toNum(validK[0][0], srcW) * sx;
  const fy = toNum(validK[1][1], srcW) * sy;
  const cx = toNum(validK[0][2], srcW / 2) * sx;
  const cy = toNum(validK[1][2], srcH / 2) * sy;

  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const xn = (x - cx) / fx;
      const yn = (y - cy) / fy;
      const r2 = xn * xn + yn * yn;
      const radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
      const xDist = xn * radial + 2 * p1 * xn * yn + p2 * (r2 + 2 * xn * xn);
      const yDist = yn * radial + p1 * (r2 + 2 * yn * yn) + 2 * p2 * xn * yn;
      const u = fx * xDist + cx;
      const v = fy * yDist + cy;
      const pix = sampleBilinear(srcData.data, outW, outH, u, v);
      const idx = (y * outW + x) * 4;
      outData.data[idx] = pix[0];
      outData.data[idx + 1] = pix[1];
      outData.data[idx + 2] = pix[2];
      outData.data[idx + 3] = 255;
    }
  }

  octx.putImageData(outData, 0, 0);
  return { width: outW, height: outH, scale };
}

function transpose(m) {
  if (!Array.isArray(m) || !m.length) return [];
  return m[0].map((_, c) => m.map((row) => row[c]));
}

function matMul(a, b) {
  const rows = a.length;
  const cols = b[0].length;
  const mid = b.length;
  const out = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      let acc = 0;
      for (let k = 0; k < mid; k += 1) acc += a[r][k] * b[k][c];
      out[r][c] = acc;
    }
  }
  return out;
}

function matVec(a, v) {
  return a.map((row) => row.reduce((acc, val, i) => acc + val * v[i], 0));
}

function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row) => row.slice());
  const rhs = b.slice();

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;

    [M[col], M[pivot]] = [M[pivot], M[col]];
    [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];

    const div = M[col][col];
    for (let c = col; c < n; c += 1) M[col][c] /= div;
    rhs[col] /= div;

    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c < n; c += 1) M[r][c] -= factor * M[col][c];
      rhs[r] -= factor * rhs[col];
    }
  }

  return rhs;
}

function solveLeastSquares(A, b) {
  const AT = transpose(A);
  const ATA = matMul(AT, A);
  const ATb = matVec(AT, b);
  return solveLinearSystem(ATA, ATb);
}

function computeHomographyDLT(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 4) return null;
  const A = [];
  const b = [];

  for (const p of pairs) {
    const x = toNum(p.src.x, 0);
    const y = toNum(p.src.y, 0);
    const u = toNum(p.dst.x, 0);
    const v = toNum(p.dst.y, 0);
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLeastSquares(A, b);
  if (!h || h.length !== 8) return null;
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

function computeAffineLeastSquares(srcPts, dstPts) {
  if (!Array.isArray(srcPts) || !Array.isArray(dstPts)) return null;
  if (srcPts.length !== dstPts.length || srcPts.length < 3) return null;

  const A = [];
  const b = [];
  for (let i = 0; i < srcPts.length; i += 1) {
    const x = toNum(srcPts[i].x, 0);
    const y = toNum(srcPts[i].y, 0);
    const X = toNum(dstPts[i].x, 0);
    const Y = toNum(dstPts[i].y, 0);
    A.push([x, y, 1, 0, 0, 0]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1]);
    b.push(Y);
  }

  const p = solveLeastSquares(A, b);
  if (!p || p.length !== 6) return null;

  const aff = [
    [p[0], p[1], p[2]],
    [p[3], p[4], p[5]],
  ];

  let err = 0;
  for (let i = 0; i < srcPts.length; i += 1) {
    const pred = applyAffinePoint(srcPts[i], aff);
    err += Math.hypot(pred.x - dstPts[i].x, pred.y - dstPts[i].y);
  }
  return { A: aff, residual: err / srcPts.length };
}

function lineIntersection(a1, a2, b1, b2) {
  const x1 = a1.x;
  const y1 = a1.y;
  const x2 = a2.x;
  const y2 = a2.y;
  const x3 = b1.x;
  const y3 = b1.y;
  const x4 = b2.x;
  const y4 = b2.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null;

  const cross1 = x1 * y2 - y1 * x2;
  const cross2 = x3 * y4 - y3 * x4;
  return {
    x: (cross1 * (x3 - x4) - (x1 - x2) * cross2) / denom,
    y: (cross1 * (y3 - y4) - (y1 - y2) * cross2) / denom,
  };
}

function dedupePoints(points, limit = 140) {
  const seen = new Map();
  for (const p of points || []) {
    const key = `${Math.round(p.x)}_${Math.round(p.y)}`;
    if (!seen.has(key)) seen.set(key, { x: p.x, y: p.y });
    if (seen.size >= limit) break;
  }
  return Array.from(seen.values());
}

function parseSvgPoints(raw) {
  if (!raw) return [];
  const vals = raw
    .trim()
    .split(/[ ,]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  if (vals.length < 4 || vals.length % 2 !== 0) return [];
  const out = [];
  for (let i = 0; i < vals.length; i += 2)
    out.push({ x: vals[i], y: vals[i + 1] });
  return out;
}

function applyAffinePoint(pt, affineA) {
  if (!Array.isArray(affineA) || affineA.length < 2) return pt;
  const r0 = affineA[0];
  const r1 = affineA[1];
  if (
    !Array.isArray(r0) ||
    !Array.isArray(r1) ||
    r0.length < 3 ||
    r1.length < 3
  ) {
    return pt;
  }
  const x = toNum(pt.x, 0);
  const y = toNum(pt.y, 0);
  return {
    x: toNum(r0[0]) * x + toNum(r0[1]) * y + toNum(r0[2]),
    y: toNum(r1[0]) * x + toNum(r1[1]) * y + toNum(r1[2]),
  };
}

function matMul3(a, b) {
  const out = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
    }
  }
  return out;
}

function parseSvgTransform(transformText) {
  const I = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  if (!transformText) return I;

  const ops = [...transformText.matchAll(/(\w+)\s*\(([^)]*)\)/g)];
  let M = I;
  for (const op of ops) {
    const name = op[1];
    const vals = op[2]
      .trim()
      .split(/[ ,]+/)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    let T = I;
    if (name === "translate") {
      const tx = vals[0] || 0;
      const ty = vals[1] || 0;
      T = [
        [1, 0, tx],
        [0, 1, ty],
        [0, 0, 1],
      ];
    } else if (name === "scale") {
      const sx = vals[0] || 1;
      const sy = vals.length > 1 ? vals[1] : sx;
      T = [
        [sx, 0, 0],
        [0, sy, 0],
        [0, 0, 1],
      ];
    } else if (name === "rotate") {
      const ang = ((vals[0] || 0) * Math.PI) / 180;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const R = [
        [c, -s, 0],
        [s, c, 0],
        [0, 0, 1],
      ];
      if (vals.length >= 3) {
        const cx = vals[1] || 0;
        const cy = vals[2] || 0;
        const T1 = [
          [1, 0, cx],
          [0, 1, cy],
          [0, 0, 1],
        ];
        const T2 = [
          [1, 0, -cx],
          [0, 1, -cy],
          [0, 0, 1],
        ];
        T = matMul3(T1, matMul3(R, T2));
      } else {
        T = R;
      }
    } else if (name === "matrix" && vals.length >= 6) {
      T = [
        [vals[0], vals[2], vals[4]],
        [vals[1], vals[3], vals[5]],
        [0, 0, 1],
      ];
    }
    M = matMul3(M, T);
  }
  return M;
}

function applyMatrixPoint(pt, m) {
  return {
    x: m[0][0] * pt.x + m[0][1] * pt.y + m[0][2],
    y: m[1][0] * pt.x + m[1][1] * pt.y + m[1][2],
  };
}

function parseSvgSegments(svgText, affineA) {
  const out = [];
  if (!svgText) return out;

  let doc;
  try {
    doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  } catch {
    return out;
  }

  const scopes = [];
  const g1 = doc.getElementById("Guidelines");
  const g2 = doc.getElementById("Physical");
  if (g1) scopes.push(g1);
  if (g2) scopes.push(g2);
  if (scopes.length === 0) scopes.push(doc.documentElement);

  const I = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  function emitSeg(p1, p2) {
    const t1 = applyAffinePoint(p1, affineA);
    const t2 = applyAffinePoint(p2, affineA);
    out.push({ p1: t1, p2: t2 });
  }

  function visit(node, parentM) {
    if (!node || node.nodeType !== 1) return;
    const localM = parseSvgTransform(node.getAttribute("transform"));
    const m = matMul3(parentM, localM);
    const tag = (node.tagName || "").toLowerCase();

    if (tag === "line") {
      const p1 = applyMatrixPoint(
        {
          x: toNum(node.getAttribute("x1"), 0),
          y: toNum(node.getAttribute("y1"), 0),
        },
        m,
      );
      const p2 = applyMatrixPoint(
        {
          x: toNum(node.getAttribute("x2"), 0),
          y: toNum(node.getAttribute("y2"), 0),
        },
        m,
      );
      emitSeg(p1, p2);
    } else if (tag === "polyline" || tag === "polygon") {
      const pts = parseSvgPoints(node.getAttribute("points") || "").map((p) =>
        applyMatrixPoint(p, m),
      );
      if (pts.length >= 2) {
        for (let i = 0; i < pts.length - 1; i += 1) emitSeg(pts[i], pts[i + 1]);
        if (tag === "polygon") emitSeg(pts[pts.length - 1], pts[0]);
      }
    }

    for (const child of Array.from(node.children || [])) visit(child, m);
  }

  for (const scope of scopes) {
    visit(scope, I);
  }

  return out;
}

function nearestHeading(segments, pt) {
  if (!segments.length || !pt) return null;
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const seg of segments) {
    const x1 = seg.p1.x;
    const y1 = seg.p1.y;
    const x2 = seg.p2.x;
    const y2 = seg.p2.y;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) continue;

    const t = Math.max(
      0,
      Math.min(1, ((pt.x - x1) * dx + (pt.y - y1) * dy) / lenSq),
    );
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    const dist = Math.hypot(pt.x - cx, pt.y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      let heading = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (heading < 0) heading += 360;
      best = { heading, p1: seg.p1, p2: seg.p2 };
    }
  }
  return best;
}

function drawMarker(ctx, x, y, label, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "12px var(--font-mono)";
  ctx.fillText(label, x + 8, y - 8);
  ctx.restore();
}

function PickStage({
  selected,
  locDetail,
  draft,
  constructSvg,
  setConstructSvg,
  constructRoi,
  setConstructRoi,
  onConstruct,
  onValidate,
  onReconstruct,
  onProceed,
  gFile,
  setGFile,
  uploadMsg,
  uploading,
  onUpload,
}) {
  const [showSvgOverlay, setShowSvgOverlay] = useState(true);
  const [showRoiOverlay, setShowRoiOverlay] = useState(false);

  const canProceed = !!draft;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "330px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 12, alignContent: "start" }}
      >
        <div className="card-title">Pick Stage</div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Location Code</label>
          <div className="alert alert-info" style={{ margin: 0 }}>
            {selected || "None"}
          </div>
        </div>

        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={constructSvg}
            onChange={(e) => setConstructSvg(e.target.checked)}
          />
          Use SVG layout
        </label>

        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={constructRoi}
            onChange={(e) => setConstructRoi(e.target.checked)}
          />
          Use ROI mask
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={onConstruct}>
            Construct
          </button>
          <button className="btn btn-ghost" onClick={onValidate}>
            Validate
          </button>
          <button className="btn btn-ghost" onClick={onReconstruct}>
            Reconstruct
          </button>
          <button
            className="btn btn-success"
            disabled={!canProceed}
            onClick={onProceed}
          >
            Proceed
          </button>
        </div>

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          Summary: {selected} | use_svg={String(constructSvg)} | use_roi=
          {String(constructRoi)}
        </div>

        <div className="divider" />
        <div className="alert alert-info">
          Upload a precomputed calibration file if you already have one.
        </div>

        <FileUploadField
          label="G_projection JSON"
          accept=".json"
          value={gFile}
          onChange={setGFile}
          hint={`G_projection_${selected || "<code>"}.json`}
        />
        {uploadMsg && (
          <div
            className={`alert alert-${uploadMsg.type === "success" ? "success" : "error"}`}
          >
            {uploadMsg.text}
          </div>
        )}
        <button
          className="btn btn-primary"
          disabled={!gFile || uploading}
          onClick={onUpload}
        >
          {uploading ? (
            <span className="spinner" style={{ width: 14, height: 14 }} />
          ) : (
            "Upload G-projection"
          )}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span>CCTV Preview</span>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
              }}
            >
              <input
                type="checkbox"
                checked={showRoiOverlay}
                disabled={!locDetail?.roi_url}
                onChange={(e) => setShowRoiOverlay(e.target.checked)}
              />
              Show ROI overlay
            </label>
          </div>
          <div
            style={{
              position: "relative",
              minHeight: 280,
              background: "#080a0e",
            }}
          >
            {locDetail?.cctv_url ? (
              <img
                src={locDetail.cctv_url}
                alt="CCTV"
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div
                style={{
                  padding: 16,
                  fontSize: 12,
                  color: "rgba(200,216,240,0.62)",
                }}
              >
                No CCTV image.
              </div>
            )}
            {showRoiOverlay && locDetail?.roi_url && (
              <img
                src={locDetail.roi_url}
                alt="ROI"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: 0.35,
                  mixBlendMode: "screen",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
          <div style={{ padding: "8px 10px" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowRoiOverlay(false)}
            >
              Fit
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span>Satellite Preview</span>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
              }}
            >
              <input
                type="checkbox"
                checked={showSvgOverlay}
                disabled={!locDetail?.layout_url}
                onChange={(e) => setShowSvgOverlay(e.target.checked)}
              />
              Show SVG layout
            </label>
          </div>
          <div
            style={{
              position: "relative",
              minHeight: 280,
              background: "#080a0e",
            }}
          >
            {locDetail?.sat_url ? (
              <img
                src={locDetail.sat_url}
                alt="SAT"
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div
                style={{
                  padding: 16,
                  fontSize: 12,
                  color: "rgba(200,216,240,0.62)",
                }}
              >
                No satellite image.
              </div>
            )}
            {showSvgOverlay && locDetail?.layout_url && (
              <img
                src={locDetail.layout_url}
                alt="Layout"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: 0.45,
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
          <div style={{ padding: "8px 10px" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowSvgOverlay(true)}
            >
              Fit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LensStage({ locDetail, draft, setDraft, onProceed }) {
  const cctvRef = useRef(null);
  const previewRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [status, setStatus] = useState("Load CCTV image to start.");

  const K = draft?.undistort?.K || [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  function setKCell(r, c, val) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.undistort = next.undistort || {};
      next.undistort.K = next.undistort.K || [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      next.undistort.K[r][c] = toNum(val, 0);
      return next;
    });
  }

  function applyIntrinsics() {
    const imgEl = cctvRef.current;
    const canvasEl = previewRef.current;
    if (!imgEl || !canvasEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
      setStatus("CCTV not loaded.");
      return;
    }

    const out = renderUndistortedToCanvas(
      imgEl,
      canvasEl,
      K,
      draft?.undistort?.D,
      760,
    );
    if (!out) {
      setStatus("Failed to render undistort preview.");
      return;
    }

    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.undistort = next.undistort || {};
      next.undistort.resolution = [imgEl.naturalWidth, imgEl.naturalHeight];
      next.undistort.K = getValidK(
        next.undistort.K,
        imgEl.naturalWidth,
        imgEl.naturalHeight,
      );
      next.undistort.D = getValidD(next.undistort.D);
      return next;
    });

    setStatus(`Applied intrinsics on ${out.width}x${out.height} preview.`);
  }

  function setDefaultK() {
    if (!size.w || !size.h) return;
    const defaultK = [
      [size.w, 0, size.w / 2],
      [0, size.w, size.h / 2],
      [0, 0, 1],
    ];
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.undistort = next.undistort || {};
      next.undistort.K = defaultK;
      next.undistort.resolution = [size.w, size.h];
      next.undistort.D = getValidD(next.undistort.D);
      return next;
    });
    setStatus("Default intrinsics populated from image resolution.");
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "330px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Lens (Intrinsics)</div>

        <div className="alert alert-info" style={{ margin: 0 }}>
          Resolution: {size.w || "-"} x {size.h || "-"}
        </div>

        <div className="form-label" style={{ marginBottom: 0 }}>
          K Matrix
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(64px, 1fr))",
            gap: 6,
          }}
        >
          {[0, 1, 2].flatMap((r) =>
            [0, 1, 2].map((c) => (
              <input
                key={`${r}-${c}`}
                className="form-control"
                type="number"
                value={K[r]?.[c] ?? 0}
                onChange={(e) => setKCell(r, c, e.target.value)}
              />
            )),
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={setDefaultK}>
            Use Default
          </button>
          <button className="btn btn-primary btn-sm" onClick={applyIntrinsics}>
            Apply Intrinsics
          </button>
          <button className="btn btn-ghost btn-sm" onClick={applyIntrinsics}>
            Fit CCTV
          </button>
        </div>

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            CCTV Input
          </div>
          <div style={{ minHeight: 300, background: "#080a0e" }}>
            {locDetail?.cctv_url ? (
              <img
                ref={cctvRef}
                src={locDetail.cctv_url}
                alt="CCTV"
                onLoad={(e) => {
                  const w = e.currentTarget.naturalWidth || 0;
                  const h = e.currentTarget.naturalHeight || 0;
                  setSize({ w, h });
                }}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                CCTV image unavailable.
              </div>
            )}
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Undistort Preview
          </div>
          <div style={{ minHeight: 300, background: "#080a0e", padding: 8 }}>
            <canvas
              ref={previewRef}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function UndistortStage({ locDetail, draft, setDraft, onProceed }) {
  const srcRef = useRef(null);
  const previewRef = useRef(null);
  const [status, setStatus] = useState("Adjust sliders to update preview.");
  const [roiRect, setRoiRect] = useState(null);

  const validD = getValidD(draft?.undistort?.D);
  const validK = getValidK(draft?.undistort?.K, 1280, 720);

  const fields = [
    { label: "k1", dIdx: 0, min: -1.2, max: 1.2, step: 0.001 },
    { label: "k2", dIdx: 1, min: -1.2, max: 1.2, step: 0.001 },
    { label: "k3", dIdx: 4, min: -2, max: 2, step: 0.001 },
    { label: "p1", dIdx: 2, min: -0.01, max: 0.01, step: 0.0001 },
    { label: "p2", dIdx: 3, min: -0.01, max: 0.01, step: 0.0001 },
  ];

  const redrawPreview = useCallback(() => {
    const imgEl = srcRef.current;
    const canvasEl = previewRef.current;
    if (!imgEl || !canvasEl || !imgEl.naturalWidth || !imgEl.naturalHeight)
      return;
    const out = renderUndistortedToCanvas(imgEl, canvasEl, validK, validD, 860);
    if (!out) return;
    if (roiRect) {
      const ctx = canvasEl.getContext("2d");
      const sx = out.width / imgEl.naturalWidth;
      const sy = out.height / imgEl.naturalHeight;
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        roiRect.x * sx,
        roiRect.y * sy,
        Math.max(1, roiRect.w * sx),
        Math.max(1, roiRect.h * sy),
      );
      ctx.restore();
    }
  }, [roiRect, validD, validK]);

  useEffect(() => {
    redrawPreview();
  }, [redrawPreview]);

  useEffect(() => {
    setRoiRect(null);
    if (!locDetail?.roi_url) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width;
      let minY = c.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < c.height; y += 1) {
        for (let x = 0; x < c.width; x += 1) {
          const i = (y * c.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          const valid = a < 10 || !(r < 10 && g < 10 && b < 10);
          if (!valid) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX >= minX && maxY >= minY) {
        setRoiRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
      }
    };
    img.src = locDetail.roi_url;
  }, [locDetail?.roi_url]);

  function setDValue(dIdx, v) {
    const n = toNum(v, 0);
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.undistort = next.undistort || {};
      next.undistort.D = getValidD(next.undistort.D);
      next.undistort.D[dIdx] = n;
      return next;
    });
    setStatus(
      `Updated ${fields.find((f) => f.dIdx === dIdx)?.label || "D"} = ${n.toFixed(4)}`,
    );
  }

  function resetSliders() {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.undistort = next.undistort || {};
      next.undistort.D = [0, 0, 0, 0, 0];
      return next;
    });
    setStatus("Distortion coefficients reset to zero.");
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Undistort</div>
        {fields.map((f) => (
          <div key={f.label} style={{ display: "grid", gap: 4 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
              }}
            >
              <span>{f.label}</span>
              <span className="text-mono">
                {toNum(validD[f.dIdx], 0).toFixed(4)}
              </span>
            </div>
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={toNum(validD[f.dIdx], 0)}
              onChange={(e) => setDValue(f.dIdx, e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={resetSliders}>
            Reset Sliders
          </button>
          <button className="btn btn-ghost btn-sm" onClick={redrawPreview}>
            Fit
          </button>
        </div>

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Original CCTV
          </div>
          <div style={{ background: "#080a0e", minHeight: 320 }}>
            {locDetail?.cctv_url ? (
              <img
                ref={srcRef}
                src={locDetail.cctv_url}
                alt="CCTV"
                onLoad={redrawPreview}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                CCTV image unavailable.
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Live Undistorted Preview
          </div>
          <div style={{ background: "#080a0e", minHeight: 320, padding: 8 }}>
            <canvas
              ref={previewRef}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Validation1Stage({ locDetail, draft, onProceed }) {
  const leftImgRef = useRef(null);
  const leftCanvasRef = useRef(null);
  const rightCanvasRef = useRef(null);

  const [markerMode, setMarkerMode] = useState(true);
  const [markers, setMarkers] = useState([]);

  const K = getValidK(draft?.undistort?.K, 1280, 720);
  const D = getValidD(draft?.undistort?.D);

  const redraw = useCallback(() => {
    const leftImg = leftImgRef.current;
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (
      !leftImg ||
      !leftCanvas ||
      !rightCanvas ||
      !leftImg.naturalWidth ||
      !leftImg.naturalHeight
    ) {
      return;
    }

    const dispW = Math.max(2, leftImg.clientWidth || 2);
    const dispH = Math.max(2, leftImg.clientHeight || 2);

    leftCanvas.width = dispW;
    leftCanvas.height = dispH;
    const lctx = leftCanvas.getContext("2d");
    lctx.clearRect(0, 0, dispW, dispH);
    markers.forEach((m, i) => {
      const x = (m.src.x * dispW) / leftImg.naturalWidth;
      const y = (m.src.y * dispH) / leftImg.naturalHeight;
      drawMarker(lctx, x, y, `P${i + 1}`, "#ef4444");
    });

    const out = renderUndistortedToCanvas(leftImg, rightCanvas, K, D, 860);
    if (!out) return;
    const rctx = rightCanvas.getContext("2d");
    const sx = out.width / leftImg.naturalWidth;
    const sy = out.height / leftImg.naturalHeight;
    markers.forEach((m, i) => {
      drawMarker(rctx, m.dst.x * sx, m.dst.y * sy, `P${i + 1}`, "#22d3ee");
    });
  }, [D, K, markers]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function onRightClick(e) {
    e.preventDefault();
    if (!markerMode) return;
    const img = leftImgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const r = img.getBoundingClientRect();
    const x = clamp(
      ((e.clientX - r.left) / r.width) * img.naturalWidth,
      0,
      img.naturalWidth - 1,
    );
    const y = clamp(
      ((e.clientY - r.top) / r.height) * img.naturalHeight,
      0,
      img.naturalHeight - 1,
    );
    const src = { x, y };
    const dst = undistortPointApprox(src, K, D) || src;
    setMarkers((prev) => [...prev, { src, dst }]);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Validation 1</div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={markerMode}
            onChange={(e) => setMarkerMode(e.target.checked)}
          />
          Marker Mode
        </label>
        <button className="btn btn-ghost btn-sm" onClick={() => setMarkers([])}>
          Clear All Markers
        </button>
        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          Right-click the left viewer to place markers.
        </div>
        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Distorted CCTV
          </div>
          <div
            style={{ position: "relative", background: "#080a0e" }}
            onContextMenu={onRightClick}
          >
            {locDetail?.cctv_url ? (
              <img
                ref={leftImgRef}
                src={locDetail.cctv_url}
                alt="Distorted"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                CCTV image unavailable.
              </div>
            )}
            <canvas
              ref={leftCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Undistorted CCTV
          </div>
          <div style={{ background: "#080a0e", padding: 8, minHeight: 320 }}>
            <canvas
              ref={rightCanvasRef}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HomographyAnchorsStage({ locDetail, draft, setDraft, onProceed }) {
  const leftImgRef = useRef(null);
  const rightImgRef = useRef(null);
  const leftCanvasRef = useRef(null);
  const rightCanvasRef = useRef(null);

  const [anchors, setAnchors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState(
    "Create at least 4 anchor pairs and place points on both images.",
  );

  useEffect(() => {
    const incoming = Array.isArray(draft?.homography?.anchors_list)
      ? draft.homography.anchors_list.map((a, idx) => ({
          id: toNum(a.id, idx),
          name: a.name || `Pair ${idx}`,
          coords_cctv:
            Array.isArray(a.coords_cctv) && a.coords_cctv.length >= 2
              ? [toNum(a.coords_cctv[0], 0), toNum(a.coords_cctv[1], 0)]
              : null,
          coords_sat:
            Array.isArray(a.coords_sat) && a.coords_sat.length >= 2
              ? [toNum(a.coords_sat[0], 0), toNum(a.coords_sat[1], 0)]
              : null,
        }))
      : [];
    setAnchors(incoming);
    setSelectedId(incoming[0]?.id ?? null);
  }, [draft?.homography?.anchors_list, locDetail?.code]);

  const selectedIdx = useMemo(
    () => anchors.findIndex((a) => a.id === selectedId),
    [anchors, selectedId],
  );

  const selectedAnchor = selectedIdx >= 0 ? anchors[selectedIdx] : null;

  const redraw = useCallback(() => {
    const leftImg = leftImgRef.current;
    const rightImg = rightImgRef.current;
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (!leftImg || !rightImg || !leftCanvas || !rightCanvas) return;

    if (leftImg.naturalWidth && leftImg.clientWidth) {
      leftCanvas.width = leftImg.clientWidth;
      leftCanvas.height = leftImg.clientHeight;
      const ctx = leftCanvas.getContext("2d");
      ctx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
      anchors.forEach((a, i) => {
        if (!a.coords_cctv) return;
        const x = (a.coords_cctv[0] * leftCanvas.width) / leftImg.naturalWidth;
        const y =
          (a.coords_cctv[1] * leftCanvas.height) / leftImg.naturalHeight;
        drawMarker(
          ctx,
          x,
          y,
          a.name || `P${i}`,
          a.id === selectedId ? "#22c55e" : "#ef4444",
        );
      });
    }

    if (rightImg.naturalWidth && rightImg.clientWidth) {
      rightCanvas.width = rightImg.clientWidth;
      rightCanvas.height = rightImg.clientHeight;
      const ctx = rightCanvas.getContext("2d");
      ctx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
      anchors.forEach((a, i) => {
        if (!a.coords_sat) return;
        const x = (a.coords_sat[0] * rightCanvas.width) / rightImg.naturalWidth;
        const y =
          (a.coords_sat[1] * rightCanvas.height) / rightImg.naturalHeight;
        drawMarker(
          ctx,
          x,
          y,
          a.name || `P${i}`,
          a.id === selectedId ? "#22c55e" : "#ef4444",
        );
      });
    }
  }, [anchors, selectedId]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function pushAnchorsToDraft(nextAnchors, maybeH) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.homography = next.homography || {};
      next.homography.anchors_list = nextAnchors;
      if (maybeH) next.homography.H = maybeH;
      return next;
    });
  }

  function addPair() {
    const nextId = anchors.length
      ? Math.max(...anchors.map((a) => a.id)) + 1
      : 0;
    const next = [
      ...anchors,
      {
        id: nextId,
        name: `Pair ${nextId}`,
        coords_cctv: null,
        coords_sat: null,
      },
    ];
    setAnchors(next);
    setSelectedId(nextId);
    pushAnchorsToDraft(next);
  }

  function removePair() {
    if (selectedIdx < 0) return;
    const next = anchors.filter((_, i) => i !== selectedIdx);
    setAnchors(next);
    setSelectedId(next[0]?.id ?? null);
    pushAnchorsToDraft(next);
  }

  function updateSelectedName(name) {
    if (selectedIdx < 0) return;
    const next = anchors.map((a, i) =>
      i === selectedIdx ? { ...a, name } : a,
    );
    setAnchors(next);
    pushAnchorsToDraft(next);
  }

  function setPoint(which, e) {
    e.preventDefault();
    if (selectedIdx < 0) {
      setStatus("Add and select an anchor pair first.");
      return;
    }

    const img = which === "cctv" ? leftImgRef.current : rightImgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const r = img.getBoundingClientRect();
    const px = clamp(
      ((e.clientX - r.left) / r.width) * img.naturalWidth,
      0,
      img.naturalWidth - 1,
    );
    const py = clamp(
      ((e.clientY - r.top) / r.height) * img.naturalHeight,
      0,
      img.naturalHeight - 1,
    );

    const next = anchors.map((a, i) => {
      if (i !== selectedIdx) return a;
      if (which === "cctv") return { ...a, coords_cctv: [px, py] };
      return { ...a, coords_sat: [px, py] };
    });
    setAnchors(next);
    pushAnchorsToDraft(next);
    setStatus(
      `Updated ${which.toUpperCase()} point for ${next[selectedIdx].name}.`,
    );
  }

  function computeHomography() {
    const complete = anchors.filter((a) => a.coords_cctv && a.coords_sat);
    if (complete.length < 4) {
      setStatus("Need at least 4 complete anchor pairs.");
      return;
    }

    const pairs = complete.map((a) => ({
      src: { x: a.coords_cctv[0], y: a.coords_cctv[1] },
      dst: { x: a.coords_sat[0], y: a.coords_sat[1] },
    }));

    const H = computeHomographyDLT(pairs);
    if (!H) {
      setStatus("Homography solve failed. Check anchor distribution.");
      return;
    }

    let inliers = 0;
    const thresh = 5;
    pairs.forEach((p) => {
      const pr = applyHomography(H, p.src.x, p.src.y);
      if (!pr) return;
      const err = Math.hypot(pr.x - p.dst.x, pr.y - p.dst.y);
      if (err <= thresh) inliers += 1;
    });

    pushAnchorsToDraft(anchors, H);
    setStatus(
      `Computed H from ${pairs.length} pairs. Inlier estimate: ${inliers}/${pairs.length} (${thresh}px).`,
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Homography Anchors</div>

        <div
          style={{ display: "grid", gap: 6, maxHeight: 240, overflow: "auto" }}
        >
          {anchors.map((a) => {
            const active = a.id === selectedId;
            return (
              <button
                key={a.id}
                className="btn btn-sm"
                onClick={() => setSelectedId(a.id)}
                style={{
                  justifyContent: "flex-start",
                  background: active ? "rgba(34,197,94,0.18)" : "transparent",
                  borderColor: active ? "rgba(34,197,94,0.8)" : "var(--border)",
                }}
              >
                {a.name}
                {a.coords_cctv ? " C" : " -"}
                {a.coords_sat ? " S" : " -"}
              </button>
            );
          })}
          {anchors.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(200,216,240,0.62)" }}>
              No anchor pairs yet.
            </div>
          )}
        </div>

        <label className="form-label" style={{ marginBottom: 0 }}>
          Selected Name
        </label>
        <input
          className="form-control"
          value={selectedAnchor?.name || ""}
          onChange={(e) => updateSelectedName(e.target.value)}
          disabled={!selectedAnchor}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={addPair}>
            Add Pair
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={removePair}
            disabled={!selectedAnchor}
          >
            Remove
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={computeHomography}
          >
            Compute Homography
          </button>
        </div>

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Undistorted CCTV (Right-click to set point)
          </div>
          <div
            style={{ position: "relative", background: "#080a0e" }}
            onContextMenu={(e) => setPoint("cctv", e)}
          >
            {locDetail?.cctv_url ? (
              <img
                ref={leftImgRef}
                src={locDetail.cctv_url}
                alt="CCTV"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                CCTV image unavailable.
              </div>
            )}
            <canvas
              ref={leftCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Satellite (Right-click to set point)
          </div>
          <div
            style={{ position: "relative", background: "#080a0e" }}
            onContextMenu={(e) => setPoint("sat", e)}
          >
            {locDetail?.sat_url ? (
              <img
                ref={rightImgRef}
                src={locDetail.sat_url}
                alt="SAT"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                Satellite image unavailable.
              </div>
            )}
            <canvas
              ref={rightCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HomographyFovStage({ locDetail, draft, setDraft, onProceed }) {
  const satImgRef = useRef(null);
  const satCanvasRef = useRef(null);
  const cctvImgRef = useRef(null);

  const [opacity, setOpacity] = useState(60);
  const [status, setStatus] = useState("Compute FOV polygon and overlay.");
  const [polygon, setPolygon] = useState(
    Array.isArray(draft?.homography?.fov_polygon)
      ? draft.homography.fov_polygon
          .filter((p) => Array.isArray(p) && p.length >= 2)
          .map((p) => ({ x: toNum(p[0], 0), y: toNum(p[1], 0) }))
      : [],
  );

  const H = safeMatrix3(draft?.homography?.H);

  const redraw = useCallback(() => {
    const satImg = satImgRef.current;
    const satCanvas = satCanvasRef.current;
    if (!satImg || !satCanvas || !satImg.clientWidth || !satImg.naturalWidth)
      return;

    satCanvas.width = satImg.clientWidth;
    satCanvas.height = satImg.clientHeight;
    const ctx = satCanvas.getContext("2d");
    ctx.clearRect(0, 0, satCanvas.width, satCanvas.height);

    if (polygon.length >= 3) {
      const dispPts = polygon.map((p) => ({
        x: (p.x * satCanvas.width) / satImg.naturalWidth,
        y: (p.y * satCanvas.height) / satImg.naturalHeight,
      }));
      ctx.save();
      ctx.fillStyle = `rgba(16, 185, 129, ${(opacity / 100) * 0.45})`;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dispPts[0].x, dispPts[0].y);
      for (let i = 1; i < dispPts.length; i += 1)
        ctx.lineTo(dispPts[i].x, dispPts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      dispPts.forEach((p, i) =>
        drawMarker(ctx, p.x, p.y, `${i + 1}`, "#22d3ee"),
      );
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.85)";
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(0, 0, satCanvas.width, satCanvas.height);
    ctx.restore();
  }, [opacity, polygon]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function computeFov() {
    if (!H) {
      setStatus("Missing homography matrix H.");
      return;
    }
    const cctvImg = cctvImgRef.current;
    if (!cctvImg || !cctvImg.naturalWidth || !cctvImg.naturalHeight) {
      setStatus("CCTV image unavailable.");
      return;
    }

    const corners = [
      { x: 0, y: 0 },
      { x: cctvImg.naturalWidth - 1, y: 0 },
      { x: cctvImg.naturalWidth - 1, y: cctvImg.naturalHeight - 1 },
      { x: 0, y: cctvImg.naturalHeight - 1 },
    ]
      .map((p) => applyHomography(H, p.x, p.y))
      .filter(Boolean);

    if (corners.length < 3) {
      setStatus("Failed to project enough corners.");
      return;
    }

    setPolygon(corners);
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.homography = next.homography || {};
      next.homography.fov_polygon = corners.map((p) => [p.x, p.y]);
      return next;
    });
    setStatus(`Computed FOV polygon with ${corners.length} points.`);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Homography FOV</div>

        <label className="form-label" style={{ marginBottom: 0 }}>
          Opacity: {opacity}%
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(toNum(e.target.value, 60))}
          style={{ width: "100%" }}
        />

        <button className="btn btn-primary btn-sm" onClick={computeFov}>
          Compute FOV & Warp
        </button>

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            CCTV Source
          </div>
          <div style={{ background: "#080a0e" }}>
            {locDetail?.cctv_url ? (
              <img
                ref={cctvImgRef}
                src={locDetail.cctv_url}
                alt="CCTV"
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>CCTV unavailable.</div>
            )}
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Satellite Composite
          </div>
          <div style={{ position: "relative", background: "#080a0e" }}>
            {locDetail?.sat_url ? (
              <img
                ref={satImgRef}
                src={locDetail.sat_url}
                alt="SAT"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                Satellite unavailable.
              </div>
            )}
            <canvas
              ref={satCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Validation2Stage({ locDetail, draft, onProceed }) {
  const cctvImgRef = useRef(null);
  const satImgRef = useRef(null);
  const cctvCanvasRef = useRef(null);
  const satCanvasRef = useRef(null);

  const [marks, setMarks] = useState([]);
  const [status, setStatus] = useState(
    "Right-click CCTV to project points to satellite.",
  );

  const K = getValidK(draft?.undistort?.K, 1280, 720);
  const D = getValidD(draft?.undistort?.D);
  const H = safeMatrix3(draft?.homography?.H);

  const redraw = useCallback(() => {
    const cctvImg = cctvImgRef.current;
    const satImg = satImgRef.current;
    const cctvCanvas = cctvCanvasRef.current;
    const satCanvas = satCanvasRef.current;
    if (!cctvImg || !satImg || !cctvCanvas || !satCanvas) return;

    if (cctvImg.clientWidth > 0 && cctvImg.naturalWidth > 0) {
      cctvCanvas.width = cctvImg.clientWidth;
      cctvCanvas.height = cctvImg.clientHeight;
      const ctx = cctvCanvas.getContext("2d");
      ctx.clearRect(0, 0, cctvCanvas.width, cctvCanvas.height);
      marks.forEach((m, i) => {
        drawMarker(
          ctx,
          (m.raw.x * cctvCanvas.width) / cctvImg.naturalWidth,
          (m.raw.y * cctvCanvas.height) / cctvImg.naturalHeight,
          `P${i + 1}`,
          "#ef4444",
        );
      });
    }

    if (satImg.clientWidth > 0 && satImg.naturalWidth > 0) {
      satCanvas.width = satImg.clientWidth;
      satCanvas.height = satImg.clientHeight;
      const ctx = satCanvas.getContext("2d");
      ctx.clearRect(0, 0, satCanvas.width, satCanvas.height);
      marks.forEach((m, i) => {
        drawMarker(
          ctx,
          (m.sat.x * satCanvas.width) / satImg.naturalWidth,
          (m.sat.y * satCanvas.height) / satImg.naturalHeight,
          `P${i + 1}`,
          "#22d3ee",
        );
      });
    }
  }, [marks]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function onRightClickCctv(e) {
    e.preventDefault();
    const img = cctvImgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    if (!H) {
      setStatus("Homography matrix missing.");
      return;
    }

    const r = img.getBoundingClientRect();
    const raw = {
      x: clamp(
        ((e.clientX - r.left) / r.width) * img.naturalWidth,
        0,
        img.naturalWidth - 1,
      ),
      y: clamp(
        ((e.clientY - r.top) / r.height) * img.naturalHeight,
        0,
        img.naturalHeight - 1,
      ),
    };
    const und = undistortPointApprox(raw, K, D) || raw;
    const sat = applyHomography(H, und.x, und.y);
    if (!sat) {
      setStatus("Projection failed for selected point.");
      return;
    }
    setMarks((prev) => [...prev, { raw, und, sat }]);
    setStatus(
      `CCTV (${Math.round(raw.x)}, ${Math.round(raw.y)}) -> SAT (${Math.round(sat.x)}, ${Math.round(sat.y)})`,
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Validation 2: Projection</div>
        <div className="alert alert-info" style={{ margin: 0 }}>
          Click CCTV (distorted), then project to Satellite using K/D + H.
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setMarks([])}>
          Clear Markers
        </button>
        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          {status}
        </div>
        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Raw CCTV (Right-click)
          </div>
          <div
            style={{ position: "relative", background: "#080a0e" }}
            onContextMenu={onRightClickCctv}
          >
            {locDetail?.cctv_url ? (
              <img
                ref={cctvImgRef}
                src={locDetail.cctv_url}
                alt="CCTV"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>CCTV unavailable.</div>
            )}
            <canvas
              ref={cctvCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Satellite
          </div>
          <div style={{ position: "relative", background: "#080a0e" }}>
            {locDetail?.sat_url ? (
              <img
                ref={satImgRef}
                src={locDetail.sat_url}
                alt="SAT"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                Satellite unavailable.
              </div>
            )}
            <canvas
              ref={satCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ParallaxSubjectsStage({ locDetail, draft, setDraft, onProceed }) {
  const cctvImgRef = useRef(null);
  const satImgRef = useRef(null);
  const cctvCanvasRef = useRef(null);
  const satCanvasRef = useRef(null);

  const [referenceHeight, setReferenceHeight] = useState(1.6);
  const [points, setPoints] = useState([]);
  const [status, setStatus] = useState("Select Subject 1 Head.");

  const K = getValidK(draft?.undistort?.K, 1280, 720);
  const D = getValidD(draft?.undistort?.D);
  const H = safeMatrix3(draft?.homography?.H);

  const labels = ["S1-H", "S1-F", "S2-H", "S2-F"];

  const redraw = useCallback(() => {
    const cctvImg = cctvImgRef.current;
    const satImg = satImgRef.current;
    const cctvCanvas = cctvCanvasRef.current;
    const satCanvas = satCanvasRef.current;
    if (!cctvImg || !satImg || !cctvCanvas || !satCanvas) return;

    if (cctvImg.clientWidth > 0 && cctvImg.naturalWidth > 0) {
      cctvCanvas.width = cctvImg.clientWidth;
      cctvCanvas.height = cctvImg.clientHeight;
      const ctx = cctvCanvas.getContext("2d");
      ctx.clearRect(0, 0, cctvCanvas.width, cctvCanvas.height);
      points.forEach((p, i) => {
        drawMarker(
          ctx,
          (p.raw.x * cctvCanvas.width) / cctvImg.naturalWidth,
          (p.raw.y * cctvCanvas.height) / cctvImg.naturalHeight,
          labels[i],
          i % 2 === 0 ? "#ef4444" : "#22d3ee",
        );
      });
    }

    if (satImg.clientWidth > 0 && satImg.naturalWidth > 0) {
      satCanvas.width = satImg.clientWidth;
      satCanvas.height = satImg.clientHeight;
      const ctx = satCanvas.getContext("2d");
      ctx.clearRect(0, 0, satCanvas.width, satCanvas.height);
      points.forEach((p, i) => {
        drawMarker(
          ctx,
          (p.sat.x * satCanvas.width) / satImg.naturalWidth,
          (p.sat.y * satCanvas.height) / satImg.naturalHeight,
          labels[i],
          i % 2 === 0 ? "#ef4444" : "#22d3ee",
        );
      });

      if (points.length >= 4) {
        const h1 = points[0].sat;
        const f1 = points[1].sat;
        const h2 = points[2].sat;
        const f2 = points[3].sat;
        const cam = lineIntersection(h1, f1, h2, f2);
        if (cam) {
          const camDisp = {
            x: (cam.x * satCanvas.width) / satImg.naturalWidth,
            y: (cam.y * satCanvas.height) / satImg.naturalHeight,
          };
          drawMarker(ctx, camDisp.x, camDisp.y, "CAM", "#22c55e");

          [h1, f1, h2, f2].forEach((pt, i) => {
            const pd = {
              x: (pt.x * satCanvas.width) / satImg.naturalWidth,
              y: (pt.y * satCanvas.height) / satImg.naturalHeight,
            };
            ctx.save();
            ctx.strokeStyle =
              i % 2 === 0 ? "rgba(239,68,68,0.8)" : "rgba(34,211,238,0.8)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(camDisp.x, camDisp.y);
            ctx.lineTo(pd.x, pd.y);
            ctx.stroke();
            ctx.restore();
          });
        }
      }
    }
  }, [labels, points]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function computeAndStoreParallax(nextPoints) {
    if (nextPoints.length < 4) return;

    const h1 = nextPoints[0].sat;
    const f1 = nextPoints[1].sat;
    const h2 = nextPoints[2].sat;
    const f2 = nextPoints[3].sat;
    const cam = lineIntersection(h1, f1, h2, f2);
    if (!cam) {
      setStatus(
        "Parallax rays are near-parallel. Choose better separated subjects.",
      );
      return;
    }

    const zVals = [];
    [
      [h1, f1],
      [h2, f2],
    ].forEach(([head, feet]) => {
      const dApp = Math.hypot(head.x - cam.x, head.y - cam.y);
      const dTrue = Math.hypot(feet.x - cam.x, feet.y - cam.y);
      if (dApp < 1e-6) return;
      const ratio = dTrue / dApp;
      const denom = 1 - ratio;
      if (Math.abs(denom) < 1e-6) return;
      const z = referenceHeight / denom;
      if (Number.isFinite(z) && z > 0) zVals.push(z);
    });

    if (!zVals.length) {
      setStatus("Unable to estimate camera height from selected subjects.");
      return;
    }

    const zCam = zVals.reduce((a, b) => a + b, 0) / zVals.length;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.parallax = next.parallax || {};
      next.parallax.x_cam_coords_sat = cam.x;
      next.parallax.y_cam_coords_sat = cam.y;
      next.parallax.z_cam_meters = zCam;
      return next;
    });

    setStatus(
      `Camera at (${cam.x.toFixed(1)}, ${cam.y.toFixed(1)}), z=${zCam.toFixed(2)}m from ${zVals.length} subject(s).`,
    );
  }

  function onCctvRightClick(e) {
    e.preventDefault();
    if (!H) {
      setStatus("Missing homography matrix H.");
      return;
    }
    if (points.length >= 4) {
      setStatus(
        "Already captured two subjects. Reset points to capture again.",
      );
      return;
    }

    const img = cctvImgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const r = img.getBoundingClientRect();
    const raw = {
      x: clamp(
        ((e.clientX - r.left) / r.width) * img.naturalWidth,
        0,
        img.naturalWidth - 1,
      ),
      y: clamp(
        ((e.clientY - r.top) / r.height) * img.naturalHeight,
        0,
        img.naturalHeight - 1,
      ),
    };
    const und = undistortPointApprox(raw, K, D) || raw;
    const sat = applyHomography(H, und.x, und.y);
    if (!sat) {
      setStatus("Projection failed for selected point.");
      return;
    }

    const next = [...points, { raw, und, sat }];
    setPoints(next);
    if (next.length < 4) {
      setStatus(
        `Captured ${labels[next.length - 1]}. Next: ${labels[next.length]}.`,
      );
    } else {
      computeAndStoreParallax(next);
    }
  }

  function resetPoints() {
    setPoints([]);
    setStatus("Select Subject 1 Head.");
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Parallax Subjects</div>

        <label className="form-label" style={{ marginBottom: 0 }}>
          Reference Height (m)
        </label>
        <input
          className="form-control"
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          value={referenceHeight}
          onChange={(e) =>
            setReferenceHeight(clamp(toNum(e.target.value, 1.6), 0.1, 10))
          }
        />

        <button className="btn btn-ghost btn-sm" onClick={resetPoints}>
          Reset Points
        </button>

        <div className="alert alert-info" style={{ margin: 0 }}>
          Selection order: S1 Head, S1 Feet, S2 Head, S2 Feet.
        </div>

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Undistorted CCTV (Right-click)
          </div>
          <div
            style={{ position: "relative", background: "#080a0e" }}
            onContextMenu={onCctvRightClick}
          >
            {locDetail?.cctv_url ? (
              <img
                ref={cctvImgRef}
                src={locDetail.cctv_url}
                alt="CCTV"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>CCTV unavailable.</div>
            )}
            <canvas
              ref={cctvCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Satellite
          </div>
          <div style={{ position: "relative", background: "#080a0e" }}>
            {locDetail?.sat_url ? (
              <img
                ref={satImgRef}
                src={locDetail.sat_url}
                alt="SAT"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                Satellite unavailable.
              </div>
            )}
            <canvas
              ref={satCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DistanceReferenceStage({ locDetail, draft, setDraft, onProceed }) {
  const satImgRef = useRef(null);
  const satCanvasRef = useRef(null);

  const anchors = useMemo(
    () =>
      (draft?.homography?.anchors_list || [])
        .filter((a) => Array.isArray(a.coords_sat) && a.coords_sat.length >= 2)
        .map((a, idx) => ({
          id: toNum(a.id, idx),
          name: a.name || `Pair ${idx}`,
          pt: { x: toNum(a.coords_sat[0], 0), y: toNum(a.coords_sat[1], 0) },
        })),
    [draft?.homography?.anchors_list],
  );

  const [startId, setStartId] = useState("");
  const [endId, setEndId] = useState("");
  const [realM, setRealM] = useState(5);
  const [status, setStatus] = useState(
    "Select anchor pair and enter real-world distance.",
  );

  useEffect(() => {
    if (anchors.length >= 2) {
      setStartId(String(anchors[0].id));
      setEndId(String(anchors[1].id));
    }
  }, [anchors]);

  const redraw = useCallback(() => {
    const satImg = satImgRef.current;
    const satCanvas = satCanvasRef.current;
    if (!satImg || !satCanvas || !satImg.clientWidth || !satImg.naturalWidth)
      return;
    satCanvas.width = satImg.clientWidth;
    satCanvas.height = satImg.clientHeight;
    const ctx = satCanvas.getContext("2d");
    ctx.clearRect(0, 0, satCanvas.width, satCanvas.height);

    const start = anchors.find((a) => String(a.id) === String(startId));
    const end = anchors.find((a) => String(a.id) === String(endId));

    anchors.forEach((a, i) => {
      const x = (a.pt.x * satCanvas.width) / satImg.naturalWidth;
      const y = (a.pt.y * satCanvas.height) / satImg.naturalHeight;
      drawMarker(ctx, x, y, a.name || `A${i}`, "#9ca3af");
    });

    if (start && end) {
      const sx = (start.pt.x * satCanvas.width) / satImg.naturalWidth;
      const sy = (start.pt.y * satCanvas.height) / satImg.naturalHeight;
      const ex = (end.pt.x * satCanvas.width) / satImg.naturalWidth;
      const ey = (end.pt.y * satCanvas.height) / satImg.naturalHeight;
      ctx.save();
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    }
  }, [anchors, endId, startId]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function computeScale() {
    const start = anchors.find((a) => String(a.id) === String(startId));
    const end = anchors.find((a) => String(a.id) === String(endId));
    const meters = toNum(realM, 0);
    if (!start || !end) {
      setStatus("Pick two valid anchor points.");
      return;
    }
    if (meters <= 0) {
      setStatus("Real distance must be > 0.");
      return;
    }

    const dPx = Math.hypot(start.pt.x - end.pt.x, start.pt.y - end.pt.y);
    const pxPerM = dPx / meters;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.parallax = next.parallax || {};
      next.parallax.scale = {
        measured_px: dPx,
        real_m: meters,
        reference_anchors: [start.name, end.name],
      };
      next.parallax.px_per_meter = pxPerM;
      return next;
    });

    setStatus(
      `Scale: ${pxPerM.toFixed(3)} px/m (distance: ${dPx.toFixed(2)} px).`,
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Distance Reference</div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Start Point</label>
          <select
            className="form-control"
            value={startId}
            onChange={(e) => setStartId(e.target.value)}
          >
            {anchors.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">End Point</label>
          <select
            className="form-control"
            value={endId}
            onChange={(e) => setEndId(e.target.value)}
          >
            {anchors.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Real World Distance (m)</label>
          <input
            className="form-control"
            type="number"
            min={0.1}
            max={1000}
            step={0.1}
            value={realM}
            onChange={(e) =>
              setRealM(clamp(toNum(e.target.value, 5), 0.1, 1000))
            }
          />
        </div>

        <button className="btn btn-primary btn-sm" onClick={computeScale}>
          Compute Scale
        </button>

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "8px 10px",
            fontSize: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
          Satellite Anchors
        </div>
        <div style={{ position: "relative", background: "#080a0e" }}>
          {locDetail?.sat_url ? (
            <img
              ref={satImgRef}
              src={locDetail.sat_url}
              alt="SAT"
              onLoad={redraw}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          ) : (
            <div style={{ padding: 16, fontSize: 12 }}>
              Satellite unavailable.
            </div>
          )}
          <canvas
            ref={satCanvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Validation3Stage({ locDetail, draft, onProceed }) {
  const cctvImgRef = useRef(null);
  const satImgRef = useRef(null);
  const cctvCanvasRef = useRef(null);
  const satCanvasRef = useRef(null);

  const [objHeight, setObjHeight] = useState(1.7);
  const [mode, setMode] = useState("cctv_head");
  const [marks, setMarks] = useState([]);
  const [status, setStatus] = useState(
    "Choose interaction mode and right-click corresponding view.",
  );

  const K = getValidK(draft?.undistort?.K, 1280, 720);
  const D = getValidD(draft?.undistort?.D);
  const H = safeMatrix3(draft?.homography?.H);
  const Hinv = H ? invert3x3(H) : null;
  const cam = {
    x: toNum(draft?.parallax?.x_cam_coords_sat, 0),
    y: toNum(draft?.parallax?.y_cam_coords_sat, 0),
  };
  const zCam = toNum(draft?.parallax?.z_cam_meters, 0);

  const redraw = useCallback(() => {
    const cctvImg = cctvImgRef.current;
    const satImg = satImgRef.current;
    const cctvCanvas = cctvCanvasRef.current;
    const satCanvas = satCanvasRef.current;
    if (!cctvImg || !satImg || !cctvCanvas || !satCanvas) return;

    if (cctvImg.clientWidth > 0 && cctvImg.naturalWidth > 0) {
      cctvCanvas.width = cctvImg.clientWidth;
      cctvCanvas.height = cctvImg.clientHeight;
      const ctx = cctvCanvas.getContext("2d");
      ctx.clearRect(0, 0, cctvCanvas.width, cctvCanvas.height);

      marks.forEach((m, i) => {
        if (m.headCctv) {
          drawMarker(
            ctx,
            (m.headCctv.x * cctvCanvas.width) / cctvImg.naturalWidth,
            (m.headCctv.y * cctvCanvas.height) / cctvImg.naturalHeight,
            `H${i + 1}`,
            "#ef4444",
          );
        }
        if (m.feetCctv) {
          drawMarker(
            ctx,
            (m.feetCctv.x * cctvCanvas.width) / cctvImg.naturalWidth,
            (m.feetCctv.y * cctvCanvas.height) / cctvImg.naturalHeight,
            `F${i + 1}`,
            "#22d3ee",
          );
        }
        if (m.headCctv && m.feetCctv) {
          const hx = (m.headCctv.x * cctvCanvas.width) / cctvImg.naturalWidth;
          const hy = (m.headCctv.y * cctvCanvas.height) / cctvImg.naturalHeight;
          const fx = (m.feetCctv.x * cctvCanvas.width) / cctvImg.naturalWidth;
          const fy = (m.feetCctv.y * cctvCanvas.height) / cctvImg.naturalHeight;
          ctx.save();
          ctx.strokeStyle = "#4ade80";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(fx, fy);
          ctx.stroke();
          ctx.restore();
        }
      });
    }

    if (satImg.clientWidth > 0 && satImg.naturalWidth > 0) {
      satCanvas.width = satImg.clientWidth;
      satCanvas.height = satImg.clientHeight;
      const ctx = satCanvas.getContext("2d");
      ctx.clearRect(0, 0, satCanvas.width, satCanvas.height);
      marks.forEach((m, i) => {
        if (m.feetSat) {
          drawMarker(
            ctx,
            (m.feetSat.x * satCanvas.width) / satImg.naturalWidth,
            (m.feetSat.y * satCanvas.height) / satImg.naturalHeight,
            `F${i + 1}`,
            "#22d3ee",
          );
        }
      });
    }
  }, [marks]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function onCctvRightClick(e) {
    if (mode !== "cctv_head") return;
    e.preventDefault();
    if (!H || !Hinv) {
      setStatus("Missing H matrix.");
      return;
    }
    if (Math.abs(zCam) < 1e-6) {
      setStatus("Camera height z_cam_meters is required.");
      return;
    }

    const img = cctvImgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const r = img.getBoundingClientRect();
    const raw = {
      x: clamp(
        ((e.clientX - r.left) / r.width) * img.naturalWidth,
        0,
        img.naturalWidth - 1,
      ),
      y: clamp(
        ((e.clientY - r.top) / r.height) * img.naturalHeight,
        0,
        img.naturalHeight - 1,
      ),
    };

    const und = undistortPointApprox(raw, K, D) || raw;
    const appSat = applyHomography(H, und.x, und.y);
    if (!appSat) {
      setStatus("Failed to map clicked head point to satellite.");
      return;
    }

    const factor = (zCam - objHeight) / zCam;
    const feetSat = {
      x: cam.x + (appSat.x - cam.x) * factor,
      y: cam.y + (appSat.y - cam.y) * factor,
    };
    const feetCctv = applyHomography(Hinv, feetSat.x, feetSat.y);
    if (!feetCctv) {
      setStatus("Failed to map corrected feet back to CCTV.");
      return;
    }

    setMarks((prev) => [...prev, { headCctv: raw, feetCctv, feetSat }]);
    setStatus(
      "Forward parallax computed (CCTV head -> SAT feet -> CCTV feet).",
    );
  }

  function onSatRightClick(e) {
    if (mode !== "map_feet") return;
    e.preventDefault();
    if (!Hinv) {
      setStatus("Missing inverse H matrix.");
      return;
    }
    if (Math.abs(zCam - objHeight) < 1e-6) {
      setStatus("Object height too close to camera height.");
      return;
    }

    const img = satImgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const r = img.getBoundingClientRect();
    const feetSat = {
      x: clamp(
        ((e.clientX - r.left) / r.width) * img.naturalWidth,
        0,
        img.naturalWidth - 1,
      ),
      y: clamp(
        ((e.clientY - r.top) / r.height) * img.naturalHeight,
        0,
        img.naturalHeight - 1,
      ),
    };

    const feetCctv = applyHomography(Hinv, feetSat.x, feetSat.y);
    if (!feetCctv) {
      setStatus("Failed to inverse-project feet point to CCTV.");
      return;
    }

    const factor = zCam / (zCam - objHeight);
    const appHeadSat = {
      x: cam.x + (feetSat.x - cam.x) * factor,
      y: cam.y + (feetSat.y - cam.y) * factor,
    };
    const headCctv = applyHomography(Hinv, appHeadSat.x, appHeadSat.y);
    if (!headCctv) {
      setStatus("Failed to project apparent head to CCTV.");
      return;
    }

    setMarks((prev) => [...prev, { headCctv, feetCctv, feetSat }]);
    setStatus("Reverse parallax computed (SAT feet -> CCTV feet/head).");
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Validation 3: Parallax</div>

        <label className="form-label" style={{ marginBottom: 0 }}>
          Object Height (m)
        </label>
        <input
          className="form-control"
          type="number"
          min={0.1}
          max={5}
          step={0.1}
          value={objHeight}
          onChange={(e) =>
            setObjHeight(clamp(toNum(e.target.value, 1.7), 0.1, 5))
          }
        />

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <input
            type="radio"
            checked={mode === "cctv_head"}
            onChange={() => setMode("cctv_head")}
          />
          Click CCTV (Head)
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <input
            type="radio"
            checked={mode === "map_feet"}
            onChange={() => setMode("map_feet")}
          />
          Click Map (Feet)
        </label>

        <button className="btn btn-ghost btn-sm" onClick={() => setMarks([])}>
          Clear Markers
        </button>

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Undistorted CCTV {mode === "cctv_head" ? "(Right-click)" : ""}
          </div>
          <div
            style={{ position: "relative", background: "#080a0e" }}
            onContextMenu={onCctvRightClick}
          >
            {locDetail?.cctv_url ? (
              <img
                ref={cctvImgRef}
                src={locDetail.cctv_url}
                alt="CCTV"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>CCTV unavailable.</div>
            )}
            <canvas
              ref={cctvCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Satellite {mode === "map_feet" ? "(Right-click)" : ""}
          </div>
          <div
            style={{ position: "relative", background: "#080a0e" }}
            onContextMenu={onSatRightClick}
          >
            {locDetail?.sat_url ? (
              <img
                ref={satImgRef}
                src={locDetail.sat_url}
                alt="SAT"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                Satellite unavailable.
              </div>
            )}
            <canvas
              ref={satCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SvgAlignmentStage({ locDetail, draft, setDraft, onProceed }) {
  const satImgRef = useRef(null);
  const satCanvasRef = useRef(null);
  const svgImgRef = useRef(null);
  const svgCanvasRef = useRef(null);

  const [svgText, setSvgText] = useState("");
  const [svgPoints, setSvgPoints] = useState([]);
  const [links, setLinks] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [opacity, setOpacity] = useState(65);
  const [status, setStatus] = useState(
    "Link SVG points with SAT anchors and compute alignment.",
  );

  const satAnchors = useMemo(
    () =>
      (draft?.homography?.anchors_list || [])
        .filter((a) => Array.isArray(a.coords_sat) && a.coords_sat.length >= 2)
        .map((a, idx) => ({
          id: toNum(a.id, idx),
          name: a.name || `Pair ${idx}`,
          pt: { x: toNum(a.coords_sat[0], 0), y: toNum(a.coords_sat[1], 0) },
        })),
    [draft?.homography?.anchors_list],
  );

  useEffect(() => {
    if (!locDetail?.layout_url) {
      setSvgText("");
      setSvgPoints([]);
      return;
    }
    let cancelled = false;
    fetch(locDetail.layout_url)
      .then((r) => r.text())
      .then((txt) => {
        if (cancelled) return;
        setSvgText(txt);
        const segs = parseSvgSegments(txt, null);
        const pts = dedupePoints(
          segs.flatMap((s) => [s.p1, s.p2]),
          180,
        );
        setSvgPoints(pts);
      })
      .catch(() => {
        if (!cancelled) {
          setSvgText("");
          setSvgPoints([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locDetail?.layout_url]);

  useEffect(() => {
    const pairs = Array.isArray(draft?.layout_svg?.association_pairs)
      ? draft.layout_svg.association_pairs
      : [];
    if (pairs.length > 0) {
      setLinks(
        pairs.map((p) => ({
          satId: String(toNum(p.sat_id, "")),
          svgIdx: String(toNum(p.svg_id, "")),
        })),
      );
      return;
    }
    if (!links.length && satAnchors.length && svgPoints.length) {
      setLinks([{ satId: String(satAnchors[0].id), svgIdx: "0" }]);
    }
  }, [
    draft?.layout_svg?.association_pairs,
    links.length,
    satAnchors,
    svgPoints.length,
  ]);

  const alignedSegments = useMemo(
    () => parseSvgSegments(svgText, draft?.layout_svg?.A),
    [draft?.layout_svg?.A, svgText],
  );

  const redraw = useCallback(() => {
    const satImg = satImgRef.current;
    const satCanvas = satCanvasRef.current;
    if (!satImg || !satCanvas || !satImg.clientWidth || !satImg.naturalWidth)
      return;
    satCanvas.width = satImg.clientWidth;
    satCanvas.height = satImg.clientHeight;
    const sctx = satCanvas.getContext("2d");
    sctx.clearRect(0, 0, satCanvas.width, satCanvas.height);

    satAnchors.forEach((a, i) => {
      drawMarker(
        sctx,
        (a.pt.x * satCanvas.width) / satImg.naturalWidth,
        (a.pt.y * satCanvas.height) / satImg.naturalHeight,
        a.name || `A${i}`,
        "#ef4444",
      );
    });

    if (showResult && alignedSegments.length) {
      sctx.save();
      sctx.strokeStyle = `rgba(34,211,238,${opacity / 100})`;
      sctx.lineWidth = 1.5;
      alignedSegments.forEach((seg) => {
        const x1 = (seg.p1.x * satCanvas.width) / satImg.naturalWidth;
        const y1 = (seg.p1.y * satCanvas.height) / satImg.naturalHeight;
        const x2 = (seg.p2.x * satCanvas.width) / satImg.naturalWidth;
        const y2 = (seg.p2.y * satCanvas.height) / satImg.naturalHeight;
        sctx.beginPath();
        sctx.moveTo(x1, y1);
        sctx.lineTo(x2, y2);
        sctx.stroke();
      });
      sctx.restore();
    }

    const svgImg = svgImgRef.current;
    const svgCanvas = svgCanvasRef.current;
    if (!svgImg || !svgCanvas || !svgImg.clientWidth || !svgImg.naturalWidth)
      return;
    svgCanvas.width = svgImg.clientWidth;
    svgCanvas.height = svgImg.clientHeight;
    const vctx = svgCanvas.getContext("2d");
    vctx.clearRect(0, 0, svgCanvas.width, svgCanvas.height);
    svgPoints.forEach((p, i) => {
      if (i % Math.ceil(Math.max(1, svgPoints.length / 60)) !== 0) return;
      drawMarker(
        vctx,
        (p.x * svgCanvas.width) / svgImg.naturalWidth,
        (p.y * svgCanvas.height) / svgImg.naturalHeight,
        `${i}`,
        "#22d3ee",
      );
    });
  }, [alignedSegments, opacity, satAnchors, showResult, svgPoints]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function updateLink(i, key, value) {
    setLinks((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)),
    );
  }

  function addLink() {
    setLinks((prev) => [
      ...prev,
      {
        satId: satAnchors[0] ? String(satAnchors[0].id) : "",
        svgIdx: svgPoints.length ? "0" : "",
      },
    ]);
  }

  function removeLink(i) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  function computeAlignment() {
    const src = [];
    const dst = [];
    const pairs = [];
    links.forEach((row) => {
      const sat = satAnchors.find((a) => String(a.id) === String(row.satId));
      const svgPt = svgPoints[toNum(row.svgIdx, -1)];
      if (!sat || !svgPt) return;
      src.push(svgPt);
      dst.push(sat.pt);
      pairs.push({ svg_id: toNum(row.svgIdx, -1), sat_id: sat.id });
    });

    if (src.length < 3) {
      setStatus("Need at least 3 valid link pairs.");
      return;
    }

    const out = computeAffineLeastSquares(src, dst);
    if (!out) {
      setStatus("Affine solve failed.");
      return;
    }

    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.layout_svg = next.layout_svg || {};
      next.layout_svg.A = out.A;
      next.layout_svg.association_pairs = pairs;
      return next;
    });
    setStatus(
      `Alignment computed. Mean residual: ${out.residual.toFixed(2)} px.`,
    );
    setShowResult(true);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">SVG Alignment</div>

        <div
          style={{ display: "grid", gap: 8, maxHeight: 240, overflow: "auto" }}
        >
          {links.map((row, i) => (
            <div
              key={`${i}-${row.satId}-${row.svgIdx}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr auto",
                gap: 6,
              }}
            >
              <select
                className="form-control"
                value={row.satId}
                onChange={(e) => updateLink(i, "satId", e.target.value)}
              >
                {satAnchors.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                className="form-control"
                value={row.svgIdx}
                onChange={(e) => updateLink(i, "svgIdx", e.target.value)}
              >
                {svgPoints.slice(0, 400).map((_, idx) => (
                  <option key={idx} value={String(idx)}>
                    SVG #{idx}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => removeLink(i)}
              >
                X
              </button>
            </div>
          ))}
          {links.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(200,216,240,0.62)" }}>
              No links yet.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={addLink}>
            Add Link
          </button>
          <button className="btn btn-primary btn-sm" onClick={computeAlignment}>
            Compute Alignment
          </button>
          {showResult && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowResult(false)}
            >
              Back to Editing
            </button>
          )}
        </div>

        <label className="form-label" style={{ marginBottom: 0 }}>
          Overlay Opacity: {opacity}%
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(toNum(e.target.value, 65))}
          style={{ width: "100%" }}
        />

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.62)" }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      {showResult ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Result Overlay (SAT + aligned SVG segments)
          </div>
          <div style={{ position: "relative", background: "#080a0e" }}>
            {locDetail?.sat_url ? (
              <img
                ref={satImgRef}
                src={locDetail.sat_url}
                alt="SAT"
                onLoad={redraw}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12 }}>
                Satellite unavailable.
              </div>
            )}
            <canvas
              ref={satCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      ) : (
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                padding: "8px 10px",
                fontSize: 12,
                borderBottom: "1px solid var(--border)",
              }}
            >
              Satellite Anchors
            </div>
            <div style={{ position: "relative", background: "#080a0e" }}>
              {locDetail?.sat_url ? (
                <img
                  ref={satImgRef}
                  src={locDetail.sat_url}
                  alt="SAT"
                  onLoad={redraw}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              ) : (
                <div style={{ padding: 16, fontSize: 12 }}>
                  Satellite unavailable.
                </div>
              )}
              <canvas
                ref={satCanvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                padding: "8px 10px",
                fontSize: 12,
                borderBottom: "1px solid var(--border)",
              }}
            >
              SVG Anchor Points
            </div>
            <div style={{ position: "relative", background: "#080a0e" }}>
              {locDetail?.layout_url ? (
                <img
                  ref={svgImgRef}
                  src={locDetail.layout_url}
                  alt="SVG"
                  onLoad={redraw}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              ) : (
                <div style={{ padding: 16, fontSize: 12 }}>
                  SVG unavailable.
                </div>
              )}
              <canvas
                ref={svgCanvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoiStage({ locDetail, draft, setDraft, onProceed }) {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  const [method, setMethod] = useState(draft?.roi_method || "partial");
  const [showMask, setShowMask] = useState(true);
  const [status, setStatus] = useState(
    "Draw box with left mouse drag to validate ROI.",
  );
  const [maskData, setMaskData] = useState(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [startPt, setStartPt] = useState(null);
  const [currPt, setCurrPt] = useState(null);
  const [finalRect, setFinalRect] = useState(null);

  useEffect(() => {
    setMethod(draft?.roi_method || "partial");
  }, [draft?.roi_method, locDetail?.code]);

  useEffect(() => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.roi_method = method;
      return next;
    });
  }, [method, setDraft]);

  useEffect(() => {
    setMaskData(null);
    if (!locDetail?.roi_url) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, c.width, c.height);

      const overlay = document.createElement("canvas");
      overlay.width = c.width;
      overlay.height = c.height;
      const octx = overlay.getContext("2d");
      const out = octx.createImageData(c.width, c.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const a = imageData.data[i + 3];
        const invalid = a >= 10 && r < 10 && g < 10 && b < 10;
        out.data[i] = 255;
        out.data[i + 1] = 0;
        out.data[i + 2] = 0;
        out.data[i + 3] = invalid ? 80 : 0;
      }
      octx.putImageData(out, 0, 0);
      setMaskData({
        data: imageData,
        width: c.width,
        height: c.height,
        overlay,
      });
    };
    img.src = locDetail.roi_url;
  }, [locDetail?.roi_url]);

  const toNatural = useCallback((evt) => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const r = img.getBoundingClientRect();
    return {
      x: clamp(
        ((evt.clientX - r.left) / r.width) * img.naturalWidth,
        0,
        img.naturalWidth - 1,
      ),
      y: clamp(
        ((evt.clientY - r.top) / r.height) * img.naturalHeight,
        0,
        img.naturalHeight - 1,
      ),
    };
  }, []);

  const validateRect = useCallback(
    (rect) => {
      if (!maskData) return true;
      const corners = [
        { x: rect.x1, y: rect.y1 },
        { x: rect.x2, y: rect.y1 },
        { x: rect.x1, y: rect.y2 },
        { x: rect.x2, y: rect.y2 },
      ];
      let validCount = 0;
      for (const c of corners) {
        const x = clamp(Math.round(c.x), 0, maskData.width - 1);
        const y = clamp(Math.round(c.y), 0, maskData.height - 1);
        const i = (y * maskData.width + x) * 4;
        const r = maskData.data.data[i];
        const g = maskData.data.data[i + 1];
        const b = maskData.data.data[i + 2];
        const a = maskData.data.data[i + 3];
        const isValid = a < 10 || !(r < 10 && g < 10 && b < 10);
        if (isValid) validCount += 1;
      }
      return method === "in" ? validCount === 4 : validCount >= 1;
    },
    [maskData, method],
  );

  const redraw = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.clientWidth || !img.naturalWidth) return;
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (showMask && maskData?.overlay) {
      ctx.drawImage(maskData.overlay, 0, 0, canvas.width, canvas.height);
    }

    const rect =
      isDrawing && startPt && currPt
        ? normalizeBox(startPt, currPt)
        : finalRect;
    if (rect) {
      const x = (rect.x1 * canvas.width) / img.naturalWidth;
      const y = (rect.y1 * canvas.height) / img.naturalHeight;
      const w = (rect.width * canvas.width) / img.naturalWidth;
      const h = (rect.height * canvas.height) / img.naturalHeight;
      const ok = validateRect(rect);
      ctx.save();
      ctx.strokeStyle = ok ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }, [currPt, finalRect, isDrawing, maskData, showMask, startPt, validateRect]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function onMouseDown(e) {
    if (e.button !== 0) return;
    const pt = toNatural(e);
    if (!pt) return;
    setIsDrawing(true);
    setStartPt(pt);
    setCurrPt(pt);
  }

  function onMouseMove(e) {
    if (!isDrawing) return;
    const pt = toNatural(e);
    if (!pt) return;
    setCurrPt(pt);
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    const pt = toNatural(e) || currPt || startPt;
    const s = startPt;
    setIsDrawing(false);
    setCurrPt(null);
    setStartPt(null);
    if (!pt || !s) return;

    const rect = normalizeBox(s, pt);
    if (rect.width < 3 || rect.height < 3) {
      setStatus("Draw a larger box.");
      return;
    }
    const ok = validateRect(rect);
    setFinalRect(rect);
    setStatus(ok ? "Valid" : "Blocked");
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "310px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">ROI</div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <input
            type="radio"
            checked={method === "partial"}
            onChange={() => setMethod("partial")}
          />
          Partial
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <input
            type="radio"
            checked={method === "in"}
            onChange={() => setMethod("in")}
          />
          In (Strict)
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={showMask}
            onChange={(e) => setShowMask(e.target.checked)}
          />
          Show ROI Mask
        </label>

        <div
          className={`alert alert-${status === "Valid" ? "success" : status === "Blocked" ? "error" : "info"}`}
          style={{ margin: 0 }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "8px 10px",
            fontSize: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
          CCTV (Left-drag to draw ROI test box)
        </div>
        <div
          style={{ position: "relative", background: "#080a0e" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {locDetail?.cctv_url ? (
            <img
              ref={imgRef}
              src={locDetail.cctv_url}
              alt="CCTV"
              onLoad={redraw}
              draggable={false}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          ) : (
            <div style={{ padding: 16, fontSize: 12 }}>CCTV unavailable.</div>
          )}
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function FinalValidationStage({ locDetail, draft, setDraft, onProceed }) {
  const cctvWrapRef = useRef(null);
  const cctvImgRef = useRef(null);
  const cctvCanvasRef = useRef(null);
  const satImgRef = useRef(null);
  const satCanvasRef = useRef(null);
  const roiOverlayRef = useRef(null);

  const [dimW, setDimW] = useState(1.8);
  const [dimL, setDimL] = useState(3.5);
  const [dimH, setDimH] = useState(1.55);
  const [autoHeading, setAutoHeading] = useState(true);
  const [heading, setHeading] = useState(0);
  const [show3d, setShow3d] = useState(false);
  const [showRoiMask, setShowRoiMask] = useState(false);
  const [svgAlpha, setSvgAlpha] = useState(50);
  const [status, setStatus] = useState("Ready");

  const [box, setBox] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawCurrent, setDrawCurrent] = useState(null);

  const [refPoint, setRefPoint] = useState(null);
  const [projPoint, setProjPoint] = useState(null);
  const [gcPoint, setGcPoint] = useState(null);
  const [floorCorners, setFloorCorners] = useState(null);
  const [highlightSeg, setHighlightSeg] = useState(null);
  const [svgSegments, setSvgSegments] = useState([]);

  const H = useMemo(
    () => safeMatrix3(draft?.homography?.H),
    [draft?.homography?.H],
  );
  const Hinv = useMemo(() => (H ? invert3x3(H) : null), [H]);

  const pxPerM = Math.max(0.001, toNum(draft?.parallax?.px_per_meter, 10));
  const zCam = toNum(draft?.parallax?.z_cam_meters, 10);
  const camSat = useMemo(
    () => ({
      x: toNum(draft?.parallax?.x_cam_coords_sat, 0),
      y: toNum(draft?.parallax?.y_cam_coords_sat, 0),
    }),
    [draft?.parallax?.x_cam_coords_sat, draft?.parallax?.y_cam_coords_sat],
  );

  const refMethod = draft?.ref_method || "center_box";
  const projMethod = draft?.proj_method || "down_h_2";
  const roiMethod = draft?.roi_method || "partial";

  const toNatural = useCallback((evt, imgEl) => {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return null;
    const r = imgEl.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const x = evt.clientX - r.left;
    const y = evt.clientY - r.top;
    const clampedX = Math.max(0, Math.min(r.width, x));
    const clampedY = Math.max(0, Math.min(r.height, y));
    return {
      x: (clampedX * imgEl.naturalWidth) / r.width,
      y: (clampedY * imgEl.naturalHeight) / r.height,
    };
  }, []);

  const toDisplay = useCallback((pt, imgEl) => {
    if (!pt || !imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight)
      return null;
    return {
      x: (pt.x * imgEl.clientWidth) / imgEl.naturalWidth,
      y: (pt.y * imgEl.clientHeight) / imgEl.naturalHeight,
    };
  }, []);

  const buildFloor = useCallback(
    (center, headingDeg) => {
      if (!center) return null;
      const wPx = dimW * pxPerM;
      const lPx = dimL * pxPerM;
      const dx = lPx / 2;
      const dy = wPx / 2;
      const corners = [
        { x: -dx, y: -dy },
        { x: dx, y: -dy },
        { x: dx, y: dy },
        { x: -dx, y: dy },
      ];
      const rad = (headingDeg * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      return corners.map((p) => ({
        x: p.x * c - p.y * s + center.x,
        y: p.x * s + p.y * c + center.y,
      }));
    },
    [dimL, dimW, pxPerM],
  );

  const satToCctv = useCallback(
    (pt) => {
      if (!Hinv || !pt) return null;
      return applyHomography(Hinv, pt.x, pt.y);
    },
    [Hinv],
  );

  const recalcPoints = useCallback(() => {
    if (!box) {
      setStatus("Draw a box first.");
      return;
    }
    if (!H) {
      setStatus("Homography matrix missing in G-projection.");
      return;
    }

    const cx = (box.x1 + box.x2) / 2;
    const cy =
      refMethod === "center_bottom_side" ? box.y2 : (box.y1 + box.y2) / 2;
    const ref = { x: cx, y: cy };
    setRefPoint(ref);

    let satPt = applyHomography(H, ref.x, ref.y);
    if (!satPt) {
      setStatus("Projection failed. Check homography matrix.");
      return;
    }

    if (projMethod !== "match") {
      const effH = projMethod === "down_h" ? dimH : dimH / 2;
      if (Math.abs(zCam) > 1e-6) {
        const factor = (zCam - effH) / zCam;
        satPt = {
          x: camSat.x + (satPt.x - camSat.x) * factor,
          y: camSat.y + (satPt.y - camSat.y) * factor,
        };
      }
    }

    setProjPoint(satPt);
    setGcPoint(satToCctv(satPt));

    let headingUsed = heading;
    let nearest = null;
    if (autoHeading && draft?.use_svg && svgSegments.length > 0) {
      nearest = nearestHeading(svgSegments, satPt);
      if (nearest) {
        headingUsed = nearest.heading;
        setHeading(nearest.heading);
      }
    }
    setHighlightSeg(nearest ? { p1: nearest.p1, p2: nearest.p2 } : null);

    const floor = buildFloor(satPt, headingUsed);
    setFloorCorners(floor);
    setStatus(
      `Box ${Math.round(box.width)}x${Math.round(box.height)} | Ref (${Math.round(ref.x)}, ${Math.round(ref.y)})`,
    );
  }, [
    H,
    autoHeading,
    box,
    buildFloor,
    camSat.x,
    camSat.y,
    dimH,
    draft?.use_svg,
    heading,
    projMethod,
    refMethod,
    satToCctv,
    svgSegments,
    zCam,
  ]);

  const redraw = useCallback(() => {
    const cImg = cctvImgRef.current;
    const cCan = cctvCanvasRef.current;
    if (cImg && cCan && cImg.clientWidth > 0 && cImg.clientHeight > 0) {
      cCan.width = cImg.clientWidth;
      cCan.height = cImg.clientHeight;
      const ctx = cCan.getContext("2d");
      ctx.clearRect(0, 0, cCan.width, cCan.height);

      if (showRoiMask && roiOverlayRef.current?.overlay) {
        ctx.drawImage(
          roiOverlayRef.current.overlay,
          0,
          0,
          cCan.width,
          cCan.height,
        );
      }

      const boxToDraw =
        isDrawing && drawStart && drawCurrent
          ? normalizeBox(drawStart, drawCurrent)
          : box;
      if (boxToDraw) {
        const p1 = toDisplay({ x: boxToDraw.x1, y: boxToDraw.y1 }, cImg);
        const p2 = toDisplay({ x: boxToDraw.x2, y: boxToDraw.y2 }, cImg);
        if (p1 && p2) {
          ctx.strokeStyle = "#ffdf3a";
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        }
      }

      const refD = toDisplay(refPoint, cImg);
      if (refD) drawMarker(ctx, refD.x, refD.y, "Ref", "#ff5252");

      if (projMethod !== "match") {
        const gcD = toDisplay(gcPoint, cImg);
        if (gcD) drawMarker(ctx, gcD.x, gcD.y, "GC", "#4ade80");
      }

      if (show3d && floorCorners && Hinv) {
        const floorCctv = floorCorners.map((p) => satToCctv(p)).filter(Boolean);
        const ceilCctv = floorCorners
          .map((p) => {
            const vecX = p.x - camSat.x;
            const vecY = p.y - camSat.y;
            const denom = zCam - dimH;
            const factor = Math.abs(denom) > 1e-6 ? zCam / denom : 100;
            const app = {
              x: camSat.x + vecX * factor,
              y: camSat.y + vecY * factor,
            };
            return satToCctv(app);
          })
          .filter(Boolean);

        if (floorCctv.length === 4 && ceilCctv.length === 4) {
          const drawPoly = (pts, color, width) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            const first = toDisplay(pts[0], cImg);
            if (!first) return;
            ctx.moveTo(first.x, first.y);
            for (let i = 1; i < pts.length; i += 1) {
              const p = toDisplay(pts[i], cImg);
              if (p) ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.stroke();
          };

          drawPoly(floorCctv, "#22c55e", 2);
          drawPoly(ceilCctv, "#ef4444", 2);
          ctx.strokeStyle = "#fde047";
          ctx.lineWidth = 1;
          for (let i = 0; i < 4; i += 1) {
            const p1 = toDisplay(floorCctv[i], cImg);
            const p2 = toDisplay(ceilCctv[i], cImg);
            if (!p1 || !p2) continue;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }
    }

    const sImg = satImgRef.current;
    const sCan = satCanvasRef.current;
    if (sImg && sCan && sImg.clientWidth > 0 && sImg.clientHeight > 0) {
      sCan.width = sImg.clientWidth;
      sCan.height = sImg.clientHeight;
      const ctx = sCan.getContext("2d");
      ctx.clearRect(0, 0, sCan.width, sCan.height);

      if (highlightSeg) {
        const p1 = toDisplay(highlightSeg.p1, sImg);
        const p2 = toDisplay(highlightSeg.p2, sImg);
        if (p1 && p2) {
          ctx.strokeStyle = "#ff00c8";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      if (floorCorners && floorCorners.length === 4) {
        const pts = floorCorners.map((p) => toDisplay(p, sImg)).filter(Boolean);
        if (pts.length === 4) {
          ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i += 1)
            ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      const projD = toDisplay(projPoint, sImg);
      if (projD) drawMarker(ctx, projD.x, projD.y, "PROJ", "#22d3ee");
    }
  }, [
    Hinv,
    box,
    camSat.x,
    camSat.y,
    dimH,
    drawCurrent,
    drawStart,
    floorCorners,
    gcPoint,
    highlightSeg,
    isDrawing,
    projMethod,
    projPoint,
    refPoint,
    satToCctv,
    show3d,
    showRoiMask,
    toDisplay,
    zCam,
  ]);

  useEffect(() => {
    setBox(null);
    setRefPoint(null);
    setProjPoint(null);
    setGcPoint(null);
    setFloorCorners(null);
    setHighlightSeg(null);
    setStatus("Ready");
  }, [locDetail?.code]);

  useEffect(() => {
    setSvgSegments([]);
    if (!draft?.use_svg || !locDetail?.layout_url) return;
    let cancelled = false;
    fetch(locDetail.layout_url)
      .then((r) => r.text())
      .then((svgText) => {
        if (cancelled) return;
        setSvgSegments(parseSvgSegments(svgText, draft?.layout_svg?.A));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [draft?.layout_svg?.A, draft?.use_svg, locDetail?.layout_url]);

  useEffect(() => {
    roiOverlayRef.current = null;
    if (!locDetail?.roi_url) return;
    const img = new Image();
    img.onload = () => {
      const src = document.createElement("canvas");
      src.width = img.naturalWidth;
      src.height = img.naturalHeight;
      const sctx = src.getContext("2d");
      sctx.drawImage(img, 0, 0);
      const imageData = sctx.getImageData(0, 0, src.width, src.height);

      const tint = document.createElement("canvas");
      tint.width = src.width;
      tint.height = src.height;
      const tctx = tint.getContext("2d");
      const out = tctx.createImageData(src.width, src.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const a = imageData.data[i + 3];
        const invalid = a >= 10 && r < 10 && g < 10 && b < 10;
        out.data[i] = 255;
        out.data[i + 1] = 0;
        out.data[i + 2] = 0;
        out.data[i + 3] = invalid ? 80 : 0;
      }
      tctx.putImageData(out, 0, 0);
      roiOverlayRef.current = {
        overlay: tint,
        mask: imageData,
        width: src.width,
        height: src.height,
      };
      redraw();
    };
    img.src = locDetail.roi_url;
  }, [locDetail?.roi_url, redraw]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw]);

  useEffect(() => {
    if (!box) return;
    recalcPoints();
  }, [recalcPoints, box, refMethod, projMethod, dimH, dimL, dimW, autoHeading]);

  function validateRoi(rect) {
    if (!draft?.use_roi || !roiOverlayRef.current?.mask) return true;
    const m = roiOverlayRef.current;
    const corners = [
      { x: rect.x1, y: rect.y1 },
      { x: rect.x2, y: rect.y1 },
      { x: rect.x1, y: rect.y2 },
      { x: rect.x2, y: rect.y2 },
    ];

    let validCount = 0;
    for (const c of corners) {
      const x = Math.max(0, Math.min(m.width - 1, Math.round(c.x)));
      const y = Math.max(0, Math.min(m.height - 1, Math.round(c.y)));
      const idx = (y * m.width + x) * 4;
      const r = m.mask.data[idx];
      const g = m.mask.data[idx + 1];
      const b = m.mask.data[idx + 2];
      const a = m.mask.data[idx + 3];
      const isValid = a < 10 || !(r < 10 && g < 10 && b < 10);
      if (isValid) validCount += 1;
    }
    return roiMethod === "in" ? validCount === 4 : validCount >= 1;
  }

  function handleCctvDown(evt) {
    if (evt.button !== 2) return;
    evt.preventDefault();
    const pt = toNatural(evt, cctvImgRef.current);
    if (!pt) return;
    setIsDrawing(true);
    setDrawStart(pt);
    setDrawCurrent(pt);
  }

  function handleCctvMove(evt) {
    if (!isDrawing) return;
    const pt = toNatural(evt, cctvImgRef.current);
    if (!pt) return;
    setDrawCurrent(pt);
  }

  function handleCctvUp(evt) {
    if (!isDrawing) return;
    evt.preventDefault();
    const pt = toNatural(evt, cctvImgRef.current) || drawCurrent || drawStart;
    const start = drawStart;
    setIsDrawing(false);
    setDrawCurrent(null);
    setDrawStart(null);
    if (!pt || !start) return;

    const rect = normalizeBox(start, pt);
    if (rect.width < 4 || rect.height < 4) {
      setStatus("Draw a larger box.");
      return;
    }

    if (!validateRoi(rect)) {
      setStatus(`Box rejected by ROI (${roiMethod})`);
      return;
    }

    setBox(rect);
    setStatus(
      `Box drawn: ${Math.round(rect.width)} x ${Math.round(rect.height)}`,
    );
  }

  function handleHeadingChange(v) {
    const next = toNum(v, 0);
    setHeading(next);
    if (!autoHeading && projPoint) {
      setFloorCorners(buildFloor(projPoint, next));
      setHighlightSeg(null);
    }
  }

  if (!locDetail?.cctv_url || !locDetail?.sat_url) {
    return (
      <StagePlaceholder
        title="Final Validation"
        note="This location is missing CCTV/SAT images required for final validation."
      />
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 }}>
      <div
        className="card"
        style={{ display: "grid", gap: 10, alignContent: "start" }}
      >
        <div className="card-title">Final Validation</div>

        <div style={{ fontSize: 12, fontWeight: 700 }}>1. Draw Box</div>
        <div style={{ fontSize: 12, color: "rgba(200,216,240,0.65)" }}>
          Right-click drag on CCTV.
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setBox(null);
            setRefPoint(null);
            setProjPoint(null);
            setGcPoint(null);
            setFloorCorners(null);
            setHighlightSeg(null);
          }}
        >
          Reset Box
        </button>

        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>
          2. Dimensions (m)
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 6,
          }}
        >
          <input
            className="form-control"
            type="number"
            step="0.1"
            value={dimW}
            onChange={(e) => setDimW(toNum(e.target.value, 1.8))}
            title="Width"
          />
          <input
            className="form-control"
            type="number"
            step="0.1"
            value={dimL}
            onChange={(e) => setDimL(toNum(e.target.value, 3.5))}
            title="Length"
          />
          <input
            className="form-control"
            type="number"
            step="0.1"
            value={dimH}
            onChange={(e) => setDimH(toNum(e.target.value, 1.55))}
            title="Height"
          />
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>
          3. Projection
        </div>
        <label className="form-label" style={{ marginBottom: 2 }}>
          Ref Method
        </label>
        <select
          className="form-control"
          value={refMethod}
          onChange={(e) =>
            setDraft((prev) => ({
              ...(prev || {}),
              ref_method: e.target.value,
            }))
          }
        >
          <option value="center_box">center_box</option>
          <option value="center_bottom_side">center_bottom_side</option>
        </select>
        <label className="form-label" style={{ marginBottom: 2 }}>
          Proj Method
        </label>
        <select
          className="form-control"
          value={projMethod}
          onChange={(e) =>
            setDraft((prev) => ({
              ...(prev || {}),
              proj_method: e.target.value,
            }))
          }
        >
          <option value="down_h_2">down_h_2</option>
          <option value="down_h">down_h</option>
          <option value="match">match</option>
        </select>
        <button className="btn btn-primary btn-sm" onClick={recalcPoints}>
          Calculate Points
        </button>

        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>
          4. Heading / Floor
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
          }}
        >
          <input
            type="checkbox"
            checked={autoHeading}
            disabled={!draft?.use_svg}
            onChange={(e) => setAutoHeading(e.target.checked)}
          />
          Auto Heading (SVG)
        </label>
        <label className="form-label" style={{ marginBottom: 2 }}>
          Angle: {Math.round(heading)}
        </label>
        <input
          type="range"
          min={0}
          max={360}
          value={heading}
          disabled={autoHeading}
          onChange={(e) => handleHeadingChange(e.target.value)}
          style={{ width: "100%" }}
        />

        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>
          5. 3D Reconstruction
        </div>
        <button
          className="btn btn-success btn-sm"
          onClick={() => setShow3d((v) => !v)}
        >
          {show3d ? "Hide 3D Box" : "Toggle 3D Box"}
        </button>

        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>
          Options
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
          }}
        >
          <input
            type="checkbox"
            checked={showRoiMask}
            disabled={!draft?.use_roi || !locDetail?.roi_url}
            onChange={(e) => setShowRoiMask(e.target.checked)}
          />
          Show ROI Mask
        </label>
        <label className="form-label" style={{ marginBottom: 2 }}>
          SVG Alpha: {svgAlpha}
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={svgAlpha}
          disabled={!draft?.use_svg || !locDetail?.layout_url}
          onChange={(e) => setSvgAlpha(toNum(e.target.value, 50))}
          style={{ width: "100%" }}
        />

        <div
          className="text-mono"
          style={{ fontSize: 11, color: "rgba(200,216,240,0.6)" }}
        >
          {status}
        </div>

        <button className="btn btn-success" onClick={onProceed}>
          Proceed to Save
        </button>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1.8fr 1.1fr", gap: 10 }}
      >
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            CCTV (Right-Click Drag)
          </div>
          <div
            ref={cctvWrapRef}
            style={{ position: "relative", background: "#0a0c10" }}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={handleCctvDown}
            onMouseMove={handleCctvMove}
            onMouseUp={handleCctvUp}
            onMouseLeave={handleCctvUp}
          >
            <img
              ref={cctvImgRef}
              src={locDetail.cctv_url}
              alt="CCTV"
              draggable={false}
              onLoad={redraw}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
            <canvas
              ref={cctvCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Satellite / SVG
          </div>
          <div style={{ position: "relative", background: "#0a0c10" }}>
            <img
              ref={satImgRef}
              src={locDetail.sat_url}
              alt="SAT"
              draggable={false}
              onLoad={redraw}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
            {draft?.use_svg && locDetail?.layout_url && (
              <img
                src={locDetail.layout_url}
                alt="Layout SVG"
                draggable={false}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: svgAlpha / 100,
                  pointerEvents: "none",
                }}
              />
            )}
            <canvas
              ref={satCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Calibration() {
  const [locations, setLocations] = useState([]);
  const [selected, setSelected] = useState("");
  const [locDetail, setLocDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const [gFile, setGFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);

  const [draft, setDraft] = useState(null);
  const [constructSvg, setConstructSvg] = useState(false);
  const [constructRoi, setConstructRoi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [inspectOpen, setInspectOpen] = useState(false);

  const activeStep = STEPS[stepIndex];
  const progressPct = (stepIndex / (STEPS.length - 1)) * 100;

  const disabledSteps = useMemo(() => {
    return {
      SVG: !draft?.use_svg,
      ROI: !draft?.use_roi,
    };
  }, [draft]);

  function loadLocations() {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((locs) => {
        setLocations(locs);
        if (!selected && locs.length > 0) setSelected(locs[0].code);
      })
      .catch(() => {});
  }

  function loadLocation(code) {
    if (!code) {
      setLocDetail(null);
      setDraft(null);
      return;
    }
    setLoading(true);
    fetch(`/api/locations/${code}`)
      .then((r) => r.json())
      .then((d) => {
        setLocDetail(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadLocations();
  }, []);
  useEffect(() => {
    if (selected) loadLocation(selected);
  }, [selected]);

  useEffect(() => {
    if (locDetail?.g_projection) {
      setDraft(cloneJson(locDetail.g_projection));
      setConstructSvg(!!locDetail.g_projection.use_svg);
      setConstructRoi(!!locDetail.g_projection.use_roi);
    } else {
      setDraft(null);
    }
  }, [locDetail]);

  async function handleUpload() {
    if (!selected || !gFile) return;
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append("file", gFile);
    try {
      const r = await fetch(`/api/locations/${selected}/g_projection`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (r.ok) {
        setUploadMsg({
          type: "success",
          text: "G-projection uploaded successfully.",
        });
        setGFile(null);
        loadLocation(selected);
      } else {
        setUploadMsg({ type: "error", text: d.detail || "Upload failed" });
      }
    } catch (err) {
      setUploadMsg({ type: "error", text: String(err) });
    } finally {
      setUploading(false);
    }
  }

  function handleConstruct() {
    if (!selected) return;
    setDraft(defaultProjection(selected, constructSvg, constructRoi));
    setStepIndex(1);
    setSaveMsg(null);
  }

  function handleValidate() {
    if (!locDetail?.g_projection) {
      setSaveMsg({
        type: "error",
        text: "No existing G-projection found to validate.",
      });
      return;
    }
    setDraft(cloneJson(locDetail.g_projection));
    setStepIndex(12);
    setSaveMsg(null);
  }

  function handleReconstruct() {
    if (!selected) return;
    const base =
      cloneJson(locDetail?.g_projection) ||
      defaultProjection(selected, constructSvg, constructRoi);
    base.use_svg = !!constructSvg;
    base.use_roi = !!constructRoi;
    setDraft(base);
    setStepIndex(1);
    setSaveMsg(null);
  }

  function handleProceed() {
    setStepIndex((i) => {
      let next = i + 1;
      while (next < STEPS.length && disabledSteps[STEPS[next].short]) {
        next += 1;
      }
      return Math.min(STEPS.length - 1, next);
    });
  }

  async function handleSaveDraft() {
    if (!selected || !draft) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch(`/api/locations/${selected}/g_projection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: draft }),
      });
      const d = await r.json();
      if (r.ok) {
        setSaveMsg({
          type: "success",
          text: "Saved G_projection successfully.",
        });
        loadLocation(selected);
      } else {
        setSaveMsg({ type: "error", text: d.detail || "Save failed" });
      }
    } catch (err) {
      setSaveMsg({ type: "error", text: String(err) });
    } finally {
      setSaving(false);
    }
  }

  function renderStageBody() {
    if (!selected) {
      return (
        <StagePlaceholder
          title="No Location Selected"
          note="Select a location to begin calibration."
        />
      );
    }

    if (activeStep.short === "Pick") {
      return (
        <PickStage
          selected={selected}
          locDetail={locDetail}
          draft={draft}
          constructSvg={constructSvg}
          setConstructSvg={setConstructSvg}
          constructRoi={constructRoi}
          setConstructRoi={setConstructRoi}
          onConstruct={handleConstruct}
          onValidate={handleValidate}
          onReconstruct={handleReconstruct}
          onProceed={handleProceed}
          gFile={gFile}
          setGFile={setGFile}
          uploadMsg={uploadMsg}
          uploading={uploading}
          onUpload={handleUpload}
        />
      );
    }

    if (activeStep.short === "Lens") {
      return (
        <LensStage
          locDetail={locDetail}
          draft={draft}
          setDraft={setDraft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "Undis") {
      return (
        <UndistortStage
          locDetail={locDetail}
          draft={draft}
          setDraft={setDraft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "Val1") {
      return (
        <Validation1Stage
          locDetail={locDetail}
          draft={draft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "HomA") {
      return (
        <HomographyAnchorsStage
          locDetail={locDetail}
          draft={draft}
          setDraft={setDraft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "HomF") {
      return (
        <HomographyFovStage
          locDetail={locDetail}
          draft={draft}
          setDraft={setDraft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "Val2") {
      return (
        <Validation2Stage
          locDetail={locDetail}
          draft={draft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "ParS") {
      return (
        <ParallaxSubjectsStage
          locDetail={locDetail}
          draft={draft}
          setDraft={setDraft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "Dist") {
      return (
        <DistanceReferenceStage
          locDetail={locDetail}
          draft={draft}
          setDraft={setDraft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "Val3") {
      return (
        <Validation3Stage
          locDetail={locDetail}
          draft={draft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "SVG") {
      return (
        <SvgAlignmentStage
          locDetail={locDetail}
          draft={draft}
          setDraft={setDraft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "ROI") {
      return (
        <RoiStage
          locDetail={locDetail}
          draft={draft}
          setDraft={setDraft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "Final") {
      return (
        <FinalValidationStage
          locDetail={locDetail}
          draft={draft}
          setDraft={setDraft}
          onProceed={handleProceed}
        />
      );
    }

    if (activeStep.short === "Save") {
      return (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div className="card-title">Save G_projection</div>
          <textarea
            className="form-control"
            style={{
              minHeight: 360,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
            value={draft ? JSON.stringify(draft, null, 2) : ""}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                setDraft(parsed);
                setSaveMsg(null);
              } catch {
                setSaveMsg({ type: "error", text: "Invalid JSON in editor." });
              }
            }}
          />
          {saveMsg && (
            <div
              className={`alert alert-${saveMsg.type === "success" ? "success" : "error"}`}
            >
              {saveMsg.text}
            </div>
          )}
          <button
            className="btn btn-success"
            disabled={!draft || saving}
            onClick={handleSaveDraft}
          >
            {saving ? (
              <span className="spinner" style={{ width: 14, height: 14 }} />
            ) : (
              "Save G_projection.json"
            )}
          </button>
        </div>
      );
    }

    return (
      <StagePlaceholder
        title={activeStep.full}
        note="This stage is represented in web for workflow parity. Use Proceed to continue, or Inspect/Save for JSON-level adjustments."
      />
    );
  }

  return (
    <>
      {inspectOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(5,10,18,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="card"
            style={{
              width: "min(900px, 95vw)",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div className="card-title" style={{ marginBottom: 0 }}>
                Inspect Config
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setInspectOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="json-viewer" style={{ maxHeight: "75vh" }}>
              {JSON.stringify(draft || {}, null, 2)}
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div className="page-title">CALIBRATION</div>
        <div className="page-subtitle">STEP-BY-STEP G-PROJECTION WORKFLOW</div>
      </div>

      <div className="page-body fade-in" style={{ display: "grid", gap: 16 }}>
        <div className="card">
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "end",
              flexWrap: "wrap",
            }}
          >
            <div
              className="form-group"
              style={{ marginBottom: 0, minWidth: 220 }}
            >
              <label className="form-label">Location</label>
              <select
                className="form-control"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {locations.length === 0 && (
                  <option value="">No locations</option>
                )}
                {locations.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-ghost" onClick={loadLocations}>
              Refresh
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setInspectOpen(true)}
              disabled={!draft}
            >
              Inspect
            </button>
            <button
              className="btn btn-success"
              onClick={handleSaveDraft}
              disabled={!draft || saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {locDetail?.g_projection ? (
              <span className="badge badge-success">G-projection loaded</span>
            ) : (
              <span className="badge badge-error">No G-projection</span>
            )}
            {draft?.use_svg && (
              <span className="badge badge-info">SVG enabled</span>
            )}
            {draft?.use_roi && (
              <span className="badge badge-info">ROI enabled</span>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: "14px 16px" }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "nowrap",
              overflowX: "auto",
              paddingBottom: 6,
            }}
          >
            {STEPS.map((s, idx) => {
              const isDisabled = !!disabledSteps[s.short];
              const isActive = idx === stepIndex;
              const completed = idx <= stepIndex;
              return (
                <button
                  key={s.short}
                  className="btn btn-sm"
                  title={s.full}
                  disabled={isDisabled}
                  onClick={() => setStepIndex(idx)}
                  style={{
                    minWidth: 72,
                    background: isActive
                      ? "rgba(0,212,255,0.22)"
                      : completed
                        ? "rgba(200,238,255,0.12)"
                        : "transparent",
                    borderColor: isActive
                      ? "var(--border-bright)"
                      : "var(--border)",
                    color: isDisabled
                      ? "rgba(200,216,240,0.3)"
                      : isActive
                        ? "var(--cyan)"
                        : "#d9e9ff",
                    fontWeight: isActive ? 700 : 500,
                  }}
                >
                  {s.short}
                </button>
              );
            })}
          </div>
          <div
            style={{
              height: 6,
              background: "#000",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background: "#2a84ff",
              }}
            />
          </div>
        </div>

        {loading ? (
          <div
            style={{ display: "flex", justifyContent: "center", padding: 40 }}
          >
            <div className="spinner" />
          </div>
        ) : (
          renderStageBody()
        )}
      </div>
    </>
  );
}
