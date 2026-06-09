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
        mode = os.environ.get("CHATIMAGE_FAKE_LOCATE_MODE", "success")
        if mode == "timeout":
            time.sleep(5)
            continue
        if request.get("type") == "health":
            respond(request, {
                "ok": mode != "health-fail",
                "provider": "locateanything",
                "model": "fake-locate",
                "device": "cuda",
                "cudaAvailable": mode != "health-fail",
                "loaded": False,
                "warnings": [] if mode != "health-fail" else ["fake health failure"],
            })
            continue
        if request.get("type") == "preload":
            respond(request, {
                "ok": True,
                "provider": "locateanything",
                "model": "fake-locate",
                "device": "cuda",
                "loaded": True,
                "loadSeconds": 0.01,
            })
            continue
        modules = request.get("modules") or []
        output_modules = []
        rejected = []
        for index, module in enumerate(modules):
            if mode == "no-box" and index == 0:
                rejected.append({"moduleId": module["moduleId"], "reason": "no valid box"})
                continue
            if mode == "invalid-bounds" and index == 0:
                bounds = {"x": 0.98, "y": 0.2, "width": 0.2, "height": 0.2}
            else:
                bounds = {"x": 0.08 + index * 0.22, "y": 0.18, "width": 0.18, "height": 0.2}
            output_modules.append({
                "moduleId": module["moduleId"],
                "label": module["label"],
                "matchedText": f"{index + 1:02d} {module['label']}",
                "bounds": bounds,
                "confidence": 0.88,
                "answer": "<box><80><180><260><380></box>",
            })
        if mode == "non-json":
            print("not json", flush=True)
            continue
        respond(request, {
            "provider": "locateanything",
            "modules": output_modules,
            "rejectedModules": rejected,
            "warnings": ["fake locate"],
        })


def respond(request, result):
    print(json.dumps({"id": request.get("id"), "result": result}), flush=True)


if __name__ == "__main__":
    main()
