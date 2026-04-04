"""
OpenCV-based renderers for headless / Gradio use.

These mirror the functionality of the QPainter-based CCTRenderer and
SatRenderer but output plain numpy BGR arrays instead of QPixmap objects.
"""

import hashlib
import functools
import math

import cv2
import numpy as np


# ---------------------------------------------------------------
# Colour helpers  (same deterministic hash as cctv_renderer.py)
# ---------------------------------------------------------------

@functools.lru_cache(maxsize=512)
def color_from_string(s: str):
    """Return a BGR tuple derived from a stable MD5 hash of *s*."""
    hex_hash = hashlib.md5(s.encode()).hexdigest()
    r = int(hex_hash[0:2], 16)
    g = int(hex_hash[2:4], 16)
    b = int(hex_hash[4:6], 16)
    return (b, g, r)          # OpenCV uses BGR


def _put_label(img, text, org, color, font_scale=0.5, thickness=1):
    """Draw a text label with a filled background rectangle."""
    font = cv2.FONT_HERSHEY_SIMPLEX
    (tw, th), baseline = cv2.getTextSize(text, font, font_scale, thickness)
    x, y = int(org[0]), int(org[1])
    cv2.rectangle(img, (x, y - th - baseline - 2), (x + tw + 4, y + 2), color, -1)
    cv2.putText(img, text, (x + 2, y - 2), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)


# ---------------------------------------------------------------
# CCTV Renderer (OpenCV)
# ---------------------------------------------------------------

