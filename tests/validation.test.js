"use strict";

const assert = require("assert");
const {
  validateChatImagePayload,
  validateExternalImageUrl,
  validateImageUrl,
  validateVisionImageDimensions,
  validateThreadPayload
} = require("../server/validation");

function main() {
  testValidChatImagePayload();
  testInvalidHotspots();
  testInvalidLayoutRegions();
  testInvalidLayoutQuality();
  testInvalidHotspotRegionBindings();
  testImageUrlValidation();
  testVisionImageDimensions();
  testValidThreadPayload();
  testInvalidThreadPayload();
  console.log("validation.test.js passed");
}

function testImageUrlValidation() {
  assert.doesNotThrow(() => validateImageUrl("https://cdn.example.com/generated.png?token=1"));
  assert.doesNotThrow(() => validateImageUrl("http://127.0.0.1:5173/missing-image.png"));
  assert.doesNotThrow(() => validateImageUrl("data:image/svg+xml;charset=utf-8,<svg></svg>"));
  assert.doesNotThrow(() => validateExternalImageUrl("https://cdn.example.com/generated.png?token=1"));
  assert.doesNotThrow(() => validateExternalImageUrl("https://fc-image.example.com/generated.png"));
  assert.doesNotThrow(() => validateExternalImageUrl("https://fdn.example.com/generated.png"));
  assert.doesNotThrow(() => validateExternalImageUrl("data:image/png;base64,AAAA"));
  for (const privateUrl of [
    "http://localhost:5173/image.png",
    "http://127.0.0.1:5173/image.png",
    "http://10.0.0.2/image.png",
    "http://172.16.0.2/image.png",
    "http://192.168.1.2/image.png",
    "http://[::1]/image.png",
    "http://[fc00::1]/image.png",
    "http://[fd12::1]/image.png",
    "http://[fe80::1]/image.png"
  ]) {
    assert.throws(
      () => validateExternalImageUrl(privateUrl),
      /vision proxy must be a public http\(s\) URL or data:image URL/
    );
  }
  assert.throws(
    () => validateChatImagePayload({ ...createPayload(), imageUrl: "javascript:alert(1)" }),
    /imageUrl must be an http\(s\) URL or data:image URL/
  );
  assert.throws(
    () => validateChatImagePayload({ ...createPayload(), imageUrl: "data:text/html,<script>alert(1)</script>" }),
    /imageUrl must be an http\(s\) URL or data:image URL/
  );
  assert.throws(
    () => validateChatImagePayload({ ...createPayload(), imageUrl: "/relative/image.png" }),
    /imageUrl must be an http\(s\) URL or data:image URL/
  );
}

function testVisionImageDimensions() {
  assert.deepStrictEqual(validateVisionImageDimensions({ imageWidth: 1600, imageHeight: 900 }), {
    imageWidth: 1600,
    imageHeight: 900
  });
  for (const body of [
    {},
    { imageWidth: 1600 },
    { imageWidth: 1600, imageHeight: "900" },
    { imageWidth: 15, imageHeight: 900 },
    { imageWidth: 1600.5, imageHeight: 900 }
  ]) {
    assert.throws(() => validateVisionImageDimensions(body), /imageWidth|imageHeight/);
  }
}

function testValidChatImagePayload() {
  const payload = createPayload();
  assert.strictEqual(validateChatImagePayload(payload), payload);
  assert.throws(
    () => validateChatImagePayload({ ...createPayload(), structuredSpec: [] }),
    /structuredSpec must be an object/
  );
  assert.throws(
    () => validateChatImagePayload({ ...createPayload(), alignmentRaw: [] }),
    /alignmentRaw must be an object/
  );
}

function testInvalidHotspots() {
  assert.throws(
    () => validateChatImagePayload({ ...createPayload(), hotspots: [] }),
    /hotspots must be a non-empty array/
  );
  assert.throws(
    () =>
      validateChatImagePayload({
        ...createPayload(),
        hotspots: [
          { ...createPayload().hotspots[0] },
          { ...createPayload().hotspots[0] }
        ]
      }),
    /duplicate hotspot id/
  );
  assert.throws(
    () =>
      validateChatImagePayload({
        ...createPayload(),
        hotspots: [{ ...createPayload().hotspots[0], x: 0.9, width: 0.2 }]
      }),
    /normalized image bounds/
  );
  assert.throws(
    () =>
      validateChatImagePayload({
        ...createPayload(),
        hotspots: [{ ...createPayload().hotspots[0], textBudget: { titleMaxChars: 0 } }]
      }),
    /textBudget\.titleLineChars/
  );
  assert.throws(
    () =>
      validateChatImagePayload({
        ...createPayload(),
        hotspots: [{ ...createPayload().hotspots[0], textBudget: { ...createTextBudget(), imageTextMaxChars: 4 } }]
      }),
    /shortText exceeds textBudget/
  );
}

