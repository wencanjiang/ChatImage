# ChatImage Vision Endpoint Contract

ChatImage uses a second pass to align transparent hotspots with the real image. The vision endpoint must be independent from the text-only LLM endpoint because it must read `image_url` content.

## Environment

```text
CHATIMAGE_VISION_MODE=local-ocr
CHATIMAGE_VISION_ENDPOINT=
CHATIMAGE_VISION_API_KEY=
CHATIMAGE_VISION_MODEL=
CHATIMAGE_VISION_AUTH_MODE=bearer
CHATIMAGE_VISION_REQUEST_FORMAT=openai-chat
CHATIMAGE_LOCAL_OCR_PYTHON=python
CHATIMAGE_LOCAL_OCR_TIMEOUT_MS=30000
CHATIMAGE_LOCAL_OCR_MAX_IMAGE_BYTES=8388608
CHATIMAGE_LOCATEANYTHING_LICENSE_ACK=
CHATIMAGE_LOCATEANYTHING_PYTHON=C:\Users\YOUR_NAME\miniconda3\envs\chatimage\python.exe
CHATIMAGE_LOCATEANYTHING_MODEL=nvidia/LocateAnything-3B
CHATIMAGE_LOCATEANYTHING_DEVICE=cuda
CHATIMAGE_LOCATEANYTHING_TIMEOUT_MS=120000
CHATIMAGE_LOCATEANYTHING_MAX_NEW_TOKENS=
CHATIMAGE_LOCATEANYTHING_MAX_IMAGE_SIDE=960
CHATIMAGE_LOCATEANYTHING_GENERATION_MODE=hybrid
```

`CHATIMAGE_VISION_MODE=local-ocr` is the MVP default. It runs a local Python OCR worker and does not call a remote vision model.

`CHATIMAGE_VISION_MODE=locateanything` enables the optional local GPU LocateAnything provider. This mode is intended only for non-commercial research/evaluation use: the Eagle/LocateAnything code is Apache 2.0, but the `nvidia/LocateAnything-3B` model weights are governed by the NVIDIA License. ChatImage will not load the worker unless `CHATIMAGE_LOCATEANYTHING_LICENSE_ACK=research-evaluation` is set explicitly.

LocateAnything uses a persistent JSONL worker at `scripts/locateanything_worker.py`; it does not open another browser or HTTP port. The worker returns boxes in normalized `0..1` bounds after converting the model's `[0,1000]` box format. Failed modules can fall back to `local-ocr` and then planned layout bounds when planned bounds are available.

`CHATIMAGE_LOCATEANYTHING_MAX_NEW_TOKENS` is optional. Leave it empty for normal use so ChatImage does not impose a generation token cap on LocateAnything; set a positive integer only for temporary debugging.

`CHATIMAGE_LOCATEANYTHING_MAX_IMAGE_SIDE` controls the image size used for local LocateAnything inference. The default `960` keeps relative hotspot coordinates stable while avoiding slow full-resolution inference on generated images.

`CHATIMAGE_VISION_API_KEY` is used only for remote vision modes and can be omitted only when the same `CHATIMAGE_API_KEY` is valid for the vision endpoint.

`CHATIMAGE_VISION_REQUEST_FORMAT` controls the upstream request body:

- `wuyin-form` sends the same form-encoded shape as the configured text endpoint, plus `image_url`, `imageUrl`, and `images` fields for the image.
- `openai-chat` sends OpenAI-compatible chat completions with `messages[].content[]` containing `text` and `image_url`.

`CHATIMAGE_VISION_AUTH_MODE` controls the upstream auth header:

- `bearer` sends `Authorization: Bearer <key>` and is the default for OpenAI-compatible providers.
- `api-key` sends `api-key: <key>` for Azure-style endpoints.
- `azure` is an alias of `api-key`.
- `none` sends no auth header and should only be used for a private trusted adapter.

## Request Shape

ChatImage's local `/api/vision` proxy requires the generated image URL and real pixel dimensions:

