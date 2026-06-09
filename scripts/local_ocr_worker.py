#!/usr/bin/env python
"""Local OCR alignment worker for ChatImage.

The worker intentionally keeps a narrow JSON contract: stdout is JSON only,
stderr is reserved for diagnostics when the process fails.
"""

import argparse
import json
import math
import os
import re
import sys
from difflib import SequenceMatcher


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--modules", required=True)
    parser.add_argument("--image-width", required=True, type=int)
    parser.add_argument("--image-height", required=True, type=int)
    parser.add_argument("--purpose", default="local_ocr_align")
    args = parser.parse_args()

    modules = load_json(args.modules)
    image = load_image(args.image)
    height, width = image.shape[:2]
    ocr_items = run_ocr(args.image)
    contours = find_card_contours(image)
    aligned = align_modules(modules, ocr_items, contours, width, height)

    print(json.dumps({
        "modules": aligned["modules"],
        "ocrRaw": ocr_items,
        "warnings": aligned["warnings"],
        "meta": {
            "provider": "local-ocr",
            "purpose": args.purpose,
            "imageWidth": width,
            "imageHeight": height
        }
    }, ensure_ascii=False))


def load_json(file_path):
    with open(file_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_image(file_path):
    try:
        import cv2
    except Exception as error:
        raise RuntimeError("OpenCV is required for local OCR: pip install opencv-python") from error
    image = cv2.imread(file_path)
    if image is None:
        raise RuntimeError("OpenCV could not read image")
    return image


def run_ocr(file_path):
    try:
        os.environ.setdefault("DISABLE_MODEL_SOURCE_CHECK", "True")
        from paddleocr import PaddleOCR
    except Exception as error:
        raise RuntimeError("PaddleOCR is required for local OCR: pip install paddleocr") from error

    ocr = create_ocr_engine(PaddleOCR)
    result = call_ocr(ocr, file_path)
    items = []
    for box, text, confidence in flatten_ocr_result(result):
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]
        items.append({
            "text": str(text),
            "confidence": float(confidence),
            "box": [[float(point[0]), float(point[1])] for point in box],
            "boundsPx": {
                "x": float(min(xs)),
                "y": float(min(ys)),
                "width": float(max(xs) - min(xs)),
                "height": float(max(ys) - min(ys))
            }
        })
    return items


def create_ocr_engine(PaddleOCR):
    candidates = [
        {"use_textline_orientation": True, "lang": "ch"},
        {"use_angle_cls": True, "lang": "ch"},
        {"lang": "ch"}
    ]
    last_error = None
    for kwargs in candidates:
        try:
            return PaddleOCR(**kwargs)
        except Exception as error:
            last_error = error
            if "Unknown argument" not in str(error):
                raise
    raise last_error


def call_ocr(ocr, file_path):
    if hasattr(ocr, "predict"):
        return ocr.predict(file_path)
    try:
        return ocr.ocr(file_path, cls=True)
    except Exception as error:
        if "Unknown argument" not in str(error) and "unexpected keyword" not in str(error):
            raise
    return ocr.ocr(file_path)


def flatten_ocr_result(result):
    if not result:
        return []
    if isinstance(result, list) and result and isinstance(result[0], dict):
        return flatten_paddle_v3_result(result)
    rows = result[0] if len(result) == 1 and isinstance(result[0], list) else result
    flattened = []
    for item in rows:
        if not item or len(item) < 2:
            continue
        box = item[0]
        payload = item[1]
        if isinstance(payload, (list, tuple)) and len(payload) >= 2:
            text = payload[0]
            confidence = payload[1]
        else:
            continue
        if not box or len(box) < 4:
            continue
        flattened.append((box, text, confidence))
    return flattened


def flatten_paddle_v3_result(result):
    flattened = []
    for page in result:
        texts = page.get("rec_texts") or []
        scores = page.get("rec_scores") or []
        polys = page.get("rec_polys") or page.get("dt_polys") or []
        for text, score, poly in zip(texts, scores, polys):
            box = normalize_poly(poly)
            if len(box) < 4:
                continue
            flattened.append((box, text, score))
    return flattened


def normalize_poly(poly):
    if hasattr(poly, "tolist"):
        poly = poly.tolist()
    return [[float(point[0]), float(point[1])] for point in poly or [] if len(point) >= 2]


def find_card_contours(image):
    import cv2

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 80, 180)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    height, width = image.shape[:2]
    image_area = width * height
    candidates = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area < image_area * 0.015 or area > image_area * 0.75:
            continue
        if w < 40 or h < 30:
            continue
        candidates.append({"x": x, "y": y, "width": w, "height": h, "area": area})
    candidates.sort(key=lambda item: item["area"], reverse=True)
    return candidates


