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
                error_trace = traceback.format_exc()
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
                    "trace": error_trace,
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
            from transformers import AutoModel, AutoProcessor
            from transformers.utils import logging as transformers_logging
            import torch

            transformers_logging.disable_progress_bar()

            class LocateAnythingWorker:
                def __init__(self, model_path, device="cuda", dtype=torch.bfloat16):
                    self.device = device
                    self.dtype = dtype
                    self.processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
                    self.model = AutoModel.from_pretrained(
                        model_path,
                        trust_remote_code=True,
                        torch_dtype=dtype,
                    ).to(device)
                    self.model.eval()

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
                    text = self.processor.py_apply_chat_template(
                        messages,
                        tokenize=False,
                        add_generation_prompt=True,
                    )
                    images, videos = self.processor.process_vision_info(messages)
                    processor_kwargs = {
                        "text": [str(text)],
                        "images": images,
                        "return_tensors": "pt",
                    }
                    if videos:
                        processor_kwargs["videos"] = videos
                    inputs = self.processor(**processor_kwargs)
                    model_inputs = {}
                    for key, value in inputs.items():
                        if hasattr(value, "to"):
                            model_inputs[key] = value.to(self.device)
                        else:
                            model_inputs[key] = value
                    pixel_values = model_inputs.get("pixel_values")
                    if pixel_values is not None:
                        model_inputs["pixel_values"] = pixel_values.to(self.dtype)
                    model_inputs.update({
                        "tokenizer": self.processor.tokenizer,
                        "generation_mode": generation_mode,
                        "use_cache": True,
                        "temperature": 0.0,
                        "do_sample": False,
                        "verbose": verbose,
                    })
                    if max_new_tokens:
                        model_inputs["max_new_tokens"] = max_new_tokens
                    response = self.model.generate(**model_inputs)
                    return {"answer": extract_model_answer(response)}

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
    semantic_hint = build_semantic_hint(module)
    if region_prompt and region_kind != "card":
        return sanitize_prompt_text(
            (
                f"complete semantic {region_kind} region; target: {semantic_hint}. "
                f"Include the whole visible footprint, not just label text or a small icon. {location_hint}"
            ),
            max_chars=300,
        )
    return sanitize_prompt_text(
        (
            f"full infographic card or separated visual region marked {number}; "
            f"target: {semantic_hint}; complete boundary, not just the number or title. {location_hint}"
        ),
        max_chars=260,
    )


def build_semantic_hint(module):
    explicit = sanitize_prompt_text(module.get("semanticHint") or "", max_chars=180)
    if explicit:
        return explicit
    raw = " ".join(
        str(value or "")
        for value in [
            module.get("regionPrompt"),
            module.get("label"),
            module.get("text"),
            module.get("regionKind"),
        ]
    )
    ascii_text = re.sub(r"[^A-Za-z0-9,.;:()/%+\- ]+", " ", raw)
    ascii_text = re.sub(r"\s+", " ", ascii_text).strip()
    keywords = []
    keyword_map = [
        (r"屏幕|显示|触控|OLED|AMOLED|LTPO", "display screen touch panel"),
        (r"电池|续航|充电|锂|BMS", "battery pack power cell"),
        (r"传感|心率|血氧|PPG|健康|温度", "health sensor optical sensor"),
        (r"外壳|中框|防护|钛|不锈钢|表壳", "protective watch case metal frame"),
        (r"表带|腕带|快拆|NFC", "watch strap band"),
        (r"芯片|处理器|主板|PCB|电路", "chip mainboard circuit board"),
        (r"摄像|镜头|相机|光学", "camera lens optical module"),
        (r"西湖|湖水|湖面|水域|游船", "lake water area boats"),
        (r"白堤|断桥|桥|堤", "causeway bridge route"),
        (r"苏堤|长堤|路线|步道", "long causeway walking route"),
        (r"三潭印月|湖心|岛|石塔", "lake island stone pagodas"),
        (r"雷峰塔|塔|建筑", "pagoda landmark building"),
        (r"荷花|植物|远山|山|自然|岸", "lotus plants mountains shoreline"),
        (r"展品|展览|装置|艺术品", "museum exhibit installation"),
        (r"观众|人物|游客|居民|人群", "people visitors residents"),
        (r"机器人|导览|助手", "guide robot assistant"),
        (r"空间|结构|场馆", "spatial structure architecture"),
        (r"公交|交通|地铁|自行车", "public transport mobility"),
        (r"能源|太阳能|风能|电网", "clean energy infrastructure"),
    ]
    for pattern, phrase in keyword_map:
        if re.search(pattern, raw, re.IGNORECASE):
            keywords.append(phrase)
    parts = []
    if ascii_text:
        parts.append(ascii_text)
    parts.extend(keywords)
    if not parts:
        parts.append("the described visual element or separated region")
    return sanitize_prompt_text("; ".join(dict.fromkeys(parts)), max_chars=180)


