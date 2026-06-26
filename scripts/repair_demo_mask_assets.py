import base64
import io
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: repair_demo_mask_assets.py <state-json-path> <image-path>")
    state_path = Path(sys.argv[1])
    image_path = Path(sys.argv[2])
    state = json.loads(state_path.read_text(encoding="utf-8"))
    with Image.open(image_path) as raw:
        source = raw.convert("RGBA")
    for hotspot in state.get("hotspots") or []:
        repair_hotspot_mask(source, hotspot)
    state_path.write_text(json.dumps(state, ensure_ascii=True), encoding="utf-8")


def repair_hotspot_mask(source, hotspot):
    mask = hotspot.get("mask")
    if not isinstance(mask, dict):
        return
    alpha = alpha_from_data_url(mask.get("image"))
    if alpha is None or not np.any(alpha > 0):
        return
    original_count = int(np.count_nonzero(alpha > 0))
    filled = fill_alpha_holes(alpha)
    mask["image"] = alpha_to_data_url(filled, max_side=384)
    bounds = normalize_bounds(mask.get("bounds") or hotspot.get("bounds") or hotspot)
    if bounds:
        cutout = build_cutout(source, filled, bounds)
        if cutout:
            mask["cutoutImage"] = cutout
        organic = build_organic(source, filled, bounds)
        if organic:
            mask["organicImage"] = organic["image"]
            mask["organicBounds"] = organic["bounds"]
            mask["organicAspectRatio"] = organic["aspectRatio"]
    component_count = count_external_components(filled)
    quality = mask.get("quality") if isinstance(mask.get("quality"), dict) else {}
    quality.update(
        {
            "holeCount": 0,
            "componentCount": int(component_count),
            "filledHolePixels": max(0, int(np.count_nonzero(filled > 0)) - original_count),
            "contiguous": component_count <= 1,
            "solid": True,
        }
    )
    mask["quality"] = quality


def alpha_from_data_url(value):
    if not isinstance(value, str) or "," not in value:
        return None
    try:
        payload = base64.b64decode(value.split(",", 1)[1])
        image = Image.open(io.BytesIO(payload))
        if image.mode == "L":
            return np.array(image, dtype=np.uint8)
        return np.array(image.convert("RGBA"), dtype=np.uint8)[:, :, 3]
    except Exception:
        return None


def fill_alpha_holes(alpha):
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


def count_external_components(alpha):
    contours, _ = cv2.findContours(((alpha > 0).astype(np.uint8) * 255), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return len(contours or [])


def build_cutout(source, alpha, bounds):
    width, height = source.size
    box = bounds_to_pixels(bounds, width, height)
    if not box:
        return ""
    x0, y0, x1, y1 = box
    crop = source.crop((x0, y0, x1, y1)).convert("RGBA")
    crop_alpha = Image.fromarray(alpha).resize(crop.size, Image.Resampling.NEAREST)
    crop.putalpha(crop_alpha)
    crop = pad_transparent(crop)
    crop.thumbnail((384, 384), Image.Resampling.LANCZOS)
    return rgba_to_data_url(crop)


def build_organic(source, alpha, bounds):
    width, height = source.size
    box = bounds_to_pixels(bounds, width, height)
    if not box:
        return None
    x0, y0, x1, y1 = box
    crop_width = max(1, x1 - x0)
    crop_height = max(1, y1 - y0)
    placed = np.zeros((height, width), dtype=np.uint8)
    resized = Image.fromarray(alpha).resize((crop_width, crop_height), Image.Resampling.NEAREST)
    placed[y0:y1, x0:x1] = np.array(resized, dtype=np.uint8)
    placed = fill_alpha_holes(placed)
    mask_area = max(1, int(np.count_nonzero(placed > 0)))
    radius = int(round(max(8, min(64, np.sqrt(mask_area) * 0.07))))
    feather = int(round(max(8, min(42, radius * 1.35))))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
    expanded_solid = cv2.dilate(placed, kernel, iterations=1)
    blur_kernel = feather * 2 + 1
    if blur_kernel % 2 == 0:
        blur_kernel += 1
    expanded = cv2.GaussianBlur(expanded_solid, (blur_kernel, blur_kernel), 0)
    expanded = np.maximum(expanded, placed)
    ys, xs = np.where(expanded > 3)
    if xs.size == 0 or ys.size == 0:
        return None
    pad = max(8, int(round(max(width, height) * 0.018)))
    ox0 = max(0, int(xs.min()) - pad)
    oy0 = max(0, int(ys.min()) - pad)
    ox1 = min(width, int(xs.max()) + 1 + pad)
    oy1 = min(height, int(ys.max()) + 1 + pad)
    crop = source.crop((ox0, oy0, ox1, oy1)).convert("RGBA")
    crop.putalpha(Image.fromarray(expanded[oy0:oy1, ox0:ox1]))
    crop.thumbnail((640, 640), Image.Resampling.LANCZOS)
    return {
        "image": rgba_to_data_url(crop),
        "bounds": {
            "x": round(ox0 / width, 6),
            "y": round(oy0 / height, 6),
            "width": round((ox1 - ox0) / width, 6),
            "height": round((oy1 - oy0) / height, 6),
        },
        "aspectRatio": round(crop.width / max(1, crop.height), 6),
    }


def normalize_bounds(bounds):
    if not isinstance(bounds, dict):
        return None
    x = clamp01(bounds.get("x", 0))
    y = clamp01(bounds.get("y", 0))
    width = clamp01(bounds.get("width", bounds.get("w", 0)))
    height = clamp01(bounds.get("height", bounds.get("h", 0)))
    if width <= 0 or height <= 0:
        return None
    if x + width > 1:
        width = max(0, 1 - x)
    if y + height > 1:
        height = max(0, 1 - y)
    return {"x": x, "y": y, "width": width, "height": height}


def bounds_to_pixels(bounds, width, height):
    x0 = max(0, min(width - 1, int(round(bounds["x"] * width))))
    y0 = max(0, min(height - 1, int(round(bounds["y"] * height))))
    x1 = max(x0 + 1, min(width, int(round((bounds["x"] + bounds["width"]) * width))))
    y1 = max(y0 + 1, min(height, int(round((bounds["y"] + bounds["height"]) * height))))
    return (x0, y0, x1, y1)


def clamp01(value):
    try:
        number = float(value)
    except Exception:
        return 0.0
    return max(0.0, min(1.0, number))


def pad_transparent(image):
    width, height = image.size
    pad = max(16, int(round(max(width, height) * 0.09)))
    canvas = Image.new("RGBA", (width + pad * 2, height + pad * 2), (0, 0, 0, 0))
    canvas.paste(image, (pad, pad))
    return canvas


def alpha_to_data_url(alpha, max_side):
    image = Image.fromarray(alpha)
    image.thumbnail((max_side, max_side), Image.Resampling.NEAREST)
    final_alpha = fill_alpha_holes(np.array(image, dtype=np.uint8))
    image = Image.fromarray(final_alpha)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def rgba_to_data_url(image):
    image = fill_rgba_alpha_holes(image)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def fill_rgba_alpha_holes(image, threshold=32):
    rgba = image.convert("RGBA")
    data = np.array(rgba, dtype=np.uint8)
    alpha = data[:, :, 3]
    binary = ((alpha > threshold).astype(np.uint8) * 255)
    filled = fill_alpha_holes(binary)
    holes = (filled > 0) & (binary == 0)
    if np.any(holes):
        data[:, :, 3][holes] = 255
    return Image.fromarray(data)


if __name__ == "__main__":
    main()
