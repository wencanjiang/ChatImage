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
import unicodedata

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TQDM_DISABLE", "1")

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


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
            write_jsonl({"id": request.get("id"), "result": result})
        except Exception as error:
            print(traceback.format_exc(), file=sys.stderr, flush=True)
            request_id = None
            try:
                request_id = json.loads(line).get("id")
            except Exception:
                pass
            write_jsonl({"id": request_id, "error": str(error)})


def write_jsonl(payload):
    print(json.dumps(payload, ensure_ascii=True), flush=True)


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
        # Use a context manager so the underlying file descriptor is released
        # even on Windows, where a held handle would block JS-side fs.rm of the
        # temp directory after the request completes.
        with Image.open(request["imagePath"]) as raw_image:
            original_image = raw_image.convert("RGB")
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
            phrases = build_module_phrases(module, index)
            matched_phrase = phrases[0]["text"] if phrases else build_module_phrase(module, index)
            try:
                module_started_at = time.perf_counter()
                locate_result = self.locate_module(image, width, height, module, phrases)
                module_seconds = time.perf_counter() - module_started_at
                answer = locate_result["answer"]
                boxes = locate_result["boxes"]
                box = locate_result["box"]
                matched_phrase = locate_result.get("matchedText") or matched_phrase
                module_timings.append({
                    "moduleId": module.get("moduleId"),
                    "seconds": round(module_seconds, 3),
                    "boxCount": len(boxes),
                    "strategy": locate_result["strategy"],
                    "phraseKind": locate_result.get("phraseKind"),
                    "candidateScore": locate_result.get("candidateScore"),
                    "candidateCount": locate_result.get("candidateCount"),
                })
                if not box:
                    rejected.append({
                        "moduleId": module.get("moduleId"),
                        "label": module.get("label", ""),
                        "matchedText": matched_phrase,
                        "answer": answer,
                        "reason": "no valid box",
                        "candidateDiagnostics": locate_result.get("candidateDiagnostics"),
                    })
                    continue
                bounds = normalize_pixel_box(box, width, height)
                if not is_reasonable_bounds(bounds):
                    rejected.append({
                        "moduleId": module.get("moduleId"),
                        "label": module.get("label", ""),
                        "matchedText": matched_phrase,
                        "answer": answer,
                        "bounds": bounds,
                        "reason": "box outside reasonable click area",
                        "candidateDiagnostics": locate_result.get("candidateDiagnostics"),
                    })
                    continue
                aligned.append({
                    "moduleId": module.get("moduleId"),
                    "label": module.get("label", ""),
                    "matchedText": matched_phrase,
                    "bounds": bounds,
                    "confidence": locate_result["confidence"],
                    "answer": answer,
                    "source": locate_result["source"],
                    "strategy": locate_result["strategy"],
                    "cropWindow": locate_result.get("cropWindow"),
                    "candidateScore": locate_result.get("candidateScore"),
                    "phraseKind": locate_result.get("phraseKind"),
                    "candidateDiagnostics": locate_result.get("candidateDiagnostics"),
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
                    "matchedText": matched_phrase,
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

    def locate_module(self, image, width, height, module, phrases):
        phrases = coerce_phrase_items(phrases)
        all_boxes = []
        answers = []
        candidates = []
        if should_prioritize_crop_locating(module):
            crop_result = self.locate_module_in_crop(image, width, height, module, phrases, candidates)
            if crop_result and crop_result.get("candidateScore", 0) >= 0.46:
                return crop_result

        max_full_queries = min(get_full_query_budget(module), len(phrases))
        for phrase_item in phrases[:max_full_queries]:
            answer, boxes, phrase_candidates = self.locate_with_phrase(
                image,
                width,
                height,
                module,
                phrase_item,
                source="locateanything",
                strategy=f"full-image:{phrase_item['kind']}",
            )
            answers.append(answer)
            all_boxes.extend(boxes)
            candidates.extend(phrase_candidates)
            best = choose_best_locate_candidate(candidates, module)
            if best and best["score"] >= 0.74 and not should_defer_candidate_for_crop(best, module):
                return format_candidate_result(best, answers, all_boxes, candidates)

        crop_result = None if should_prioritize_crop_locating(module) else self.locate_module_in_crop(image, width, height, module, phrases, candidates)
        if crop_result:
            best_full = choose_best_locate_candidate(candidates, module)
            if not best_full or crop_result.get("candidateScore", 0) >= best_full.get("score", 0) - 0.04:
                return crop_result

        best = choose_best_locate_candidate(candidates, module)
        if best and is_reasonable_bounds(best["bounds"]) and best["score"] >= 0.44:
            return format_candidate_result(best, answers, all_boxes, candidates)
        fallback_box = choose_box(all_boxes)
        return {
            "answer": "\n".join(answer for answer in answers if answer),
            "boxes": all_boxes,
            "box": fallback_box,
            "confidence": 0,
            "source": "locateanything",
            "strategy": "full-image-rejected",
            "matchedText": phrases[0]["text"] if phrases else "",
            "phraseKind": phrases[0]["kind"] if phrases else "",
            "candidateCount": len(candidates),
            "candidateDiagnostics": summarize_candidates(candidates),
        }

    def locate_with_phrase(self, image, width, height, module, phrase_item, source, strategy):
        result = self.locator.ground_gui(
            image,
            phrase_item["text"],
            output_type="box",
            generation_mode=self.args.generation_mode,
            max_new_tokens=self.args.max_new_tokens if self.args.max_new_tokens > 0 else None,
            verbose=False,
        )
        answer = str(result.get("answer") or "")
        boxes = parse_boxes(answer, width, height)
        candidates = build_locate_candidates(
            boxes,
            width,
            height,
            module,
            phrase_item,
            answer=answer,
            source=source,
            strategy=strategy,
        )
        return answer, boxes, candidates

    def locate_module_in_crop(self, image, width, height, module, phrases, existing_candidates=None):
        crop_window = build_crop_window(module.get("plannedBounds"), width, height)
        if not crop_window:
            return None
        crop = image.crop((crop_window["x1"], crop_window["y1"], crop_window["x2"], crop_window["y2"]))
        crop_width, crop_height = crop.size
        candidates = []
        answers = []
        mapped_boxes = []
        for phrase_item in coerce_phrase_items(phrases)[:2]:
            crop_phrase_item = {
                "kind": f"crop-{phrase_item['kind']}",
                "text": build_crop_module_phrase(module, phrase_item["text"]),
            }
            result = self.locator.ground_gui(
                crop,
                crop_phrase_item["text"],
                output_type="box",
                generation_mode=self.args.generation_mode,
                max_new_tokens=self.args.max_new_tokens if self.args.max_new_tokens > 0 else None,
                verbose=False,
            )
            answer = str(result.get("answer") or "")
            answers.append(answer)
            crop_boxes = parse_boxes(answer, crop_width, crop_height)
            for crop_box in crop_boxes:
                normalized_crop_box = normalize_raw_box(crop_box)
                if not normalized_crop_box:
                    continue
                full_crop = box_area_ratio(normalized_crop_box, crop_width, crop_height) > 0.88
                if full_crop:
                    mapped_box = dict(crop_window)
                else:
                    mapped_box = {
                        "x1": crop_window["x1"] + normalized_crop_box["x1"],
                        "y1": crop_window["y1"] + normalized_crop_box["y1"],
                        "x2": crop_window["x1"] + normalized_crop_box["x2"],
                        "y2": crop_window["y1"] + normalized_crop_box["y2"],
                    }
                mapped_boxes.append(mapped_box)
                candidates.extend(build_locate_candidates(
                    [mapped_box],
                    width,
                    height,
                    module,
                    crop_phrase_item,
                    answer=answer,
                    source="layout-guided-locateanything" if full_crop else "locateanything-crop",
                    strategy="planned-crop-window" if full_crop else f"planned-crop:{phrase_item['kind']}",
                    crop_window=normalize_pixel_box(crop_window, width, height),
                    full_crop=full_crop,
                ))
        best = choose_best_locate_candidate(candidates, module)
        if not best or not is_reasonable_bounds(best["bounds"]):
            return None
        merged_candidates = list(existing_candidates or []) + candidates
        return format_candidate_result(best, answers, mapped_boxes, merged_candidates)

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
                    inputs = self.build_processor_inputs(image, question)
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

                def build_processor_inputs(self, image, question):
                    last_error = None
                    for candidate_question, text_as_batch in [
                        (question, True),
                        (question, False),
                        (sanitize_tokenizer_safe_text(question), True),
                        (sanitize_tokenizer_ascii_fallback(question), True),
                    ]:
                        if not candidate_question:
                            continue
                        try:
                            messages = [{
                                "role": "user",
                                "content": [
                                    {"type": "image", "image": image},
                                    {"type": "text", "text": candidate_question},
                                ],
                            }]
                            text = self.processor.py_apply_chat_template(
                                messages,
                                tokenize=False,
                                add_generation_prompt=True,
                            )
                            images, videos = self.processor.process_vision_info(messages)
                            text_value = [str(text)] if text_as_batch else str(text)
                            processor_kwargs = {
                                "text": text_value,
                                "images": images,
                                "return_tensors": "pt",
                            }
                            if videos:
                                processor_kwargs["videos"] = videos
                            return self.processor(**processor_kwargs)
                        except TypeError as error:
                            if "TextEncodeInput" not in str(error):
                                raise
                            last_error = error
                    if last_error:
                        raise last_error
                    raise TypeError("LocateAnything processor failed to build inputs")

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


def _legacy_build_semantic_hint_unused(module):
    explicit = sanitize_prompt_text(module.get("semanticHint") or "", max_chars=180)
    if explicit:
        return explicit
    visual_mode = str(module.get("visualMode") or "").strip().lower()
    region_kind = str(module.get("regionKind") or "card").strip().lower()
    mask_policy = str(module.get("maskPolicy") or "").strip().lower()
    card_like_infographic = (
        visual_mode not in {"map", "scene", "poster"}
        and mask_policy not in {"route", "legend", "subject", "subject-with-label"}
        and region_kind in {"", "card", "area", "panel", "module"}
    )
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
        if not card_like_infographic and re.search(pattern, raw, re.IGNORECASE):
            keywords.append(phrase)
    parts = []
    if card_like_infographic:
        label = sanitize_prompt_text(module.get("label") or module.get("regionPrompt") or "target card", max_chars=80)
        text = sanitize_prompt_text(module.get("text") or "", max_chars=80)
        parts.append(f"infographic card or separated panel for {label}")
        if text:
            parts.append(f"visible text: {text}")
    elif ascii_text:
        parts.append(ascii_text)
    parts.extend(keywords)
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

def build_module_phrase(module, index):
    phrases = build_module_phrases(module, index)
    return phrases[0]["text"] if phrases else ""


def build_module_phrases(module, index):
    order = int(module.get("order") or index + 1)
    number = f"{order:02d}"
    label = sanitize_prompt_text(module.get("label") or module.get("regionPrompt") or "target", max_chars=90)
    text = sanitize_prompt_text(module.get("text") or "", max_chars=100)
    region_kind = sanitize_prompt_text(module.get("regionKind") or "card", max_chars=50)
    region_prompt = sanitize_prompt_text(module.get("regionPrompt") or "", max_chars=180)
    target = sanitize_prompt_text(module.get("targetDescription") or "", max_chars=220)
    semantic_hint = build_semantic_hint(module)
    location_hint = build_location_hint(module.get("plannedBounds") or {})
    queries = module.get("locatorQueries") if isinstance(module.get("locatorQueries"), list) else []
    visual_evidence = module.get("visualEvidence") if isinstance(module.get("visualEvidence"), list) else []
    items = []
    seen = set()

    def add(kind, text_value, max_chars=560):
        prompt = sanitize_prompt_text(text_value, max_chars=max_chars)
        if not prompt or prompt in seen:
            return
        seen.add(prompt)
        items.append({"kind": kind, "text": prompt})

    if is_card_like_infographic_module(module):
        add(
            "numbered-card",
            (
                f"Locate the complete separated infographic card or panel marked {number} for {label}. "
                "Return one box around the entire card footprint: boundary, title, icon area, body text, chips and status row. "
                "Use a small safety margin around the card edge. "
                "Do not return only the number badge, the heading strip, an arrow, or a neighboring card. "
                f"{location_hint}"
            ),
        )
        add(
            "title-card",
            (
                f"Locate the complete separated card or panel titled {label}. "
                f"Visible text clue: {text}. "
                "The box must cover the full panel boundary with a small safety margin, not just title text or a small internal block. "
                f"{location_hint}"
            ),
        )
        add(
            "semantic-card",
            (
                f"Target semantic card: {semantic_hint}. "
                "Find the full card-like visual region containing this title and its explanatory content. "
                "Prefer the whole visible footprint with slight surrounding space. "
                "Reject cross-panel header strips and unrelated nearby panels. "
                f"{location_hint}"
            ),
        )
    else:
        evidence_text = "; ".join(sanitize_prompt_text(value, max_chars=70) for value in visual_evidence[:4] if value)
        add(
            "semantic-region",
            (
                f"Locate the complete visible {region_kind} footprint for {label}. "
                f"Target: {semantic_hint}. "
                "Include the actual drawn object, area, route, landmark, or panel and its attached short label if that label belongs to the target. "
                "Return a slightly padded box so downstream segmentation can keep the full target outline. "
                "Do not return an unrelated legend, big title, empty background, or only detached text. "
                f"{location_hint}"
            ),
        )
        if region_prompt:
            add(
                "region-prompt",
                (
                    f"Locate this described visual region: {region_prompt}. "
                    f"Target name: {label}. "
                    "Return the whole visible footprint with surrounding boundary cues and slight context padding, not only text. "
                    f"{location_hint}"
                ),
            )
        if target or evidence_text:
            add(
                "target-contract",
                (
                    f"Ground the target using this contract: {target}. "
                    f"Must-see evidence: {evidence_text}. "
                    "Return one compact but slightly padded box covering all visible evidence for this target. "
                    f"{location_hint}"
                ),
            )
        for query_index, query in enumerate(queries[:2]):
            add(
                f"locator-query-{query_index + 1}",
                (
                    f"Find the target described as: {sanitize_prompt_text(query, max_chars=120)}. "
                    f"It corresponds to {label}. Return the complete visual target footprint with slight context padding, not a nearby label. "
                    f"{location_hint}"
                ),
            )
    if not items:
        add("fallback", f"Locate the described visual target {label}. {location_hint}")
    return items[:4]


def build_semantic_hint(module):
    explicit = sanitize_prompt_text(module.get("semanticHint") or "", max_chars=180)
    if explicit:
        return explicit
    primary_raw = " ".join(str(value or "") for value in [module.get("regionPrompt"), module.get("label")])
    contract_raw = " ".join(
        str(value or "")
        for value in (
            list(module.get("visualEvidence") or [])
            + list(module.get("locatorQueries") or [])
            + [module.get("maskPolicy"), module.get("spatialHint")]
        )
    )
    raw = " ".join(
        str(value or "")
        for value in [
            primary_raw,
            contract_raw,
            module.get("text"),
            module.get("detail"),
            module.get("sourceExcerpt"),
            module.get("regionKind"),
        ]
    )
    kind = str(module.get("regionKind") or "").lower()
    card_like = is_card_like_infographic_module(module)
    strong_hint = "" if card_like else build_strong_map_semantic_hint(kind, raw, f"{primary_raw} {contract_raw}")
    if strong_hint:
        return sanitize_prompt_text(strong_hint, max_chars=260)
    keyword_map = [
        (r"\u5c4f\u5e55|\u663e\u793a|\u89e6\u63a7|OLED|AMOLED|LTPO", "display screen touch panel"),
        (r"\u7535\u6c60|\u7eed\u822a|\u5145\u7535|\u9502|BMS", "battery pack power cell"),
        (r"\u4f20\u611f|\u5fc3\u7387|\u8840\u6c27|PPG|\u5065\u5eb7|\u6e29\u5ea6", "health sensor optical sensor"),
        (r"\u5916\u58f3|\u4e2d\u6846|\u9632\u62a4|\u949b|\u4e0d\u9508\u94a2|\u8868\u58f3", "protective watch case metal frame"),
        (r"\u8868\u5e26|\u8155\u5e26|\u5feb\u62c6|NFC", "watch strap band"),
        (r"\u82af\u7247|\u5904\u7406\u5668|\u4e3b\u677f|PCB|\u7535\u8def", "chip mainboard circuit board"),
        (r"\u6444\u50cf|\u955c\u5934|\u76f8\u673a|\u5149\u5b66", "camera lens optical module"),
        (r"\u897f\u6e56|\u6e56\u6c34|\u6e56\u9762|\u6c34\u57df|\u6e38\u8239", "lake water area boats"),
        (r"\u56fe\u4f8b|\u8272\u5757|legend|key", "map legend block swatches"),
        (r"\u6808\u9053|\u6d77\u5cb8|\u6b65\u9053|\u6e38\u7ebf|\u7ebf\u8def|\u8def\u7ebf|trail|route|walkway|coast", "visible trail route corridor"),
        (r"\u82cf\u5824|\u957f\u5824|\u767d\u5824|\u65ad\u6865|\u6865|\u5824", "causeway bridge route"),
        (r"\u4e09\u6f6d\u5370\u6708|\u6e56\u5fc3|\u5c9b|\u77f3\u5854", "lake island stone pagodas"),
        (r"\u96f7\u5cf0\u5854|\u5854|\u5efa\u7b51", "pagoda landmark building"),
        (r"\u8377\u82b1|\u690d\u7269|\u8fdc\u5c71|\u5c71|\u81ea\u7136|\u5cb8", "lotus plants mountains shoreline"),
        (r"\u5c55\u54c1|\u5c55\u89c8|\u88c5\u7f6e|\u827a\u672f\u54c1", "museum exhibit installation"),
        (r"\u89c2\u4f17|\u4eba\u7269|\u6e38\u5ba2|\u5c45\u6c11|\u4eba\u7fa4", "people visitors residents"),
        (r"\u673a\u5668\u4eba|\u5bfc\u89c8|\u52a9\u624b", "guide robot assistant"),
        (r"\u7a7a\u95f4|\u7ed3\u6784|\u573a\u9986", "spatial structure architecture"),
        (r"\u516c\u4ea4|\u4ea4\u901a|\u63a5\u9a73|\u9ad8\u94c1|\u5df4\u58eb|\u7d22\u9053|\u5730\u94c1|\u81ea\u884c\u8f66", "transport information legend panel"),
        (r"\u80fd\u6e90|\u592a\u9633\u80fd|\u98ce\u80fd|\u7535\u7f51", "clean energy infrastructure"),
    ]
    parts = []
    primary_source = primary_raw if primary_raw.strip() else raw
    for pattern, phrase in keyword_map:
        if (not card_like or pattern == keyword_map[0][0]) and re.search(pattern, primary_source, re.IGNORECASE):
            parts.append(phrase)
    if not parts and not card_like:
        for pattern, phrase in keyword_map:
            if re.search(pattern, raw, re.IGNORECASE):
                parts.append(phrase)
    ascii_source = f"{primary_raw} {contract_raw} {module.get('text') or ''}" if card_like else raw
    ascii_text = re.sub(r"[^A-Za-z0-9,.;:()/%+\- ]+", " ", ascii_source)
    ascii_text = re.sub(r"\s+", " ", ascii_text).strip()
    if not parts and is_useful_ascii_hint(ascii_text):
        parts.append(ascii_text)
    if not parts:
        parts.append(build_card_semantic_hint(module) if card_like else "the described visual element or separated region")
    return sanitize_prompt_text("; ".join(dict.fromkeys(parts)), max_chars=220)


def is_card_like_infographic_module(module):
    visual_mode = str(module.get("visualMode") or "").strip().lower()
    region_kind = str(module.get("regionKind") or "card").strip().lower()
    mask_policy = str(module.get("maskPolicy") or "").strip().lower()
    if visual_mode in {"map", "scene", "poster"}:
        return False
    if mask_policy in {"route", "legend", "subject", "subject-with-label"}:
        return False
    return region_kind in {"", "card", "area", "panel", "module"}


def build_card_semantic_hint(module):
    label = sanitize_prompt_text(module.get("label") or module.get("regionPrompt") or "target card", max_chars=90)
    text = sanitize_prompt_text(module.get("text") or "", max_chars=90)
    parts = [f"infographic card or separated panel for {label}"]
    if text:
        parts.append(f"visible text: {text}")
    return "; ".join(parts)


def build_strong_map_semantic_hint(kind, raw, primary_raw):
    primary = str(primary_raw or "")
    text = str(raw or "")
    if re.search(r"legend|panel|\u56fe\u4f8b|\u8272\u5757|key|info panel|guide panel", f"{kind} {primary}", re.IGNORECASE):
        return "complete compact information legend panel with icons labels"
    if re.search(r"\u5b64\u5c71", primary):
        return "Gushan hill island region: hill mass, shoreline, trees, pavilion or cultural building, not just the text label"
    if re.search(r"\u5b9d\u77f3\u5c71|\u4fdd\u4ff6\u5854", primary):
        return "Baoshi Hill ridge region with hill terrain, trees, and Baochu Pagoda if visible"
    if re.search(r"\u66f2\u9662\u98ce\u8377|\u8377\u5858|\u8377\u82b1", primary):
        return "lotus pond scenic garden region with lotus leaves, curved bridge, shoreline plants"
    if re.search(r"\u67f3\u6d6a\u95fb\u83ba|\u67f3\u6797|\u95fb\u83ba", primary):
        return "willow garden shoreline region with willow trees, path, and south/east lake bank"
    if re.search(r"\u4e09\u6f6d\u5370\u6708|\u6e56\u5fc3|\u77f3\u5854", primary):
        return "lake island and three stone pagodas landmark region"
    if re.search(r"\u96f7\u5cf0\u5854", primary):
        return "Leifeng Pagoda building landmark with nearby hill slope, not only the label"
    if re.search(r"route|\u6808\u9053|\u6d77\u5cb8|\u6b65\u9053|\u6e38\u7ebf|\u7ebf\u8def|\u8def\u7ebf|\u7d22\u9053|\u73af\u7ebf|trail|walkway|coast|corridor", f"{kind} {primary}", re.IGNORECASE):
        exact_name = extract_route_name(primary) or extract_route_name(text)
        side_hint = build_route_side_hint(primary or text)
        return "; ".join(
            part
            for part in [
                f"{exact_name} exact named route" if exact_name else "exact named route",
                "visible path line/corridor plus its attached short label if visible",
                "narrow footprint following the route, not a nearby bridge, generic path, or unrelated scenic label",
                side_hint,
            ]
            if part
        )
    if re.search(r"\u4ea4\u901a|\u63a5\u9a73|\u9ad8\u94c1|\u5df4\u58eb|\u7d22\u9053|\u8f66\u7ad9|transport|transit|bus|rail|station|cableway|ropeway", primary, re.IGNORECASE):
        return "transport information legend panel with route icons"
    if "building" in kind:
        return "visible building landmark icon and nearby short label"
    if "water" in kind:
        return "visible water area"
    if "landmark" in kind:
        return "visible landmark scenic region"
    if "mountain" in kind:
        return "visible mountain terrain scenic region"
    return ""


def extract_route_name(text):
    source = str(text or "")
    patterns = [
        r"([\u4e00-\u9fffA-Za-z0-9]{2,24}(?:\u6808\u9053|\u6b65\u9053|\u6e38\u7ebf|\u7ebf\u8def|\u8def\u7ebf|\u7d22\u9053|\u6d77\u5cb8|\u767d\u5824|\u82cf\u5824|\u65ad\u6865|\u6865|\u5824))",
        r"(West Coast Trail|Sunshine Coast Trail|coast trail|causeway|bridge|route|walkway)",
    ]
    for pattern in patterns:
        match = re.search(pattern, source, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


def build_route_side_hint(text):
    source = str(text or "")
    parts = []
    if re.search(r"\u4e1c\u4fa7|\u4e1c\u65b9|\u65e5\u51fa|east|right", source, re.IGNORECASE):
        parts.append("east/right side")
    if re.search(r"\u897f\u4fa7|\u65e5\u843d|west|left", source, re.IGNORECASE):
        parts.append("west/left side")
    if re.search(r"\u5357|south|lower", source, re.IGNORECASE):
        parts.append("south/lower side")
    if re.search(r"\u5317|north|upper", source, re.IGNORECASE):
        parts.append("north/upper side")
    return f"rough spatial cue: {', '.join(dict.fromkeys(parts))}" if parts else ""


def build_crop_module_phrase(module, fallback_phrase):
    region_kind = sanitize_prompt_text(module.get("regionKind") or "region", max_chars=40)
    label = sanitize_prompt_text(module.get("label") or "", max_chars=90)
    region_prompt = sanitize_prompt_text(module.get("regionPrompt") or "", max_chars=160)
    semantic_hint = build_semantic_hint(module)
    location_hint = build_location_hint(module.get("plannedBounds") or {})
    prompt = " ".join(
        part
        for part in [
            "The search image is already cropped around the expected target.",
            f"Locate only the visible {region_kind} footprint inside this crop.",
            f"Target name: {label}." if label else "",
            f"Original visual description: {region_prompt}." if region_prompt else "",
            f"Target hint: {semantic_hint}." if semantic_hint else "",
            location_hint,
            "Return a box around the whole target with a small safety margin for segmentation.",
            "Do not return the whole crop unless the target genuinely fills it.",
            "Do not return only a text label, icon, number, or tiny detail.",
            f"Original instruction: {fallback_phrase}",
        ]
        if part
    )
    return sanitize_prompt_text(prompt, max_chars=560)


def coerce_phrase_items(phrases):
    if isinstance(phrases, str):
        return [{"kind": "legacy", "text": sanitize_prompt_text(phrases, max_chars=560)}]
    items = []
    for index, item in enumerate(phrases or []):
        if isinstance(item, str):
            text = item
            kind = f"phrase-{index + 1}"
        elif isinstance(item, dict):
            text = item.get("text") or item.get("prompt") or ""
            kind = item.get("kind") or f"phrase-{index + 1}"
        else:
            continue
        text = sanitize_prompt_text(text, max_chars=560)
        if text:
            items.append({"kind": sanitize_prompt_text(kind, max_chars=50), "text": text})
    return items or [{"kind": "fallback", "text": "Locate the complete described visual target."}]


def build_locate_candidates(boxes, width, height, module, phrase_item, answer="", source="locateanything", strategy="full-image", crop_window=None, full_crop=False):
    candidates = []
    for raw_box in boxes:
        box = normalize_raw_box(raw_box)
        if not box:
            continue
        bounds = normalize_pixel_box(box, width, height)
        score, reasons = score_locate_bounds(bounds, module, source=source, full_crop=full_crop)
        candidates.append({
            "box": box,
            "bounds": bounds,
            "score": score,
            "reasons": reasons,
            "answer": answer,
            "source": source,
            "strategy": strategy,
            "phraseKind": phrase_item.get("kind") or "",
            "matchedText": phrase_item.get("text") or "",
            "cropWindow": crop_window,
            "fullCrop": bool(full_crop),
        })
    return candidates


def choose_best_locate_candidate(candidates, module=None):
    valid = [candidate for candidate in candidates or [] if candidate.get("box") and isinstance(candidate.get("bounds"), dict)]
    if not valid:
        return None
    valid.sort(key=lambda candidate: (candidate.get("score", 0), normalized_bounds_area(candidate["bounds"])), reverse=True)
    return valid[0]


def format_candidate_result(best, answers, boxes, all_candidates):
    return {
        "answer": best.get("answer") or "\n".join(answer for answer in answers if answer),
        "boxes": boxes,
        "box": best["box"],
        "confidence": confidence_from_score(best.get("score", 0), best.get("source", "")),
        "source": best.get("source") or "locateanything",
        "strategy": best.get("strategy") or "",
        "cropWindow": best.get("cropWindow"),
        "matchedText": best.get("matchedText") or "",
        "phraseKind": best.get("phraseKind") or "",
        "candidateScore": round(float(best.get("score") or 0), 3),
        "candidateCount": len(all_candidates or []),
        "candidateDiagnostics": summarize_candidates(all_candidates),
    }


def score_locate_bounds(bounds, module, source="locateanything", full_crop=False):
    reasons = []
    if not isinstance(bounds, dict) or not is_reasonable_bounds(bounds):
        return 0.02, ["unreasonable-bounds"]
    area = normalized_bounds_area(bounds)
    aspect = bounds["width"] / max(0.001, bounds["height"])
    score = 0.52
    if source == "locateanything-crop":
        score += 0.08
        reasons.append("crop-search")
    if source == "layout-guided-locateanything":
        score -= 0.07
        reasons.append("layout-guided")
    if full_crop:
        score -= 0.04
        reasons.append("full-crop")
    planned = normalize_bounds_dict(module.get("plannedBounds") if isinstance(module, dict) else None)
    card_like = is_card_like_infographic_module(module or {})
    route_like = is_route_like_module(module or {})
    subject_like = is_subject_like_module(module or {})
    if planned:
        planned_area = normalized_bounds_area(planned)
        overlap = bounds_intersection_area(bounds, planned)
        min_overlap = overlap / max(0.001, min(area, planned_area))
        iou = overlap / max(0.001, area + planned_area - overlap)
        center_score = 1 - min(1, bounds_center_distance(bounds, planned) / max(0.18, bounds_diag(planned) * 1.35))
        score += 0.18 * max(0, min(1, min_overlap))
        score += 0.16 * max(0, center_score)
        score += 0.10 * max(0, min(1, iou * 2.2))
        reasons.append(f"overlap={min_overlap:.2f}")
        area_ratio = area / max(0.001, planned_area)
        if card_like:
            if 0.48 <= area_ratio <= 1.9:
                score += 0.13
                reasons.append("card-area-match")
            elif area_ratio < 0.24:
                score -= 0.28
                reasons.append("too-small-for-card")
            elif area_ratio > 2.25:
                score -= 0.26
                reasons.append("too-large-for-card")
            if bounds["width"] > planned["width"] * 1.55 and bounds["height"] < planned["height"] * 0.68:
                score -= 0.32
                reasons.append("cross-panel-strip")
            if bounds["height"] < planned["height"] * 0.36 and bounds["width"] >= planned["width"] * 0.75:
                score -= 0.26
                reasons.append("header-strip")
            if min_overlap < 0.18 and source != "locateanything-crop":
                score -= 0.18
                reasons.append("far-from-plan")
        elif not route_like:
            if area_ratio > 3.2:
                score -= 0.20
                reasons.append("oversized-vs-plan")
            if min_overlap < 0.08:
                score -= 0.14
                reasons.append("weak-plan-overlap")
            if subject_like:
                if area_ratio < 0.12:
                    score -= 0.34
                    reasons.append("too-small-for-subject")
                elif 0.18 <= area_ratio <= 1.9:
                    score += 0.08
                    reasons.append("subject-area-match")
    if card_like:
        if area < 0.018:
            score -= 0.26
            reasons.append("tiny-card")
        if area > 0.48:
            score -= 0.22
            reasons.append("huge-card")
        if aspect > 3.1 and area < 0.12:
            score -= 0.28
            reasons.append("thin-horizontal-card")
        if aspect < 0.28:
            score -= 0.18
            reasons.append("thin-vertical-card")
    elif route_like:
        if aspect > 2.0 or aspect < 0.5:
            score += 0.06
            reasons.append("route-like-aspect")
        if area > 0.32:
            score -= 0.20
            reasons.append("route-too-large")
    else:
        if subject_like:
            if area < 0.012:
                score -= 0.24
                reasons.append("tiny-subject")
            if min(float(bounds.get("width", 0)), float(bounds.get("height", 0))) < 0.075:
                score -= 0.18
                reasons.append("subject-dimension-too-small")
        elif area < 0.006:
            score -= 0.18
            reasons.append("tiny-region")
        if area > 0.62:
            score -= 0.26
            reasons.append("huge-region")
    return max(0.0, min(0.98, score)), reasons


def should_defer_candidate_for_crop(candidate, module):
    bounds = candidate.get("bounds") if isinstance(candidate, dict) else None
    if not isinstance(bounds, dict):
        return False
    if not is_subject_like_module(module or {}):
        return False
    reasons = candidate.get("reasons") or []
    if any(reason in reasons for reason in ("too-small-for-subject", "tiny-subject", "subject-dimension-too-small")):
        return True
    planned = normalize_bounds_dict(module.get("plannedBounds") if isinstance(module, dict) else None)
    area = normalized_bounds_area(bounds)
    if area < 0.012:
        return True
    if planned:
        planned_area = normalized_bounds_area(planned)
        if planned_area > 0 and area / planned_area < 0.14:
            return True
    return False


def is_route_like_module(module):
    text = " ".join(str(value or "") for value in [module.get("regionKind"), module.get("maskPolicy"), module.get("label"), module.get("regionPrompt")])
    return bool(re.search(r"route|trail|walkway|coast|\u6808\u9053|\u6b65\u9053|\u6e38\u7ebf|\u7ebf\u8def|\u8def\u7ebf|\u7d22\u9053|\u6865|\u5824", text, re.IGNORECASE))


def should_prioritize_crop_locating(module):
    if not normalize_bounds_dict(module.get("plannedBounds") if isinstance(module, dict) else None):
        return False
    visual_mode = str(module.get("visualMode") or "").strip().lower()
    kind = str(module.get("regionKind") or "").strip().lower()
    policy = str(module.get("maskPolicy") or "").strip().lower()
    if visual_mode in {"map", "scene", "poster"}:
        return True
    if kind in {"landmark", "building", "mountain", "water", "route", "legend", "district", "area", "foreground", "background"}:
        return True
    if policy in {"full-region", "route", "legend", "subject-with-label"} and not is_card_like_infographic_module(module):
        return True
    return False


def get_full_query_budget(module):
    if should_prioritize_crop_locating(module):
        return 1
    if is_route_like_module(module) or is_subject_like_module(module):
        return 2
    return 3


def is_subject_like_module(module):
    text = " ".join(
        str(value or "")
        for value in [
            module.get("regionKind"),
            module.get("maskPolicy"),
            module.get("label"),
            module.get("regionPrompt"),
            module.get("text"),
        ]
    )
    return bool(
        re.search(
            r"object-with-label|subject-with-label|\bobject\b|\bperson\b|\bpeople\b|\bproduct\b|robot|guide|visitor|观众|人物|机器人|导览|展品|主体|标签",
            text,
            re.IGNORECASE,
        )
    )


def summarize_candidates(candidates, limit=6):
    summary = []
    for candidate in sorted(candidates or [], key=lambda item: item.get("score", 0), reverse=True)[:limit]:
        summary.append({
            "score": round(float(candidate.get("score") or 0), 3),
            "source": candidate.get("source"),
            "strategy": candidate.get("strategy"),
            "phraseKind": candidate.get("phraseKind"),
            "bounds": candidate.get("bounds"),
            "reasons": candidate.get("reasons", [])[:5],
        })
    return summary


def confidence_from_score(score, source=""):
    value = 0.48 + max(0, min(1, float(score or 0))) * 0.43
    if source == "layout-guided-locateanything":
        # layout-guided 是用规划布局兜底引导的弱结果，可信度天然偏低。旧逻辑用
        # min(value, 0.68) 硬截断，会把 score 0.47~1.0 的候选全部压成同一个 0.68，
        # 丢失区分度。改为映射进 [0.40, 0.66] 的单调区间：整体仍偏低，但保留不同
        # score 之间的相对差异，便于排序与诊断。
        value = 0.40 + max(0, min(1, float(score or 0))) * 0.26
    return round(max(0.0, min(0.92, value)), 3)


def normalize_bounds_dict(bounds):
    if not isinstance(bounds, dict):
        return None
    try:
        x = float(bounds.get("x", 0))
        y = float(bounds.get("y", 0))
        width = float(bounds.get("width", bounds.get("w", 0)))
        height = float(bounds.get("height", bounds.get("h", 0)))
    except Exception:
        return None
    if width <= 0 or height <= 0:
        return None
    return {
        "x": max(0.0, min(1.0, x)),
        "y": max(0.0, min(1.0, y)),
        "width": max(0.0, min(1.0, width)),
        "height": max(0.0, min(1.0, height)),
    }


def normalized_bounds_area(bounds):
    return max(0.0, float(bounds.get("width", 0))) * max(0.0, float(bounds.get("height", 0)))


def bounds_intersection_area(a, b):
    left = max(float(a["x"]), float(b["x"]))
    top = max(float(a["y"]), float(b["y"]))
    right = min(float(a["x"]) + float(a["width"]), float(b["x"]) + float(b["width"]))
    bottom = min(float(a["y"]) + float(a["height"]), float(b["y"]) + float(b["height"]))
    return max(0.0, right - left) * max(0.0, bottom - top)


def bounds_center_distance(a, b):
    ax = float(a["x"]) + float(a["width"]) / 2
    ay = float(a["y"]) + float(a["height"]) / 2
    bx = float(b["x"]) + float(b["width"]) / 2
    by = float(b["y"]) + float(b["height"]) / 2
    return math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)


def bounds_diag(bounds):
    return math.sqrt(float(bounds.get("width", 0)) ** 2 + float(bounds.get("height", 0)) ** 2)


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


def build_crop_window(bounds, width, height):
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
    pad_x = max(0.035, min(0.12, w * 0.35))
    pad_y = max(0.035, min(0.12, h * 0.35))
    left = max(0.0, x - pad_x)
    top = max(0.0, y - pad_y)
    right = min(1.0, x + w + pad_x)
    bottom = min(1.0, y + h + pad_y)
    x1 = max(0, min(width - 1, int(round(left * width))))
    y1 = max(0, min(height - 1, int(round(top * height))))
    x2 = max(x1 + 1, min(width, int(round(right * width))))
    y2 = max(y1 + 1, min(height, int(round(bottom * height))))
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}


def sanitize_prompt_text(value, max_chars=700):
    text = str(value or "")
    text = sanitize_tokenizer_safe_text(text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0] or text[:max_chars]
    return text


def sanitize_tokenizer_safe_text(value):
    text = str(value or "")
    text = unicodedata.normalize("NFKC", text)
    text = text.encode("utf-8", "ignore").decode("utf-8", "ignore")
    text = re.sub(r"[\ud800-\udfff\ufffd]", " ", text)
    return text


def sanitize_tokenizer_ascii_fallback(value):
    text = sanitize_tokenizer_safe_text(value)
    text = re.sub(r"[^A-Za-z0-9,.;:()/%+\- ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "Locate the complete described visual target."


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


def box_area_ratio(box, width, height):
    normalized = normalize_raw_box(box)
    if not normalized:
        return 1
    area = max(0, normalized["x2"] - normalized["x1"]) * max(0, normalized["y2"] - normalized["y1"])
    total = max(1, width * height)
    return area / total


def clamp(value):
    if not math.isfinite(value):
        return 0
    return max(0, min(1, value))


if __name__ == "__main__":
    main()
