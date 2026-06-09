#!/usr/bin/env python
import argparse
import json
import os
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--modules", required=True)
    parser.add_argument("--image-width", required=True)
    parser.add_argument("--image-height", required=True)
    parser.add_argument("--purpose", default="local_ocr_align")
    args = parser.parse_args()

    mode = os.environ.get("CHATIMAGE_FAKE_OCR_MODE", "success")
    if mode == "timeout":
        time.sleep(5)
        return
    if mode == "exit":
        print("fake worker failed", file=sys.stderr)
        sys.exit(7)
    if mode == "non-json":
        print("not json")
        return

    with open(args.modules, "r", encoding="utf-8") as handle:
        modules = json.load(handle)

    if mode == "invalid-bounds":
        bounds = {"x": 0.95, "y": 0.2, "width": 0.2, "height": 0.2}
    else:
        bounds = {"x": 0.1, "y": 0.2, "width": 0.2, "height": 0.2}

    output_modules = []
    for index, module in enumerate(modules):
        output_modules.append({
            "moduleId": module["moduleId"],
            "label": module["label"],
            "matchedText": f"{index + 1:02d} {module['label']}",
            "bounds": bounds if index == 0 else {
                "x": 0.1 + index * 0.25,
                "y": 0.2,
                "width": 0.2,
                "height": 0.2
            },
            "confidence": 0.9
        })

    print(json.dumps({
        "modules": output_modules,
        "ocrRaw": [{"text": "01 Input"}],
        "warnings": ["fake worker"]
    }))


if __name__ == "__main__":
    main()
