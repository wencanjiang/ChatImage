#!/usr/bin/env python
import argparse
import atexit
import base64
import io
import json
import sys
import time

import numpy as np
from PIL import Image


class Sam3Worker:
    def __init__(self, checkpoint, device):
        self.checkpoint = checkpoint
        self.device = device
        self.loaded = False
        self.model = None
        self.processor = None
        self.autocast_context = None

    def close_autocast(self):
        # Properly leave the autocast context if preload() entered one.
        # Idempotent: safe to call multiple times.
        ctx = self.autocast_context
        if ctx is None:
            return
        self.autocast_context = None
        try:
            ctx.__exit__(None, None, None)
        except Exception:
            pass

    def health(self):
        cuda_available = False
        try:
            import torch

            cuda_available = bool(torch.cuda.is_available())
        except Exception:
            cuda_available = False
        return {
            "ok": cuda_available if self.device.startswith("cuda") else True,
            "provider": "sam3",
            "checkpoint": self.checkpoint,
            "device": self.device,
            "cudaAvailable": cuda_available,
            "loaded": self.loaded,
            "warnings": [],
        }

    def preload(self):
        if self.loaded:
            return {
                "ok": True,
                "provider": "sam3",
                "checkpoint": self.checkpoint,
                "device": self.device,
                "loaded": True,
                "loadSeconds": 0,
            }
        start = time.perf_counter()
        import torch
        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor

        if self.device.startswith("cuda"):
            if not torch.cuda.is_available():
                raise RuntimeError("CUDA is not available for SAM3")
            self.autocast_context = torch.autocast("cuda", dtype=torch.bfloat16)
            self.autocast_context.__enter__()
            atexit.register(self.close_autocast)
        self.model = build_sam3_image_model(
            checkpoint_path=self.checkpoint,
            load_from_HF=False,
            device=self.device,
            enable_inst_interactivity=True,
        )
        self.processor = Sam3Processor(self.model, confidence_threshold=0.0)
        self.loaded = True
        cuda_allocated_gb = None
        if self.device.startswith("cuda") and torch.cuda.is_available():
            cuda_allocated_gb = round(torch.cuda.memory_allocated() / 1024**3, 3)
        return {
            "ok": True,
            "provider": "sam3",
            "checkpoint": self.checkpoint,
            "device": self.device,
            "loaded": True,
            "loadSeconds": round(time.perf_counter() - start, 3),
            "cudaAllocatedGb": cuda_allocated_gb,
        }

    def segment(self, request):
        self.preload()
        # Use a context manager so the underlying file descriptor is released
        # even on Windows, where a held handle would block JS-side fs.rm of the
        # temp directory after the request completes.
        with Image.open(request["imagePath"]) as raw_image:
            image = raw_image.convert("RGB")
        width, height = image.size
        state = self.processor.set_image(image)
        modules = request.get("modules") or []
        output = []
        rejected = []
        for module in modules:
            module_id = str(module.get("moduleId") or "")
            bounds = module.get("bounds") or {}
            warnings = []
            try:
                component_bounds = normalize_component_bounds(module.get("components"), bounds)
                masks_out = []
                scores_out = []
                for component in component_bounds:
                    component_bound = component["bounds"]
                    box = normalized_bounds_to_xyxy(component_bound, width, height)
                    masks, scores, _ = self.model.predict_inst(
                        state,
                        point_coords=None,
                        point_labels=None,
                        box=np.array([box], dtype=np.float32),
                        multimask_output=False,
                    )
                    component_mask = to_numpy(masks)[0] > 0
                    if is_label_component(component):
                        component_mask = np.logical_or(component_mask, label_component_mask(component_bound, width, height))
                    masks_out.append(component_mask)
                    scores_out.append(float(to_numpy(scores).reshape(-1)[0]))
                mask = np.logical_or.reduce(masks_out) if len(masks_out) > 1 else masks_out[0]
                processed = postprocess_mask(mask, module)
                quality = None
                if isinstance(processed, tuple):
                    if len(processed) >= 3:
                        mask, postprocess_warnings, quality = processed[:3]
                    else:
                        mask, postprocess_warnings = processed
                    warnings.extend(postprocess_warnings)
                else:
                    mask = processed
                if quality is None:
                    quality = mask_quality(mask, module)
                score = float(sum(scores_out) / max(1, len(scores_out)))
                bbox = mask_to_normalized_bounds(mask, width, height)
                if not bbox:
                    rejected.append({"moduleId": module_id, "reason": "empty mask"})
                    continue
                organic_preview = mask_to_organic_preview(image, mask, module)
                if organic_preview.get("warning"):
                    warnings.append(organic_preview["warning"])
                output.append(
                    {
                        "moduleId": module_id,
                        "label": module.get("label") or "",
                        "inputBounds": normalize_bounds(bounds),
                        "maskBounds": bbox,
                        "maskImage": mask_to_data_url(mask, module),
                        "cutoutImage": mask_to_cutout_data_url(image, mask, module),
                        "organicImage": organic_preview["image"],
                        "organicBounds": organic_preview["bounds"],
                        "organicAspectRatio": organic_preview["aspectRatio"],
                        "polygon": mask_to_polygon(mask, width, height),
                        "score": max(0.0, min(1.0, score)),
                        "maskPixels": int(mask.sum()),
                        "componentCount": len(component_bounds),
                        "quality": quality,
                        "warnings": warnings,
                    }
                )
            except Exception as error:
                rejected.append({"moduleId": module_id, "reason": str(error)})
                if warnings:
                    rejected[-1]["warnings"] = warnings
        return {
            "ok": True,
            "provider": "sam3",
            "modules": output,
            "rejectedModules": rejected,
            "warnings": [warning for item in output for warning in item.get("warnings", [])],
        }