def align_modules(modules, ocr_items, contours, width, height):
    warnings = []
    matches = []
    used_indices = set()
    for index, module in enumerate(modules):
        number = f"{index + 1:02d}"
        label = str(module.get("label") or "")
        best = find_best_ocr_match(number, label, ocr_items, used_indices)
        if not best:
            warnings.append(f"missing OCR anchor for {module.get('moduleId')} ({number} {label})")
            continue
        used_indices.add(best["index"])
        matches.append({"module": module, "index": index, "number": number, "label": label, "best": best})

    aligned = []
    for match in matches:
        item = match["best"]["item"]
        card = (
            infer_card_bounds_from_ocr(match, matches, ocr_items, width, height)
            or find_containing_card(item["boundsPx"], contours)
            or expand_bounds(item["boundsPx"], width, height)
        )
        card = fit_bounds_to_click_constraints(card, width, height)
        bounds = normalize_bounds(card, width, height)
        confidence = min(0.99, max(0.0, match["best"]["score"] * float(item.get("confidence") or 0.5)))
        aligned.append({
            "moduleId": match["module"].get("moduleId"),
            "label": match["label"],
            "matchedText": item.get("text", ""),
            "bounds": bounds,
            "confidence": round(confidence, 3)
        })
    return {"modules": aligned, "warnings": warnings}


def find_best_ocr_match(number, label, ocr_items, used_indices):
    best = None
    normalized_label = normalize_text(label)
    for index, item in enumerate(ocr_items):
        if index in used_indices:
            continue
        text = str(item.get("text") or "")
        normalized = normalize_text(text)
        number_score = score_number_anchor(number, normalized)
        label_score = SequenceMatcher(None, normalized_label, normalized).ratio() if normalized_label else 0
        if normalized_label and normalized_label in normalized:
            label_score = max(label_score, 0.75)
        score = number_score + min(label_score, 0.35)
        if score <= 0:
            continue
        if not best or score > best["score"]:
            best = {"index": index, "item": item, "score": score}
    return best


def score_number_anchor(number, normalized):
    if normalized == number:
        return 0.9
    if normalized.startswith(number):
        tail = normalized[len(number):]
        if not tail or not tail[0].isdigit():
            return 0.78
    return 0


def normalize_text(value):
    return re.sub(r"\s+", "", str(value or "")).lower()


def find_containing_card(text_bounds, contours):
    cx = text_bounds["x"] + text_bounds["width"] / 2
    cy = text_bounds["y"] + text_bounds["height"] / 2
    for contour in contours:
        if (
            contour["x"] <= cx <= contour["x"] + contour["width"]
            and contour["y"] <= cy <= contour["y"] + contour["height"]
        ):
            return contour
    return None


def infer_card_bounds_from_ocr(match, matches, ocr_items, width, height):
    anchor = match["best"]["item"]["boundsPx"]
    row_matches = find_row_matches(match, matches, height)
    row_matches.sort(key=lambda entry: entry["best"]["item"]["boundsPx"]["x"])
    position = row_matches.index(match)
    x_gap = max(24, width * 0.018)
    y_gap = max(28, height * 0.035)

    left = anchor["x"] - x_gap
    right = width - x_gap
    if position > 0:
        previous = row_matches[position - 1]["best"]["item"]["boundsPx"]
        left = anchor["x"] - x_gap
        left = max(left, previous["x"] + previous["width"] + x_gap)
    if position + 1 < len(row_matches):
        next_anchor = row_matches[position + 1]["best"]["item"]["boundsPx"]
        right = next_anchor["x"] - x_gap

    all_rows = compute_row_centers(matches, height)
    current_row_y = row_anchor_y(match, height)
    row_index = min(range(len(all_rows)), key=lambda index: abs(all_rows[index] - current_row_y))
    top = current_row_y - max(70, height * 0.08)
    bottom = height - max(36, height * 0.04)
    if row_index + 1 < len(all_rows):
        bottom = all_rows[row_index + 1] - y_gap

    left = max(0, left)
    top = max(0, top)
    right = min(width, right)
    bottom = min(height, bottom)

    grouped = []
    for item in ocr_items:
        bounds = item.get("boundsPx") or {}
        cx = bounds.get("x", 0) + bounds.get("width", 0) / 2
        cy = bounds.get("y", 0) + bounds.get("height", 0) / 2
        if (
            left <= cx <= right
            and top <= cy <= bottom
            and belongs_to_anchor(item, match, matches, width, height)
        ):
            grouped.append(bounds)
    if len(grouped) < 2:
        return None
    union = padded_union(grouped, width, height, width * 0.03, height * 0.04)
    clipped_left = max(union["x"], left)
    clipped_top = max(union["y"], top)
    clipped_right = min(union["x"] + union["width"], right)
    clipped_bottom = min(union["y"] + union["height"], bottom)
    if clipped_right <= clipped_left or clipped_bottom <= clipped_top:
        return union
    return {
        "x": clipped_left,
        "y": clipped_top,
        "width": clipped_right - clipped_left,
        "height": clipped_bottom - clipped_top
    }


