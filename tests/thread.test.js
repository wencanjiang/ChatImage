"use strict";

const assert = require("assert");
const {
  appendFollowupArtifactMessages,
  appendFollowupMessages,
  createFollowupContext,
  createThread,
  parseFollowupArtifact
} = require("../src/thread");

function createUid() {
  const counters = {};
  return (prefix) => {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `${prefix}_${counters[prefix]}`;
  };
}

function createResult() {
  return {
    id: "ci_1",
    question: "如何理解 ChatImage？",
    rawAnswer: "原始长回答",
    title: "ChatImage 价值",
    summary: "把长回答转换为可点击图片",
    hotspots: [
      {
        id: "module_1",
        label: "目标用户",
        shortText: "普通 ChatGPT 用户",
        detail: "用户可以点击区域阅读详情",
        sourceExcerpt: "目标用户片段"
      },
      {
        id: "module_2",
        label: "交互方式",
        shortText: "热点追问",
        detail: "每个热点维护独立分支",
        sourceExcerpt: "交互方式片段"
      }
    ]
  };
}

function main() {
  const uid = createUid();
  const result = createResult();

  const thread = createThread({
    uid,
    result,
    hotspotId: "module_1",
    existingThread: null
  });
  assert.strictEqual(thread.id, "thread_1");
  assert.strictEqual(thread.chatImageId, "ci_1");
  assert.strictEqual(thread.hotspotId, "module_1");
  assert.deepStrictEqual(thread.messages, []);
  assert.match(thread.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  const existingThread = { id: "thread_existing", messages: [{ role: "user", content: "旧问题" }] };
  assert.strictEqual(
    createThread({ uid, result, hotspotId: "module_1", existingThread }),
    existingThread
  );

  const context = createFollowupContext({
    result,
    hotspot: result.hotspots[0],
    currentThread: existingThread,
    userQuestion: "这个用户群为什么重要？"
  });
  assert.strictEqual(context.originalQuestion, result.question);
  assert.strictEqual(context.rawAnswer, result.rawAnswer);
  assert.strictEqual(context.currentHotspot.label, "目标用户");
  assert.deepStrictEqual(context.siblingHotspots, [
    { id: "module_2", label: "交互方式", shortText: "热点追问" }
  ]);
  assert.strictEqual(context.threadMessages, existingThread.messages);
  assert.strictEqual(context.userQuestion, "这个用户群为什么重要？");

  const updated = appendFollowupMessages({
    uid,
    currentThread: existingThread,
    userQuestion: "继续解释",
    assistantAnswer: "围绕该热点继续回答"
  });
  assert.notStrictEqual(updated, existingThread);
  assert.strictEqual(updated.id, "thread_existing");
  assert.strictEqual(updated.messages.length, 3);
  assert.strictEqual(updated.messages[0], existingThread.messages[0]);
  assert.deepStrictEqual(
    updated.messages.slice(1).map((message) => [message.id, message.role, message.content]),
    [
      ["msg_1", "user", "继续解释"],
      ["msg_2", "assistant", "围绕该热点继续回答"]
    ]
  );
  assert.match(updated.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const artifactThread = appendFollowupArtifactMessages({
    uid,
    currentThread: { id: "thread_artifact", messages: [] },
    userQuestion: "生成一张静态图",
    artifact: { title: "静态图", rawAnswer: "文本回答", hotspots: [] }
  });
  assert.strictEqual(artifactThread.messages.length, 2);
  assert.strictEqual(artifactThread.messages[0].content, "生成一张静态图");
  assert.deepStrictEqual(parseFollowupArtifact(artifactThread.messages[1].content), {
    title: "静态图",
    rawAnswer: "文本回答",
    hotspots: []
  });
  assert.strictEqual(parseFollowupArtifact("plain text"), null);

  console.log("thread.test.js passed");
}

main();