def normalized_bounds_to_xyxy(bounds, width, height):
    b = normalize_bounds(bounds)
    x0 = int(round(b["x"] * width))
    y0 = int(round(b["y"] * height))
    x1 = int(round((b["x"] + b["width"]) * width))
    y1 = int(round((b["y"] + b["height"]) * height))
    x0 = max(0, min(width - 1, x0))
    y0 = max(0, min(height - 1, y0))
    x1 = max(x0 + 1, min(width, x1))
    y1 = max(y0 + 1, min(height, y1))
    return [x0, y0, x1, y1]


def normalize_bounds(bounds):
    value = {
        "x": float(bounds.get("x", 0)),
        "y": float(bounds.get("y", 0)),
        "width": float(bounds.get("width", bounds.get("w", 0))),
        "height": float(bounds.get("height", bounds.get("h", 0))),
    }
    if (
        value["x"] < 0
        or value["y"] < 0
        or value["width"] <= 0
        or value["height"] <= 0
        or value["x"] + value["width"] > 1
        or value["y"] + value["height"] > 1
    ):
        raise ValueError("bounds outside normalized image area")
    return value


def normalize_component_bounds(components, fallback_bounds):
    values = []
    if isinstance(components, list):
        for item in components[:4]:
            if not isinstance(item, dict):
                continue
            bounds = item.get("bounds") or item.get("box")
            if not isinstance(bounds, dict):
                continue
            try:
                values.append(
                    {
                        "kind": str(item.get("kind") or item.get("type") or ""),
                        "label": str(item.get("label") or item.get("text") or ""),
                        "bounds": normalize_bounds(bounds),
                    }
                )
            except Exception:
                continue
    if values:
        return values
    return [{"kind": "fallback", "label": "", "bounds": normalize_bounds(fallback_bounds)}]


def is_label_component(component):
    text = f"{component.get('kind', '')} {component.get('label', '')}".lower()
    return any(token in text for token in ["label", "badge", "tag", "text", "标签", "短标签", "标牌", "导览", "ai"])


def label_component_mask(bounds, width, height):
    x0, y0, x1, y1 = normalized_bounds_to_xyxy(bounds, width, height)
    mask = np.zeros((height, width), dtype=bool)
    box_width = max(1, x1 - x0)
    box_height = max(1, y1 - y0)
    radius = max(2, int(round(min(box_width, box_height) * 0.16)))
    yy, xx = np.ogrid[y0:y1, x0:x1]
    local_x = xx - x0
    local_y = yy - y0
    inside = np.ones((box_height, box_width), dtype=bool)
    corners = [
        (local_x < radius, local_y < radius, radius - local_x, radius - local_y),
        (local_x >= box_width - radius, local_y < radius, local_x - (box_width - radius - 1), radius - local_y),
        (local_x < radius, local_y >= box_height - radius, radius - local_x, local_y - (box_height - radius - 1)),
        (
            local_x >= box_width - radius,
            local_y >= box_height - radius,
            local_x - (box_width - radius - 1),
            local_y - (box_height - radius - 1),
        ),
    ]
    for corner_x, corner_y, dx, dy in corners:
        corner = np.logical_and(corner_x, corner_y)
        outside = dx * dx + dy * dy > radius * radius
        inside[np.logical_and(corner, outside)] = False
    mask[y0:y1, x0:x1] = inside
    return mask


