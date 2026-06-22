#!/usr/bin/env python
import json
import os
import sys
import time


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        mode = os.environ.get("CHATIMAGE_FAKE_SAM3_MODE", "success")
        if mode == "timeout":
            time.sleep(5)
            continue
        if request.get("type") == "health":
            respond(
                request,
                {
                    "ok": mode != "health-fail",
                    "provider": "sam3",
                    "checkpoint": "fake-sam3.pt",
                    "device": "cuda",
                    "cudaAvailable": mode != "health-fail",
                    "loaded": False,
                    "warnings": [],
                },
            )
            continue
        if request.get("type") == "preload":
            respond(
                request,
                {
                    "ok": True,
                    "provider": "sam3",
                    "checkpoint": "fake-sam3.pt",
                    "device": "cuda",
                    "loaded": True,
                    "loadSeconds": 0.01,
                },
            )
            continue
        modules = request.get("modules") or []
        output = []
        rejected = []
        for index, module in enumerate(modules):
            bounds = module.get("bounds") or {}
            if mode == "no-mask" and index == 0:
                rejected.append({"moduleId": module["moduleId"], "reason": "empty mask"})
                continue
            if mode == "invalid-bounds" and index == 0:
                mask_bounds = {"x": 0.95, "y": 0.2, "width": 0.2, "height": 0.2}
            elif module.get("components"):
                mask_bounds = union_component_bounds(module.get("components"))
            else:
                mask_bounds = {
                    "x": round(bounds.get("x", 0.1) + 0.01, 6),
                    "y": round(bounds.get("y", 0.1) + 0.01, 6),
                    "width": round(max(0.01, bounds.get("width", 0.2) - 0.02), 6),
                    "height": round(max(0.01, bounds.get("height", 0.2) - 0.02), 6),
                }
            score = 0.24 if mode == "low-route-score" and index == 0 else 0.94
            polygon = [
                {"x": mask_bounds["x"], "y": mask_bounds["y"]},
                {"x": round(mask_bounds["x"] + mask_bounds["width"], 6), "y": mask_bounds["y"]},
                {
                    "x": round(mask_bounds["x"] + mask_bounds["width"] * 0.82, 6),
                    "y": round(mask_bounds["y"] + mask_bounds["height"], 6),
                },
                {"x": mask_bounds["x"], "y": round(mask_bounds["y"] + mask_bounds["height"], 6)},
            ]
            if mode == "low-route-score" and index == 0:
                polygon = [
                    {"x": mask_bounds["x"], "y": round(mask_bounds["y"] + mask_bounds["height"] * 0.12, 6)},
                    {"x": round(mask_bounds["x"] + mask_bounds["width"] * 0.38, 6), "y": mask_bounds["y"]},
                    {"x": round(mask_bounds["x"] + mask_bounds["width"], 6), "y": round(mask_bounds["y"] + mask_bounds["height"] * 0.18, 6)},
                    {"x": round(mask_bounds["x"] + mask_bounds["width"] * 0.92, 6), "y": round(mask_bounds["y"] + mask_bounds["height"] * 0.72, 6)},
                    {"x": round(mask_bounds["x"] + mask_bounds["width"] * 0.46, 6), "y": round(mask_bounds["y"] + mask_bounds["height"], 6)},
                    {"x": mask_bounds["x"], "y": round(mask_bounds["y"] + mask_bounds["height"] * 0.84, 6)},
                ]
            output.append(
                {
                    "moduleId": module["moduleId"],
                    "label": module.get("label", ""),
                    "inputBounds": bounds,
                    "maskBounds": mask_bounds,
                    "maskImage": "data:image/png;base64,iVBORw0KGgo=",
                    "cutoutImage": "data:image/png;base64,iVBORw0KGgo=",
                    "polygon": polygon,
                    "score": score,
                    "maskPixels": 12345,
                }
            )
        respond(
            request,
            {
                "ok": True,
                "provider": "sam3",
                "modules": output,
                "rejectedModules": rejected,
                "warnings": ["fake sam3"],
            },
        )


def union_component_bounds(components):
    values = []
    for component in components:
        bounds = component.get("bounds") if isinstance(component, dict) else None
        if not isinstance(bounds, dict):
            continue
        x = float(bounds.get("x", 0))
        y = float(bounds.get("y", 0))
        width = float(bounds.get("width", 0))
        height = float(bounds.get("height", 0))
        if width <= 0 or height <= 0:
            continue
        values.append((x, y, x + width, y + height))
    if not values:
        return {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2}
    x0 = min(item[0] for item in values)
    y0 = min(item[1] for item in values)
    x1 = max(item[2] for item in values)
    y1 = max(item[3] for item in values)
    return {
        "x": round(x0, 6),
        "y": round(y0, 6),
        "width": round(x1 - x0, 6),
        "height": round(y1 - y0, 6),
    }


def respond(request, result):
    print(json.dumps({"id": request.get("id"), "result": result}), flush=True)


if __name__ == "__main__":
    main()