class CVCCTVRenderer:
    """Draw detection / tracking overlays onto a CCTV video frame (BGR numpy)."""

    def render(self, frame, objects, *,
               show_tracking=True,
               show_3d=True,
               box_thickness=2,
               face_opacity=50,
               show_label=True,
               metrics=None,
               congestion=None):
        """
        Parameters
        ----------
        frame : np.ndarray  (H, W, 3) BGR
        objects : list[dict]
        Returns np.ndarray (H, W, 3) BGR with overlays.
        """
        out = frame.copy()

        for obj in objects:
            cls = obj.get("class", "?")
            tid = obj.get("tracked_id")
            seed = f"{cls}_{tid}" if (show_tracking and tid is not None) else cls
            col = color_from_string(seed)
            lbl = f"{tid} {cls}" if tid is not None else cls

            bbox_3d = obj.get("bbox_3d")
            have_heading = obj.get("have_heading", False)
            have_measurements = obj.get("have_measurements", False)

            can_draw_3d = (
                show_3d and have_heading and have_measurements
                and bbox_3d and len(bbox_3d) == 8
            )

            if can_draw_3d:
                try:
                    pts = np.array(bbox_3d, dtype=np.float64)
                    faces = [
                        [0, 1, 2, 3], [4, 5, 6, 7],
                        [0, 1, 5, 4], [1, 2, 6, 5],
                        [2, 3, 7, 6], [3, 0, 4, 7],
                    ]
                    # Semi-transparent face fill via overlay blending
                    overlay = out.copy()
                    alpha = face_opacity / 255.0
                    for face_idx in faces:
                        face_pts = pts[face_idx].astype(np.int32)
                        cv2.fillPoly(overlay, [face_pts], col)
                    cv2.addWeighted(overlay, alpha, out, 1 - alpha, 0, out)
                    # Edges (solid)
                    for face_idx in faces:
                        face_pts = pts[face_idx].astype(np.int32)
                        cv2.polylines(out, [face_pts], isClosed=True, color=col, thickness=box_thickness, lineType=cv2.LINE_AA)
                except Exception:
                    pass

            elif not show_3d:
                bbox = obj.get("bbox_2d")
                if bbox:
                    x1, y1, x2, y2 = map(int, bbox)
                    cv2.rectangle(out, (x1, y1), (x2, y2), col, box_thickness, cv2.LINE_AA)

                    if (not have_heading) and have_measurements:
                        ref_pt = obj.get("reference_point")
                        if ref_pt:
                            cv2.circle(out, (int(ref_pt[0]), int(ref_pt[1])), 4, col, -1, cv2.LINE_AA)

                    if show_label:
                        _put_label(out, lbl, (x1, y1), col)

        if isinstance(metrics, dict):
            vehicle_count = int(metrics.get("vehicle_count", len(objects)))
            avg_speed = float(metrics.get("avg_speed", 0.0))
            level = str(congestion or "LOW").upper()

            cong_color = (0, 255, 0)
            if level == "HIGH":
                cong_color = (0, 0, 255)
            elif level == "MEDIUM":
                cong_color = (0, 165, 255)

            cv2.rectangle(out, (6, 6), (320, 102), (0, 0, 0), -1)
            cv2.putText(out, f"Vehicles: {vehicle_count}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)
            cv2.putText(out, f"Avg Speed: {avg_speed:.2f}", (10, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)
            cv2.putText(out, f"Congestion: {level}", (10, 90),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, cong_color, 2, cv2.LINE_AA)

        return out


# ---------------------------------------------------------------
# Satellite Renderer (OpenCV)
# ---------------------------------------------------------------

class CVSatRenderer:
    """Draw per-frame vehicle overlays onto a satellite background image."""

    def render(self, sat_img, objects, *,
               show_tracking=True,
               sat_box_thick=2,
               show_sat_box=True,
               show_sat_arrow=False,
               show_sat_coords_dot=False,
               show_3d=True,
               show_sat_label=False,
               sat_label_size=12,
               text_color_mode="White",
               speed_display_cache=None,
               speed_update_delay_frames=30,
               current_frame_idx=0):
        """
        Parameters
        ----------
        sat_img : np.ndarray  (H, W, 3) BGR — the satellite background.
        objects : list[dict]   — per-frame object list from replay JSON.

        Returns np.ndarray (H, W, 3) BGR with overlays painted on.
        """
        if speed_display_cache is None:
            speed_display_cache = {}

        out = sat_img.copy()

        for obj in objects:
            cls = obj.get("class", "?")
            tid = obj.get("tracked_id")
            seed = f"{cls}_{tid}" if (show_tracking and tid is not None) else cls
            col = color_from_string(seed)

            have_heading = obj.get("have_heading", False)
            have_measurements = obj.get("have_measurements", False)
            coord = obj.get("sat_coords") or obj.get("sat_coord")
            pts = obj.get("sat_floor_box")

            # --- 1. Floor Box ---
            if show_sat_box and have_heading and have_measurements and pts and len(pts) >= 3:
                poly = np.array(pts, dtype=np.int32)
                # Semi-transparent fill
                overlay = out.copy()
                col_fill = (col[0], col[1], col[2])
                cv2.fillPoly(overlay, [poly], col_fill)
                cv2.addWeighted(overlay, 0.4, out, 0.6, 0, out)
                cv2.polylines(out, [poly], isClosed=True, color=col, thickness=sat_box_thick, lineType=cv2.LINE_AA)

            # --- 2. Heading Arrow ---
            default_heading = obj.get("default_heading", False)
            if (show_sat_arrow and have_heading and (not default_heading)
                    and coord and pts and len(pts) >= 3):
                heading = obj.get("heading")
                if heading is not None:
                    rad = math.radians(heading)
                    x1, y1 = int(coord[0]), int(coord[1])
                    x2 = int(x1 + 40 * math.cos(rad))
                    y2 = int(y1 + 40 * math.sin(rad))
                    cv2.arrowedLine(out, (x1, y1), (x2, y2), (0, 255, 255), 2, cv2.LINE_AA, tipLength=0.3)

            # --- 3a. Coordinate Dot ---
            _has_floor = pts and len(pts) >= 3
            _no_3d = not show_3d
            if show_sat_coords_dot and coord and (_has_floor or _no_3d):
                radius = 4
                if pts and len(pts) >= 3:
                    xs = [p[0] for p in pts]
                    ys = [p[1] for p in pts]
                    avg_dim = ((max(xs) - min(xs)) + (max(ys) - min(ys))) / 2.0
                    radius = max(3, int(avg_dim * 0.15))
                cv2.circle(out, (int(coord[0]), int(coord[1])), radius, col, -1, cv2.LINE_AA)
                cv2.circle(out, (int(coord[0]), int(coord[1])), radius, (0, 0, 0), 1, cv2.LINE_AA)

            # --- 3b. Fallback Dot ---
            elif (not have_heading) and have_measurements and (not show_3d) and coord:
                cv2.circle(out, (int(coord[0]), int(coord[1])), 3, col, -1, cv2.LINE_AA)

            # --- 4. Speed Label ---
            if show_sat_label and coord and (_has_floor or _no_3d):
                raw_s = obj.get("speed_kmh", 0)
                disp_s = raw_s
                if tid is not None:
                    cache = speed_display_cache.get(tid, {"val": raw_s, "last_frame": -999})
                    if ((current_frame_idx - cache["last_frame"]) >= speed_update_delay_frames
                            or current_frame_idx < cache["last_frame"]):
                        cache["val"] = raw_s
                        cache["last_frame"] = current_frame_idx
                    speed_display_cache[tid] = cache
                    disp_s = cache["val"]

                label_str = f"{cls} {disp_s:.1f}km/h"
                font_scale = sat_label_size / 20.0

                if text_color_mode == "Black":
                    tc = (0, 0, 0)
                elif text_color_mode == "Yellow":
                    tc = (143, 255, 255)
                else:
                    tc = (255, 255, 255)

                cv2.putText(out, label_str, (int(coord[0]), int(coord[1])),
                            cv2.FONT_HERSHEY_SIMPLEX, font_scale, tc, 1, cv2.LINE_AA)

        return out
