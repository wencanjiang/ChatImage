#!/usr/bin/env python
"""JSONL worker for LocateAnything alignment.

stdin/stdout are JSONL only. stderr is reserved for diagnostics.
"""

import argparse
import json
import math
import os
import re
import sys
import time
import traceback

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TQDM_DISABLE", "1")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="nvidia/LocateAnything-3B")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--generation-mode", default="hybrid")
    parser.add_argument("--max-new-tokens", type=int, default=0)
    parser.add_argument("--max-image-side", type=int, default=960)
    args = parser.parse_args()
    worker = LocateAnythingJsonlWorker(args)
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            result = worker.handle(request)
            print(json.dumps({"id": request.get("id"), "result": result}, ensure_ascii=False), flush=True)
        except Exception as error:
            print(traceback.format_exc(), file=sys.stderr, flush=True)
            request_id = None
            try:
                request_id = json.loads(line).get("id")
            except Exception:
                pass
            print(json.dumps({"id": request_id, "error": str(error)}, ensure_ascii=False), flush=True)


class LocateAnythingJsonlWorker:
    def __init__(self, args):
        self.args = args
        self.locator = None
        self.model_loaded = False

    def handle(self, request):
        request_type = request.get("type")
        if request_type == "health":
            return self.health()
        if request_type == "preload":
            return self.preload()
        if request_type == "align":
            return self.align(request)
        raise ValueError(f"Unsupported request type: {request_type}")

    def health(self):
        cuda_available = False
        torch_version = ""
        try:
            import torch

            torch_version = torch.__version__
            cuda_available = bool(torch.cuda.is_available())
        except Exception as error:
            return {
                "ok": False,
                "provider": "locateanything",
                "model": self.args.model,
                "device": self.args.device,
                "cudaAvailable": False,
                "loaded": self.model_loaded,
                "warnings": [f"torch unavailable: {error}"],
            }
        return {
            "ok": self.args.device != "cuda" or cuda_available,
            "provider": "locateanything",
            "model": self.args.model,
            "device": self.args.device,
            "cudaAvailable": cuda_available,
            "torchVersion": torch_version,
            "loaded": self.model_loaded,
            "warnings": [] if cuda_available or self.args.device != "cuda" else ["CUDA is not available"],
        }

    def preload(self):
        import torch

        started_at = time.perf_counter()
        self.ensure_locator()
        if self.args.device == "cuda":
            torch.cuda.synchronize()
        return {
            "ok": True,
            "provider": "locateanything",
            "model": self.args.model,
            "device": self.args.device,
            "loaded": self.model_loaded,
            "loadSeconds": round(time.perf_counter() - started_at, 3),
        }

    def align(self, request):
        from PIL import Image

        started_at = time.perf_counter()
        original_image = Image.open(request["imagePath"]).convert("RGB")
        original_width, original_height = original_image.size
        image = resize_for_inference(original_image, self.args.max_image_side)
        width, height = image.size
        modules = request.get("modules") or []
        load_started_at = time.perf_counter()
        self.ensure_locator()
        model_load_seconds = time.perf_counter() - load_started_at
        aligned = []
        rejected = []
        warnings = []
        module_timings = []
        for index, module in enumerate(modules):
            phrase = build_module_phrase(module, index)
            try:
                module_started_at = time.perf_counter()
                result = self.locator.ground_gui(
                    image,
                    phrase,
                    output_type="box",
                    generation_mode=self.args.generation_mode,
                    max_new_tokens=self.args.max_new_tokens if self.args.max_new_tokens > 0 else None,
                    verbose=False,
                )
                module_seconds = time.perf_counter() - module_started_at
                answer = str(result.get("answer") or "")
                boxes = parse_boxes(answer, width, height)
                box = choose_box(boxes)
                module_timings.append({
                    "moduleId": module.get("moduleId"),
                    "seconds": round(module_seconds, 3),
                    "boxCount": len(boxes),
                })
                if not box:
                    rejected.append({
                        "moduleId": module.get("moduleId"),
                        "label": module.get("label", ""),
                        "matchedText": phrase,
                        "answer": answer,
                        "reason": "no valid box",
                    })
                    continue
                bounds = normalize_pixel_box(box, width, height)
                if not is_reasonable_bounds(bounds):
                    rejected.append({
                        "moduleId": module.get("moduleId"),
                        "label": module.get("label", ""),
                        "matchedText": phrase,
                        "answer": answer,
                        "bounds": bounds,
                        "reason": "box outside reasonable click area",
                    })
                    continue
                aligned.append({
                    "moduleId": module.get("moduleId"),
                    "label": module.get("label", ""),
                    "matchedText": phrase,
                    "bounds": bounds,
                    "confidence": 0.82,
                    "answer": answer,
                })
            except Exception as error:
                module_timings.append({
                    "moduleId": module.get("moduleId"),
                    "seconds": round(time.perf_counter() - module_started_at, 3) if "module_started_at" in locals() else 0,
                    "error": str(error),
                })
                warning = f"{module.get('moduleId') or index + 1}: {error}"
                warnings.append(warning)
                rejected.append({
                    "moduleId": module.get("moduleId"),
                    "label": module.get("label", ""),
                    "matchedText": phrase,
                    "reason": "module locate failed",
                    "error": str(error),
                })
                continue
        return {
            "provider": "locateanything",
            "modules": aligned,
            "rejectedModules": rejected,
            "warnings": warnings,
            "meta": {
                "model": self.args.model,
                "device": self.args.device,
                "generationMode": self.args.generation_mode,
                "maxNewTokens": self.args.max_new_tokens if self.args.max_new_tokens > 0 else None,
                "imageWidth": original_width,
                "imageHeight": original_height,
                "inferenceImageWidth": width,
                "inferenceImageHeight": height,
                "maxImageSide": self.args.max_image_side,
                "strategy": "per-module",
                "modelLoadSeconds": round(model_load_seconds, 3),
                "totalSeconds": round(time.perf_counter() - started_at, 3),
                "moduleTimings": module_timings,
            },
        }

    def try_batch_align(self, image, modules, width, height):
        anchors = ", ".join(f"{int(module.get('order') or index + 1):02d}" for index, module in enumerate(modules))
        phrase = sanitize_prompt_text(
            f"Locate all complete infographic cards marked {anchors}. "
            "Return one full card boundary box for each anchor in the same order. "
            "Each box must cover the complete card, not just the number.",
            max_chars=220,
        )
        try:
            result = self.locator.ground_gui(
                image,
                phrase,
                output_type="box",
                generation_mode=self.args.generation_mode,
                max_new_tokens=self.args.max_new_tokens if self.args.max_new_tokens > 0 else None,
                verbose=False,
            )
            answer = str(result.get("answer") or "")
            boxes = parse_boxes(answer, width, height)
            if len(boxes) < len(modules):
                return [], [], [f"batch locate returned {len(boxes)} boxes for {len(modules)} modules"]
            aligned = []
            rejected = []
            for index, module in enumerate(modules):
                box = normalize_raw_box(boxes[index])
                if not box:
                    rejected.append({
                        "moduleId": module.get("moduleId"),
                        "label": module.get("label", ""),
                        "matchedText": phrase,
                        "answer": answer,
                        "reason": "batch box invalid",
                    })
                    continue
                bounds = normalize_pixel_box(box, width, height)
                if not is_reasonable_bounds(bounds):
                    rejected.append({
                        "moduleId": module.get("moduleId"),
                        "label": module.get("label", ""),
                        "matchedText": phrase,
                        "answer": answer,
                        "bounds": bounds,
                        "reason": "batch box outside reasonable click area",
                    })
                    continue
                aligned.append({
                    "moduleId": module.get("moduleId"),
                    "label": module.get("label", ""),
                    "matchedText": phrase,
                    "bounds": bounds,
                    "confidence": 0.8,
                    "answer": answer,
                })
            if len(aligned) != len(modules):
                return aligned, rejected, ["batch locate did not produce valid boxes for every module"]
            return aligned, rejected, []
        except Exception as error:
            return [], [], [f"batch locate failed: {error}"]

    def ensure_locator(self):
        if self.locator:
            return
        try:
            from locateanything_worker import LocateAnythingWorker
        except Exception:
            from transformers import AutoModel, AutoProcessor, AutoTokenizer
            from transformers.utils import logging as transformers_logging
            import torch

            transformers_logging.disable_progress_bar()

            class LocateAnythingWorker:
                def __init__(self, model_path, device="cuda", dtype=torch.bfloat16):
                    self.device = device
                    self.dtype = dtype
                    self.tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
                    self.processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
                    self.model = AutoModel.from_pretrained(
                        model_path,
                        torch_dtype=dtype,
                        trust_remote_code=True,
                    ).to(device).eval()

                @torch.no_grad()
                def predict(self, image, question, generation_mode="hybrid", max_new_tokens=None, verbose=False):
                    question = sanitize_prompt_text(question, max_chars=700)
                    messages = [{
                        "role": "user",
                        "content": [
                            {"type": "image", "image": image},
                            {"type": "text", "text": question},
                        ],
                    }]
                    text = self.processor.py_apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                    if isinstance(text, (list, tuple)):
                        text = "\n".join(str(item) for item in text)
                    else:
                        text = str(text)
                    images, videos = self.processor.process_vision_info(messages)
                    processor_kwargs = {
                        "text": [text],
                        "images": images,
                        "return_tensors": "pt",
                    }
                    if videos:
                        processor_kwargs["videos"] = videos
                    inputs = self.processor(**processor_kwargs).to(self.device)
                    generate_kwargs = {
                        "pixel_values": inputs["pixel_values"].to(self.dtype),
                        "input_ids": inputs["input_ids"],
                        "attention_mask": inputs["attention_mask"],
                        "image_grid_hws": inputs.get("image_grid_hws", None),
                        "tokenizer": self.tokenizer,
                        "use_cache": True,
                        "generation_mode": generation_mode,
                        "temperature": 0.2,
                        "do_sample": False,
                        "verbose": verbose,
                    }
                    if max_new_tokens:
                        generate_kwargs["max_new_tokens"] = max_new_tokens
                    response = self.model.generate(
                        **generate_kwargs
                    )
                    return {"answer": response[0] if isinstance(response, tuple) else response}

                def ground_gui(self, image, phrase, output_type="box", **kwargs):
                    prompt = f"Locate the region that matches the following description: {phrase}."
                    if output_type == "point":
                        prompt = f"Point to: {phrase}."
                    return self.predict(image, prompt, **kwargs)

        import torch

        dtype_name = os.environ.get("CHATIMAGE_LOCATEANYTHING_DTYPE", "bfloat16").lower()
        dtype = torch.float16 if dtype_name in {"fp16", "float16"} else torch.bfloat16
        self.locator = LocateAnythingWorker(self.args.model, device=self.args.device, dtype=dtype)
        self.model_loaded = True