def build_semantic_hint(module):
    raw = " ".join(
        str(value or "")
        for value in [
            module.get("regionPrompt"),
            module.get("label"),
            module.get("text"),
            module.get("regionKind"),
        ]
    )
    ascii_text = re.sub(r"[^A-Za-z0-9,.;:()/%+\- ]+", " ", raw)
    ascii_text = re.sub(r"\s+", " ", ascii_text).strip()
    keywords = []
    keyword_map = [
        (r"\u5c4f\u5e55|\u663e\u793a|\u89e6\u63a7|OLED|AMOLED|LTPO", "display screen touch panel"),
        (r"\u7535\u6c60|\u7eed\u822a|\u5145\u7535|\u9502|BMS", "battery pack power cell"),
        (r"\u4f20\u611f|\u5fc3\u7387|\u8840\u6c27|PPG|\u5065\u5eb7|\u6e29\u5ea6", "health sensor optical sensor"),
        (r"\u5916\u58f3|\u4e2d\u6846|\u9632\u62a4|\u949b|\u4e0d\u9508\u94a2|\u8868\u58f3", "protective watch case metal frame"),
        (r"\u8868\u5e26|\u8155\u5e26|\u5feb\u62c6|NFC", "watch strap band"),
        (r"\u82af\u7247|\u5904\u7406\u5668|\u4e3b\u677f|PCB|\u7535\u8def", "chip mainboard circuit board"),
        (r"\u6444\u50cf|\u955c\u5934|\u76f8\u673a|\u5149\u5b66", "camera lens optical module"),
        (r"\u897f\u6e56|\u6e56\u6c34|\u6e56\u9762|\u6c34\u57df|\u6e38\u8239", "lake water area boats"),
        (r"\u767d\u5824|\u65ad\u6865|\u6865|\u5824", "causeway bridge route"),
        (r"\u82cf\u5824|\u957f\u5824|\u8def\u7ebf|\u6b65\u9053", "long causeway walking route"),
        (r"\u4e09\u6f6d\u5370\u6708|\u6e56\u5fc3|\u5c9b|\u77f3\u5854", "lake island stone pagodas"),
        (r"\u96f7\u5cf0\u5854|\u5854|\u5efa\u7b51", "pagoda landmark building"),
        (r"\u8377\u82b1|\u690d\u7269|\u8fdc\u5c71|\u5c71|\u81ea\u7136|\u5cb8", "lotus plants mountains shoreline"),
        (r"\u5c55\u54c1|\u5c55\u89c8|\u88c5\u7f6e|\u827a\u672f\u54c1", "museum exhibit installation"),
        (r"\u89c2\u4f17|\u4eba\u7269|\u6e38\u5ba2|\u5c45\u6c11|\u4eba\u7fa4", "people visitors residents"),
        (r"\u673a\u5668\u4eba|\u5bfc\u89c8|\u52a9\u624b", "guide robot assistant"),
        (r"\u7a7a\u95f4|\u7ed3\u6784|\u573a\u9986", "spatial structure architecture"),
        (r"\u516c\u4ea4|\u4ea4\u901a|\u5730\u94c1|\u81ea\u884c\u8f66", "public transport mobility"),
        (r"\u80fd\u6e90|\u592a\u9633\u80fd|\u98ce\u80fd|\u7535\u7f51", "clean energy infrastructure"),
    ]
    for pattern, phrase in keyword_map:
        if re.search(pattern, raw, re.IGNORECASE):
            keywords.append(phrase)
    parts = []
    parts.extend(keywords)
    if is_useful_ascii_hint(ascii_text):
        parts.append(ascii_text)
    if not parts:
        parts.append("the described visual element or separated region")
    return sanitize_prompt_text("; ".join(dict.fromkeys(parts)), max_chars=180)


def is_useful_ascii_hint(text):
    value = str(text or "").strip()
    if len(value) < 4:
        return False
    words = re.findall(r"[A-Za-z][A-Za-z0-9+\-/%]{2,}", value)
    if not words:
        return False
    weak = {"area", "frame", "oled", "nfc", "pcb", "bms", "ltpo", "amoled"}
    strong_words = [word for word in words if word.lower() not in weak]
    return len(strong_words) >= 2 or (len(strong_words) == 1 and len(strong_words[0]) >= 6)


_build_semantic_hint_from_text = build_semantic_hint


def build_semantic_hint(module):
    explicit = sanitize_prompt_text(module.get("semanticHint") or "", max_chars=180)
    if explicit:
        return explicit
    return _build_semantic_hint_from_text(module)


def extract_model_answer(response):
    if isinstance(response, str):
        return response
    if isinstance(response, tuple):
        return extract_model_answer(response[0] if response else "")
    if isinstance(response, dict):
        if "generated_text" in response:
            return extract_model_answer(response.get("generated_text"))
        content = response.get("content")
        if isinstance(content, str):
            return content
        return extract_model_answer(response.get("answer") or response.get("text") or content or "")
    if isinstance(response, list):
        if not response:
            return ""
        for item in reversed(response):
            if isinstance(item, dict) and item.get("role") == "assistant":
                return extract_model_answer(item.get("content") or item)
        return extract_model_answer(response[-1])
    return str(response)


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