function testInvalidLayoutRegions() {
  assert.throws(
    () => validateChatImagePayload({ ...createPayload(), layout: { regions: "bad" } }),
    /layout\.regions must be a non-empty array/
  );
  assert.throws(
    () => validateChatImagePayload({ ...createPayload(), layout: { regions: [] } }),
    /layout\.regions must be a non-empty array/
  );
  assert.throws(
    () =>
      validateChatImagePayload({
        ...createPayload(),
        layout: {
          regions: [
            { id: "region_1", bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
            { id: "region_1", bounds: { x: 0.4, y: 0.1, width: 0.2, height: 0.2 } }
          ]
        }
      }),
    /duplicate layout region id/
  );
}

function testInvalidLayoutQuality() {
  assert.throws(
    () => validateChatImagePayload(createPayloadWithBounds({ x: 0.01, y: 0.2, width: 0.3, height: 0.4 })),
    /layout quality check failed.*safe margin/
  );
  assert.throws(
    () => validateChatImagePayload(createPayloadWithBounds({ x: 0.1, y: 0.2, width: 0.08, height: 0.4 })),
    /layout quality check failed.*minimum click area/
  );
  const overlapping = createTwoModulePayload();
  overlapping.hotspots[1].x = 0.2;
  overlapping.layout.regions[1].bounds.x = 0.2;
  assert.throws(
    () => validateChatImagePayload(overlapping),
    /layout quality check failed.*overlaps/
  );
}

function testInvalidHotspotRegionBindings() {
  assert.throws(
    () =>
      validateChatImagePayload({
        ...createPayload(),
        layout: {
          regions: [
            {
              id: "region_1",
              hotspotId: "missing_module",
              role: "module",
              bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
            }
          ]
        }
      }),
    /references missing hotspot/
  );
  assert.throws(
    () =>
      validateChatImagePayload({
        ...createPayload(),
        layout: {
          regions: [
            {
              id: "region_1",
              hotspotId: "module_1",
              role: "module",
              bounds: { x: 0.12, y: 0.2, width: 0.3, height: 0.4 }
            }
          ]
        }
      }),
    /bounds do not match hotspot/
  );
  assert.throws(
    () =>
      validateChatImagePayload({
        ...createPayload(),
        layout: {
          regions: [
            {
              id: "title",
              role: "title",
              bounds: { x: 0.1, y: 0.05, width: 0.8, height: 0.1 }
            }
          ]
        }
      }),
    /must include module regions/
  );
}

function createPayloadWithBounds(bounds) {
  const payload = createPayload();
  Object.assign(payload.hotspots[0], bounds);
  Object.assign(payload.layout.regions[0].bounds, bounds);
  return payload;
}

function createTwoModulePayload() {
  const payload = createPayload();
  payload.layout.regions.push({
    id: "region_2",
    hotspotId: "module_2",
    role: "module",
    bounds: { x: 0.55, y: 0.2, width: 0.3, height: 0.4 }
  });
  payload.hotspots.push({
    ...payload.hotspots[0],
    id: "module_2",
    label: "Second",
    shortText: "Second scanning.",
    x: 0.55,
    y: 0.2,
    width: 0.3,
    height: 0.4
  });
  return payload;
}

function testValidThreadPayload() {
  const thread = createThread();
  assert.strictEqual(validateThreadPayload(thread, "ci_1", "module_1"), thread);
  assert.doesNotThrow(() => validateThreadPayload({ id: "thread_empty", messages: [] }, "ci_1", "module_1"));
}

function testInvalidThreadPayload() {
  assert.throws(() => validateThreadPayload(null, "ci_1", "module_1"), /thread must be an object/);
  assert.throws(
    () => validateThreadPayload({ ...createThread(), chatImageId: "ci_other" }, "ci_1", "module_1"),
    /chatImageId does not match/
  );
  assert.throws(
    () => validateThreadPayload({ ...createThread(), hotspotId: "module_2" }, "ci_1", "module_1"),
    /hotspotId does not match/
  );
  assert.throws(
    () =>
      validateThreadPayload(
        {
          ...createThread(),
          messages: [{ id: "msg_1", role: "system", content: "bad" }]
        },
        "ci_1",
        "module_1"
      ),
    /role must be user or assistant/
  );
  assert.throws(
    () =>
      validateThreadPayload(
        {
          ...createThread(),
          messages: [
            { id: "msg_1", role: "user", content: "one" },
            { id: "msg_1", role: "assistant", content: "two" }
          ]
        },
        "ci_1",
        "module_1"
      ),
    /duplicate message id/
  );
}

function createPayload() {
  return {
    id: "ci_1",
    question: "Explain ChatImage.",
    rawAnswer: "ChatImage turns long answers into interactive images.",
    title: "ChatImage value",
    summary: "Interactive visual summary.",
    structuredSpec: {
      title: "ChatImage value",
      summary: "Interactive visual summary.",
      relationType: "grid",
      modules: [{ id: "module_1", title: "Value", imageText: "Faster scanning." }]
    },
    layout: {
      family: "grid",
      regions: [
        {
          id: "region_1",
          hotspotId: "module_1",
          role: "module",
          bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
        }
      ]
    },
    hotspots: [
      {
        id: "module_1",
        label: "Value",
        shortText: "Faster scanning.",
        detail: "Users can click a region and ask follow-up questions.",
        sourceExcerpt: "",
        iconHint: "idea",
        textBudget: createTextBudget(),
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.4
      }
    ],
    imageUrl: "data:image/svg+xml,test",
    imageWidth: 1600,
    imageHeight: 900,
    providerRaw: null,
    alignmentRaw: { provider: "mock-alignment" },
    imagePrompt: "Prompt",
    createdAt: "2026-05-31T00:00:00.000Z"
  };
}

function createTextBudget() {
  return {
    titleLineChars: 20,
    titleMaxLines: 1,
    titleMaxChars: 20,
    imageTextLineChars: 40,
    imageTextMaxLines: 1,
    imageTextMaxChars: 40
  };
}

function createThread() {
  return {
    id: "thread_1",
    chatImageId: "ci_1",
    hotspotId: "module_1",
    messages: [
      { id: "msg_1", role: "user", content: "Why?", createdAt: "2026-05-31T00:00:00.000Z" },
      { id: "msg_2", role: "assistant", content: "Because it narrows context.", createdAt: "2026-05-31T00:00:01.000Z" }
    ],
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:01.000Z"
  };
}

main();
