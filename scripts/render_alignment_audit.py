#!/usr/bin/env python
"""Render visual alignment audit artifacts.

Input is a JSON file with:
{
  "imagePath": "...",
  "overlayPath": "...",
  "previewsDir": "...",
  "modules": [
    {"id": "...", "label": "...", "alignedBy": "...", "bounds": {...}, "mask": {...}}
  ]
}
"""

import json
import os
import sys
import base64
import io

from PIL import Image, ImageDraw, ImageFont


COLORS = {
    "locateanything": (40, 120, 255),
    "locateanything-crop": (20, 160, 120),
    "layout-guided-locateanything": (70, 130, 100),
    "local-ocr": (245, 160, 35),
    "sam3": (150, 80, 220),
    "planned": (225, 70, 70),
    "layout-contract": (70, 130, 100),
}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: render_alignment_audit.py <input.json>")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        spec = json.load(handle)
    image = Image.open(spec["imagePath"]).convert("RGB")
    width, height = image.size
    modules = spec.get("modules") or []
    os.makedirs(os.path.dirname(spec["overlayPath"]), exist_ok=True)
    os.makedirs(spec["previewsDir"], exist_ok=True)
    render_overlay(image, width, height, modules).save(spec["overlayPath"])
    previews = []
    for index, module in enumerate(modules, start=1):
        preview = render_preview(image, width, height, module)
        preview_name = f"{index:02d}_{safe_name(module.get('id') or str(index))}.png"
        preview_path = os.path.join(spec["previewsDir"], preview_name)
        preview.save(preview_path)
        previews.append({"id": module.get("id"), "path": preview_path})
    print(json.dumps({"overlayPath": spec["overlayPath"], "previews": previews}, ensure_ascii=False))


def render_overlay(image, width, height, modules):
    overlay = image.copy().convert("RGBA")
    layer = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    font = load_font(20)
    for index, module in enumerate(modules, start=1):
        source = str(module.get("alignedBy") or "planned")
        color = COLORS.get(source, COLORS["planned"])
        rect = to_pixels(module.get("bounds"), width, height)
        if not rect:
            continue
        # Candidate boxes are only a weak diagnostic reference. The real
        # clickable shape is the SAM polygon below.
        outline = (*color, 95)
        draw.rounded_rectangle(rect, radius=12, outline=outline, width=2)
        mask_rect = to_pixels(((module.get("mask") or {}).get("bounds")), width, height)
        mask_polygon = to_polygon_pixels(((module.get("mask") or {}).get("polygon")), width, height)
        if mask_polygon:
            draw.line(mask_polygon + [mask_polygon[0]], fill=(255, 255, 255, 245), width=7, joint="curve")
            draw.line(mask_polygon + [mask_polygon[0]], fill=(*color, 235), width=4, joint="curve")
        elif mask_rect:
            draw.rounded_rectangle(mask_rect, radius=10, outline=(255, 255, 255, 230), width=3)
            draw.rounded_rectangle(mask_rect, radius=10, outline=(*color, 170), width=2)
        label = f"{index:02d} {module.get('id') or ''} [{source}]"
        draw_label(draw, rect[0] + 8, max(6, rect[1] - 30), label, font, color)
    return Image.alpha_composite(overlay, layer).convert("RGB")


def render_preview(image, width, height, module):
    bounds = module.get("bounds") or {}
    mask = module.get("mask") or {}
    mask_bounds = mask.get("bounds") or None
    mask_image = mask.get("image") or mask.get("maskImage") or ""
    if mask_bounds and mask_image:
        cutout = render_cutout_preview(image, width, height, mask_bounds, mask_image)
        if cutout:
            return cutout
    crop_bounds = expand_bounds(mask_bounds or bounds, 0.035)
    rect = to_pixels(crop_bounds, width, height)
    if not rect:
        return Image.new("RGB", (480, 320), (245, 245, 245))
    crop = image.crop(rect)
    crop.thumbnail((720, 520), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (760, 580), (248, 248, 246))
    x = (canvas.width - crop.width) // 2
    y = 54 + (500 - crop.height) // 2
    canvas.paste(crop, (x, y))
    draw = ImageDraw.Draw(canvas)
    source = str(module.get("alignedBy") or "planned")
    color = COLORS.get(source, COLORS["planned"])
    font = load_font(22)
    title = f"{module.get('id') or ''}  {source}"
    draw_label(draw, 18, 14, title, font, color)
    return canvas


def render_cutout_preview(image, width, height, mask_bounds, mask_image):
    rect = to_pixels(mask_bounds, width, height)
    if not rect:
        return None
    try:
        mask = load_mask_data_url(mask_image)
    except Exception:
        return None
    crop = image.convert("RGBA").crop(rect)
    mask = mask.resize(crop.size, Image.Resampling.LANCZOS).convert("L")
    crop.putalpha(mask)
    tight = crop_to_alpha(crop, 12)
    if tight is None:
        return None
    return tight


def load_mask_data_url(value):
    prefix = "data:image/png;base64,"
    text = str(value or "")
    if not text.startswith(prefix):
        raise ValueError("mask image is not a PNG data URL")
    raw = base64.b64decode(text[len(prefix):])
    return Image.open(io.BytesIO(raw))


def crop_to_alpha(image, padding):
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return None
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    return image.crop((left, top, right, bottom))


def draw_label(draw, x, y, text, font, color):
    text = str(text or "")[:80]
    bbox = draw.textbbox((x, y), text, font=font)
    pad = 7
    bg = (255, 255, 255, 232)
    draw.rounded_rectangle(
        (bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad),
        radius=8,
        fill=bg,
        outline=(*color, 220),
        width=2,
    )
    draw.text((x, y), text, fill=(22, 22, 22, 255), font=font)


def to_pixels(bounds, width, height):
    if not isinstance(bounds, dict):
        return None
    try:
        x = float(bounds.get("x", 0))
        y = float(bounds.get("y", 0))
        w = float(bounds.get("width", 0))
        h = float(bounds.get("height", 0))
    except Exception:
        return None
    if w <= 0 or h <= 0:
        return None
    left = max(0, min(width - 1, round(x * width)))
    top = max(0, min(height - 1, round(y * height)))
    right = max(left + 1, min(width, round((x + w) * width)))
    bottom = max(top + 1, min(height, round((y + h) * height)))
    return (left, top, right, bottom)


def to_polygon_pixels(points, width, height):
    if not isinstance(points, list) or len(points) < 3:
        return []
    output = []
    for point in points:
        if not isinstance(point, dict):
            continue
        try:
            x = float(point.get("x", 0))
            y = float(point.get("y", 0))
        except Exception:
            continue
        if x < 0 or y < 0 or x > 1 or y > 1:
            continue
        output.append((round(x * width), round(y * height)))
    return output if len(output) >= 3 else []


def expand_bounds(bounds, pad):
    if not isinstance(bounds, dict):
        return bounds
    x = float(bounds.get("x", 0))
    y = float(bounds.get("y", 0))
    w = float(bounds.get("width", 0))
    h = float(bounds.get("height", 0))
    left = max(0.0, x - pad)
    top = max(0.0, y - pad)
    right = min(1.0, x + w + pad)
    bottom = min(1.0, y + h + pad)
    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def load_font(size):
    candidates = [
        r"C:\code_all\LxgwWenKai\LXGWWenKaiMono-Medium.ttf",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except Exception:
                pass
    return ImageFont.load_default()


def safe_name(value):
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(value))[:80]


if __name__ == "__main__":
    main()
