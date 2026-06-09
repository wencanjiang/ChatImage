(function initThread(global) {
  "use strict";

  function createThread({ uid, result, hotspotId, existingThread }) {
    return (
      existingThread || {
        id: uid("thread"),
        chatImageId: result.id,
        hotspotId,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    );
  }

  function createFollowupContext({ result, hotspot, currentThread, userQuestion }) {
    return {
      originalQuestion: result.question,
      rawAnswer: result.rawAnswer,
      chatImageTitle: result.title,
      chatImageSummary: result.summary,
      currentHotspot: {
        label: hotspot.label,
        shortText: hotspot.shortText,
        detail: hotspot.detail,
        sourceExcerpt: hotspot.sourceExcerpt
      },
      siblingHotspots: result.hotspots
        .filter((item) => item.id !== hotspot.id)
        .map((item) => ({ id: item.id, label: item.label, shortText: item.shortText })),
      threadMessages: currentThread.messages,
      userQuestion
    };
  }

  function appendFollowupMessages({ uid, currentThread, userQuestion, assistantAnswer }) {
    const userMessage = {
      id: uid("msg"),
      role: "user",
      content: userQuestion,
      createdAt: new Date().toISOString()
    };

    const assistantMessage = {
      id: uid("msg"),
      role: "assistant",
      content: assistantAnswer,
      createdAt: new Date().toISOString()
    };

    return {
      ...currentThread,
      messages: currentThread.messages.concat(userMessage, assistantMessage),
      updatedAt: new Date().toISOString()
    };
  }

  function appendFollowupArtifactMessages({ uid, currentThread, userQuestion, artifact }) {
    return appendFollowupMessages({
      uid,
      currentThread,
      userQuestion,
      assistantAnswer: serializeFollowupArtifact(artifact)
    });
  }

  function serializeFollowupArtifact(artifact) {
    return JSON.stringify({
      type: "chatimage.followup.image",
      version: 1,
      artifact
    });
  }

  function parseFollowupArtifact(content) {
    if (typeof content !== "string" || content.charCodeAt(0) !== 123) return null;
    try {
      const parsed = JSON.parse(content);
      if (!parsed || parsed.type !== "chatimage.followup.image" || parsed.version !== 1) return null;
      if (!parsed.artifact || typeof parsed.artifact !== "object") return null;
      return parsed.artifact;
    } catch {
      return null;
    }
  }

  const api = {
    appendFollowupArtifactMessages,
    appendFollowupMessages,
    createFollowupContext,
    createThread,
    parseFollowupArtifact,
    serializeFollowupArtifact
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageThread = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