def postprocess_mask(mask, module):
    try:
        import cv2

        policy = str(module.get("maskPolicy") or "").lower()
        kind = str(module.get("regionKind") or "").lower()
        target = " ".join(
            [
                policy,
                kind,
                str(module.get("label") or ""),
                str(module.get("targetDescription") or ""),
            ]
        ).lower()
        alpha = (mask.astype(np.uint8) * 255)
        height, width = alpha.shape
        short_side = max(1, min(width, height))
        if policy in ["subject-with-label", "route", "full-region"] or kind in [
            "route",
            "legend",
            "landmark",
            "building",
            "mountain",
            "water",
            "axis",
            "panel",
            "background",
            "object-with-label",
        ]:
            kernel_ratio = 0.009
            close_iterations = 2
            dilate_iterations = 1
        elif "label" in target or "route" in target or "path" in target:
            kernel_ratio = 0.007
            close_iterations = 2
            dilate_iterations = 1
        else:
            kernel_ratio = 0.005
            close_iterations = 1
            dilate_iterations = 0
        kernel_size = int(max(3, min(15, round(short_side * kernel_ratio))))
        if kernel_size % 2 == 0:
            kernel_size += 1
        kernel = np.ones((kernel_size, kernel_size), np.uint8)
        alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=close_iterations)
        if dilate_iterations:
            alpha = cv2.dilate(alpha, kernel, iterations=dilate_iterations)
        # Fill interior holes so the cutout/mask is a solid silhouette instead
        # of a fragmented shape with see-through cavities. MORPH_CLOSE above
        # only seals small gaps; large internal holes survive it. This applies
        # to routes too: public previews must never show hollow SAM fragments.
        alpha = fill_mask_holes(alpha)
        quality = mask_quality(alpha > 0, module, original_alpha=(mask.astype(np.uint8) * 255))
        return alpha > 0, [], quality
    except Exception as error:
        module_id = str((module or {}).get("moduleId") or (module or {}).get("id") or "")
        label = str((module or {}).get("label") or "")
        context = f" for {module_id or label}" if (module_id or label) else ""
        return mask, [f"SAM3 mask postprocess skipped{context}: {error}"], {
            "holeCount": 1 if should_fill_mask_holes(module) else 0,
            "componentCount": 0,
            "filledHolePixels": 0,
            "contiguous": False,
            "solid": False,
        }


def to_numpy(value):
    if hasattr(value, "detach"):
        return value.detach().float().cpu().numpy()
    return np.asarray(value)


def mask_to_normalized_bounds(mask, width, height):
    ys, xs = np.where(mask)
    if xs.size == 0 or ys.size == 0:
        return None
    x0 = int(xs.min())
    y0 = int(ys.min())
    x1 = int(xs.max()) + 1
    y1 = int(ys.max()) + 1
    return {
        "x": round(x0 / width, 6),
        "y": round(y0 / height, 6),
        "width": round((x1 - x0) / width, 6),
        "height": round((y1 - y0) / height, 6),
    }


def should_fill_mask_holes(module):
    return True


def solid_preview_alpha(mask, module=None):
    alpha = (mask.astype(np.uint8) * 255)
    return fill_mask_holes(alpha) if should_fill_mask_holes(module) else alpha