```json
{
  "purpose": "vision_align",
  "responseFormat": "json",
  "imageUrl": "https://example.com/generated.png",
  "imageWidth": 1536,
  "imageHeight": 1024,
  "content": "alignment prompt..."
}
```

`imageWidth` and `imageHeight` must be integers greater than or equal to `16`. The server rejects invalid dimensions before forwarding the request, because normalized hotspot bounds must be interpreted against the real generated image size.

When `CHATIMAGE_VISION_REQUEST_FORMAT=openai-chat`, the server sends an OpenAI-compatible chat completions request upstream:

```json
{
  "model": "your_vision_model",
  "purpose": "vision_align",
  "response_format": { "type": "json_object" },
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "alignment prompt..." },
        { "type": "image_url", "image_url": { "url": "https://example.com/generated.png" } }
      ]
    }
  ]
}
```

When `CHATIMAGE_VISION_REQUEST_FORMAT=wuyin-form`, the server sends a form-encoded request to the GPT5.5 endpoint with the same auth style as the text API. The form includes `content`, `model`, `key`, `purpose`, `response_format`, `image_url`, `imageUrl`, and `images`.

The endpoint must return normal chat-completions content in one of these supported fields:

- `choices[0].message.content`
- `choices[0].text`
- `data.choices[0].message.content`
- `data.content`
- `content`

## Alignment Response

The content must be JSON, or a fenced JSON block, with a `modules` array:

Local OCR responses should also include `matchedText` for each module plus top-level `ocrRaw` and `warnings` arrays so the frontend debug panel can show how each hotspot was matched.

LocateAnything responses may include top-level `provider`, `providerChain`, `locateAnythingRaw`, `acceptedModules`, `rejectedModules`, `fallbackModules`, `warnings`, and `displayDiagnostics`. The basic hotspot structure remains the same: every aligned module still returns `moduleId`, `label`, `bounds`, and `confidence`.

```json
{
  "modules": [
    {
      "moduleId": "module_1",
      "label": "目标识别",
      "bounds": { "x": 0.08, "y": 0.24, "width": 0.24, "height": 0.32 },
      "confidence": 0.9
    }
  ]
}
```

Rules:

- `moduleId` must match the module ids in ChatImage's structured spec.
- `bounds` are normalized coordinates from `0` to `1`, relative to the full generated image.
- Each requested module must appear exactly once.
- `confidence` must be at least `0.5`.
- Bounds must stay inside the image and pass layout validation: safe margin, minimum click area, and no overlapping module regions.
- Image URLs sent to the vision proxy must be public `http(s)` URLs or `data:image` URLs. Localhost and common private IP ranges are rejected before the request is forwarded.
- `/api/vision` alignment requests must include `imageWidth` and `imageHeight`; health checks do not require dimensions.

## Health Check

After configuring the endpoint:

```powershell
$env:CHATIMAGE_TEST_VISION="1"
npm.cmd run test:api
```

Or run the local server and call:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5178/api/vision/health" -ContentType "application/json" -Body '{"imageUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/640px-Fronalpstock_big.jpg"}'
```

For the fixed local development service used in this project, call:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5178/api/vision/health" -ContentType "application/json" -Body '{}'
```

The health check requires parseable JSON with `ok: true` and `imageVisible: true`. It only proves that the endpoint can read an image and confirm visibility. Final hotspot accuracy still requires:

```powershell
npm.cmd run test:real-instance
```

## Real Instance Readiness

`npm.cmd run test:real-instance` runs readiness checks before opening the browser or generating an image:

- `/api/config` must report the real API key and image API as available.
- `/api/llm/health` must answer a lightweight text preflight request.
- `CHATIMAGE_VISION_ENDPOINT` must be configured, or the default Wuyin GPT5.5 endpoint is used.
- `/api/vision/health` must confirm `ok: true` and `imageVisible: true`.

If any check fails, the script writes `tmp/test-artifacts/real-instance-diagnostic.json` with `reason`, `reasons`, `textHealth`, `visionHealth` when available, and next commands. This avoids spending image-generation calls when the text or vision prerequisites are not ready.