def build_module_phrase(module, index):
    order = int(module.get("order") or index + 1)
    number = f"{order:02d}"
    planned = module.get("plannedBounds") or {}
    location_hint = build_location_hint(planned)
    region_kind = sanitize_prompt_text(module.get("regionKind") or "card", max_chars=40)
    region_prompt = sanitize_prompt_text(module.get("regionPrompt") or "", max_chars=220)
    label = sanitize_prompt_text(module.get("label") or "", max_chars=80)
    text = sanitize_prompt_text(module.get("text") or "", max_chars=100)
    if region_prompt and region_kind != "card":
        return sanitize_prompt_text(
            (
                f"complete semantic {region_kind} region: {region_prompt}. "
                f"Include the whole visible footprint, not just label text or a small icon. {location_hint}"
            ),
            max_chars=300,
        )
    return sanitize_prompt_text(
        (
            f"full infographic card or separated visual region marked {number}; "
            f"label: {label}; text: {text}; complete boundary, not just the number or title. {location_hint}"
        ),
        max_chars=260,
    )


def resize_for_inference(image, max_side):
    try:
        max_side = int(max_side)
    except Exception:
        max_side = 0
    if max_side <= 0:
        return image
    width, height = image.size
    largest = max(width, height)
    if largest <= max_side:
        return image
    scale = max_side / largest
    resized = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(resized)