def mask_to_data_url(mask, module=None):
    alpha = solid_preview_alpha(mask, module)
    ys, xs = np.where(alpha > 0)
    if xs.size == 0 or ys.size == 0:
        return ""
    x0 = int(xs.min())
    y0 = int(ys.min())
    x1 = int(xs.max()) + 1
    y1 = int(ys.max()) + 1
    cropped = alpha[y0:y1, x0:x1]
    image = Image.fromarray(cropped, mode="L")
    image.thumbnail((384, 384), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def mask_to_cutout_data_url(image, mask, module=None):
    alpha = solid_preview_alpha(mask, module)
    ys, xs = np.where(alpha > 0)
    if xs.size == 0 or ys.size == 0:
        return ""
    x0 = int(xs.min())
    y0 = int(ys.min())
    x1 = int(xs.max()) + 1
    y1 = int(ys.max()) + 1
    cropped_image = image.crop((x0, y0, x1, y1)).convert("RGBA")
    cropped_alpha = Image.fromarray(alpha[y0:y1, x0:x1], mode="L")
    cropped_image.putalpha(cropped_alpha)
    cropped_image = pad_transparent(cropped_image)
    cropped_image.thumbnail((384, 384), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    cropped_image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def mask_to_organic_preview(image, mask, module=None):
    alpha = solid_preview_alpha(mask, module)
    ys, xs = np.where(alpha > 0)
    if xs.size == 0 or ys.size == 0:
        return {"image": "", "bounds": None, "aspectRatio": None}
    height, width = alpha.shape
    mask_area = max(1, int(mask.sum()))
    radius = int(round(max(8, min(64, np.sqrt(mask_area) * 0.07))))
    feather = int(round(max(8, min(42, radius * 1.35))))

    try:
        import cv2

        source_alpha = fill_mask_holes(alpha)
        if np.count_nonzero(source_alpha) < mask_area * 0.72:
            source_alpha = alpha
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
        expanded_solid = cv2.dilate(source_alpha, kernel, iterations=1)
        if feather > 0:
            blur_kernel = feather * 2 + 1
            if blur_kernel % 2 == 0:
                blur_kernel += 1
            expanded = cv2.GaussianBlur(expanded_solid, (blur_kernel, blur_kernel), 0)
            expanded = np.maximum(expanded, source_alpha)
        else:
            expanded = expanded_solid
    except Exception as error:
        return {
            "image": "",
            "bounds": None,
            "aspectRatio": None,
            "warning": f"SAM3 organic preview expansion failed: {error}",
        }

    ys, xs = np.where(expanded > 3)
    if xs.size == 0 or ys.size == 0:
        return {"image": "", "bounds": None, "aspectRatio": None}
    pad = max(8, int(round(max(width, height) * 0.018)))
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(width, int(xs.max()) + 1 + pad)
    y1 = min(height, int(ys.max()) + 1 + pad)

    cropped_image = image.crop((x0, y0, x1, y1)).convert("RGBA")
    cropped_alpha = Image.fromarray(expanded[y0:y1, x0:x1], mode="L")
    cropped_image.putalpha(cropped_alpha)
    cropped_image.thumbnail((640, 640), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    cropped_image.save(buffer, format="PNG", optimize=True)
    return {
        "image": "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"),
        "bounds": {
            "x": round(x0 / width, 6),
            "y": round(y0 / height, 6),
            "width": round((x1 - x0) / width, 6),
            "height": round((y1 - y0) / height, 6),
        },
        "aspectRatio": round(cropped_image.width / max(1, cropped_image.height), 6),
    }


def fill_mask_holes(alpha):
    import cv2

    binary = ((alpha > 0).astype(np.uint8) * 255)
    if not np.any(binary):
        return binary
    height, width = binary.shape
    flood = binary.copy()
    mask = np.zeros((height + 2, width + 2), np.uint8)
    seeds = []
    for x in range(width):
        seeds.append((x, 0))
        seeds.append((x, height - 1))
    for y in range(1, height - 1):
        seeds.append((0, y))
        seeds.append((width - 1, y))
    for seed in seeds:
        if flood[seed[1], seed[0]] == 0:
            cv2.floodFill(flood, mask, seed, 255)
    exterior = (flood == 255) & (binary == 0)
    holes = (~exterior) & (binary == 0)
    filled = binary.copy()
    filled[holes] = 255
    return filled


def mask_quality(mask, module=None, original_alpha=None):
    alpha = (mask.astype(np.uint8) * 255) if mask.dtype != np.uint8 else mask
    try:
        import cv2

        contours, hierarchy = cv2.findContours(alpha, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        hole_count = 0
        if hierarchy is not None:
            for item in hierarchy[0]:
                parent = int(item[3])
                if parent >= 0:
                    hole_count += 1
        component_count = count_external_components(alpha)
        filled_hole_pixels = 0
        if original_alpha is not None:
            filled_hole_pixels = max(0, int(np.count_nonzero(alpha > 0) - np.count_nonzero(original_alpha > 0)))
        return {
            "holeCount": int(hole_count),
            "componentCount": int(component_count),
            "filledHolePixels": int(filled_hole_pixels),
            "contiguous": component_count <= 1,
            "solid": hole_count == 0,
        }
    except Exception:
        return {
            "holeCount": 1,
            "componentCount": 0,
            "filledHolePixels": 0,
            "contiguous": False,
            "solid": False,
        }


def count_external_components(alpha):
    try:
        import cv2

        contours, _ = cv2.findContours(alpha, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        return len(contours or [])
    except Exception:
        return 0


def should_trim_region_boundary(module):
    if not module:
        return False
    policy = str(module.get("maskPolicy") or "").lower()
    kind = str(module.get("regionKind") or "").lower()
    if policy == "route" or kind == "route":
        return False
    return policy == "full-region" or kind in ["landmark", "building", "mountain", "water", "axis", "panel", "background"]


def pad_transparent(image):
    width, height = image.size
    pad = max(16, int(round(max(width, height) * 0.09)))
    canvas = Image.new("RGBA", (width + pad * 2, height + pad * 2), (0, 0, 0, 0))
    canvas.paste(image, (pad, pad))
    return canvas


def mask_to_polygon(mask, width, height):
    points = contour_points(mask)
    if len(points) < 3:
        bbox = mask_to_normalized_bounds(mask, width, height)
        if not bbox:
            return []
        x0 = bbox["x"]
        y0 = bbox["y"]
        x1 = bbox["x"] + bbox["width"]
        y1 = bbox["y"] + bbox["height"]
        return [
            {"x": round(x0, 6), "y": round(y0, 6)},
            {"x": round(x1, 6), "y": round(y0, 6)},
            {"x": round(x1, 6), "y": round(y1, 6)},
            {"x": round(x0, 6), "y": round(y1, 6)},
        ]
    return [
        {
            "x": round(max(0.0, min(1.0, float(x) / width)), 6),
            "y": round(max(0.0, min(1.0, float(y) / height)), 6),
        }
        for x, y in points
    ]


def contour_points(mask):
    alpha = (mask.astype(np.uint8) * 255)
    try:
        import cv2

        alpha = clean_mask_for_polygon(alpha)
        contours, _ = cv2.findContours(alpha, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return []
        contour = merge_contours_for_polygon(contours)
        if contour is None or len(contour) < 3:
            return []
        perimeter = cv2.arcLength(contour, True)
        epsilon = max(2.0, 0.015 * perimeter)
        approx = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
        if len(approx) > 80:
            step = int(np.ceil(len(approx) / 80))
            approx = approx[::step]
        return [(int(x), int(y)) for x, y in approx]
    except Exception:
        return sampled_boundary_points(alpha)


def clean_mask_for_polygon(alpha):
    try:
        import cv2

        height, width = alpha.shape
        short_side = max(1, min(width, height))
        kernel_size = int(max(3, min(13, round(short_side * 0.012))))
        if kernel_size % 2 == 0:
            kernel_size += 1
        kernel = np.ones((kernel_size, kernel_size), np.uint8)
        closed = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=2)
        dilated = cv2.dilate(closed, kernel, iterations=1)
        return dilated
    except Exception:
        return alpha


def merge_contours_for_polygon(contours):
    try:
        import cv2

        contours = [contour for contour in contours if cv2.contourArea(contour) > 1]
        if not contours:
            return None
        areas = [cv2.contourArea(contour) for contour in contours]
        total_area = float(sum(areas))
        largest_index = int(np.argmax(areas))
        largest = contours[largest_index]
        if len(contours) == 1 or areas[largest_index] / max(total_area, 1.0) >= 0.72:
            return largest
        all_points = np.concatenate(contours, axis=0)
        return cv2.convexHull(all_points)
    except Exception:
        return max(contours, key=lambda contour: len(contour)) if contours else None


def sampled_boundary_points(alpha):
    ys, xs = np.where(alpha > 0)
    if xs.size == 0 or ys.size == 0:
        return []
    boundary = []
    height, width = alpha.shape
    for x, y in zip(xs, ys):
        x0 = max(0, x - 1)
        y0 = max(0, y - 1)
        x1 = min(width, x + 2)
        y1 = min(height, y + 2)
        if np.any(alpha[y0:y1, x0:x1] == 0):
            boundary.append((int(x), int(y)))
    hull = convex_hull(boundary)
    if len(hull) <= 80:
        return hull
    step = int(np.ceil(len(hull) / 80))
    return hull[::step]


def convex_hull(points):
    points = sorted(set(points))
    if len(points) <= 1:
        return points

    def cross(origin, a, b):
        return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])

    lower = []
    for point in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)

    upper = []
    for point in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)

    return lower[:-1] + upper[:-1]


def respond(request, result=None, error=None):
    payload = {"id": request.get("id")}
    if error:
        payload["error"] = str(error)
    else:
        payload["result"] = result or {}
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()
    worker = Sam3Worker(args.checkpoint, args.device)
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            request_type = request.get("type")
            if request_type == "health":
                respond(request, worker.health())
            elif request_type == "preload":
                respond(request, worker.preload())
            elif request_type == "segment":
                respond(request, worker.segment(request))
            else:
                respond(request, error=f"unknown SAM3 request type: {request_type}")
        except Exception as error:
            respond(locals().get("request", {}), error=error)


if __name__ == "__main__":
    main()