def belongs_to_anchor(item, match, matches, width, height):
    item_bounds = item.get("boundsPx") or {}
    anchor = match["best"]["item"]["boundsPx"]
    cx = item_bounds.get("x", 0) + item_bounds.get("width", 0) / 2
    cy = item_bounds.get("y", 0) + item_bounds.get("height", 0) / 2
    ax = anchor["x"] + anchor["width"] / 2
    ay = anchor["y"] + anchor["height"] / 2
    dx = max(0, cx - ax)
    dy = cy - ay

    if dx > width * 0.34 or dy < -height * 0.04 or dy > height * 0.30:
        return False

    own_distance = weighted_anchor_distance(cx, cy, match)
    for other in matches:
        if other is match:
            continue
        if weighted_anchor_distance(cx, cy, other) + width * 0.015 < own_distance:
            return False
    return True


def weighted_anchor_distance(cx, cy, match):
    bounds = match["best"]["item"]["boundsPx"]
    ax = bounds["x"] + bounds["width"] / 2
    ay = bounds["y"] + bounds["height"] / 2
    dx = cx - ax
    dy = cy - ay
    return math.sqrt(dx * dx + dy * dy * 1.35 * 1.35)


def find_row_matches(match, matches, height):
    current_y = row_anchor_y(match, height)
    tolerance = max(70, height * 0.12)
    return [entry for entry in matches if abs(row_anchor_y(entry, height) - current_y) <= tolerance]


def compute_row_centers(matches, height):
    tolerance = max(70, height * 0.12)
    centers = sorted(row_anchor_y(entry, height) for entry in matches)
    rows = []
    for center in centers:
        if not rows or abs(rows[-1]["center"] - center) > tolerance:
            rows.append({"values": [center], "center": center})
            continue
        rows[-1]["values"].append(center)
        rows[-1]["center"] = sum(rows[-1]["values"]) / len(rows[-1]["values"])
    return [row["center"] for row in rows]


def row_anchor_y(match, height):
    bounds = match["best"]["item"]["boundsPx"]
    return bounds["y"] + bounds["height"] / 2


def padded_union(bounds_list, width, height, pad_x, pad_y):
    left = min(bounds["x"] for bounds in bounds_list)
    top = min(bounds["y"] for bounds in bounds_list)
    right = max(bounds["x"] + bounds["width"] for bounds in bounds_list)
    bottom = max(bounds["y"] + bounds["height"] for bounds in bounds_list)
    return {
        "x": max(0, left - pad_x),
        "y": max(0, top - pad_y),
        "width": min(width, right + pad_x) - max(0, left - pad_x),
        "height": min(height, bottom + pad_y) - max(0, top - pad_y)
    }


def expand_bounds(bounds, width, height):
    pad_x = max(32, bounds["width"] * 1.6)
    pad_y = max(42, bounds["height"] * 2.2)
    x = max(0, bounds["x"] - pad_x)
    y = max(0, bounds["y"] - pad_y)
    right = min(width, bounds["x"] + bounds["width"] + pad_x)
    bottom = min(height, bounds["y"] + bounds["height"] + pad_y)
    return {"x": x, "y": y, "width": right - x, "height": bottom - y}


def fit_bounds_to_click_constraints(bounds, width, height):
    safe_x = width * 0.035
    safe_y = height * 0.035
    min_w = width * 0.12
    min_h = height * 0.12

    left = max(bounds["x"], safe_x)
    top = max(bounds["y"], safe_y)
    right = min(bounds["x"] + bounds["width"], width - safe_x - 1)
    bottom = min(bounds["y"] + bounds["height"], height - safe_y - 1)

    if right - left < min_w:
        cx = (left + right) / 2
        left = cx - min_w / 2
        right = cx + min_w / 2
    if bottom - top < min_h:
        cy = (top + bottom) / 2
        top = cy - min_h / 2
        bottom = cy + min_h / 2

    if left < safe_x:
        right += safe_x - left
        left = safe_x
    if right > width - safe_x - 1:
        left -= right - (width - safe_x - 1)
        right = width - safe_x - 1
    if top < safe_y:
        bottom += safe_y - top
        top = safe_y
    if bottom > height - safe_y - 1:
        top -= bottom - (height - safe_y - 1)
        bottom = height - safe_y - 1

    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def normalize_bounds(bounds, width, height):
    return {
        "x": clamp(bounds["x"] / width),
        "y": clamp(bounds["y"] / height),
        "width": clamp(bounds["width"] / width),
        "height": clamp(bounds["height"] / height)
    }


def clamp(value):
    if not math.isfinite(value):
        return 0
    return max(0, min(1, value))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