def build_location_hint(bounds):
    if not isinstance(bounds, dict):
        return ""
    try:
        x = float(bounds.get("x", 0)) + float(bounds.get("width", 0)) / 2
        y = float(bounds.get("y", 0)) + float(bounds.get("height", 0)) / 2
    except Exception:
        return ""
    horizontal = "left" if x < 0.34 else "right" if x > 0.66 else "center"
    vertical = "top" if y < 0.34 else "bottom" if y > 0.66 else "middle"
    return f"Rough position: {vertical}-{horizontal}."


def sanitize_prompt_text(value, max_chars=700):
    text = str(value or "")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0] or text[:max_chars]
    return text


def parse_boxes(answer, width, height):
    boxes = []
    for match in re.finditer(r"<box><(\d+)><(\d+)><(\d+)><(\d+)></box>", answer):
        x1, y1, x2, y2 = [int(value) for value in match.groups()]
        boxes.append({
            "x1": x1 / 1000 * width,
            "y1": y1 / 1000 * height,
            "x2": x2 / 1000 * width,
            "y2": y2 / 1000 * height,
        })
    return boxes


def choose_box(boxes):
    candidates = []
    for box in boxes:
        normalized = normalize_raw_box(box)
        if not normalized:
            continue
        left = normalized["x1"]
        right = normalized["x2"]
        top = normalized["y1"]
        bottom = normalized["y2"]
        if right <= left or bottom <= top:
            continue
        area = (right - left) * (bottom - top)
        candidates.append((area, {"x1": left, "y1": top, "x2": right, "y2": bottom}))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def normalize_raw_box(box):
    try:
        left = min(float(box["x1"]), float(box["x2"]))
        right = max(float(box["x1"]), float(box["x2"]))
        top = min(float(box["y1"]), float(box["y2"]))
        bottom = max(float(box["y1"]), float(box["y2"]))
    except Exception:
        return None
    if right <= left or bottom <= top:
        return None
    return {"x1": left, "y1": top, "x2": right, "y2": bottom}


def normalize_pixel_box(box, width, height):
    x = clamp(box["x1"] / width)
    y = clamp(box["y1"] / height)
    right = clamp(box["x2"] / width)
    bottom = clamp(box["y2"] / height)
    return {
        "x": round(x, 6),
        "y": round(y, 6),
        "width": round(max(0, right - x), 6),
        "height": round(max(0, bottom - y), 6),
    }


def is_reasonable_bounds(bounds):
    if bounds["width"] < 0.03 or bounds["height"] < 0.03:
        return False
    if bounds["width"] > 0.96 or bounds["height"] > 0.96:
        return False
    return True


def clamp(value):
    if not math.isfinite(value):
        return 0
    return max(0, min(1, value))


if __name__ == "__main__":
    main()
