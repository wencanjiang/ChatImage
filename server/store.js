"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

function createStore(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("pragma foreign_keys = on");
  db.exec(`
    create table if not exists chat_images (
      id text primary key,
      question text not null,
      raw_answer text not null,
      title text not null,
      summary text not null,
      structured_spec_json text not null default '{}',
      layout_json text not null,
      image_url text not null,
      image_width integer not null,
      image_height integer not null,
      image_prompt text not null default '',
      provider_raw_json text not null,
      alignment_raw_json text not null default 'null',
      pinned_at text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists hotspots (
      storage_id text primary key,
      id text not null,
      chat_image_id text not null references chat_images(id) on delete cascade,
      label text not null,
      short_text text not null,
      detail text not null,
      source_excerpt text not null,
      icon_hint text not null,
      bounds_json text not null,
      unique (chat_image_id, id)
    );

    create table if not exists hotspot_threads (
      id text primary key,
      chat_image_id text not null references chat_images(id) on delete cascade,
      hotspot_id text not null,
      created_at text not null,
      updated_at text not null,
      unique (chat_image_id, hotspot_id)
    );

    create table if not exists hotspot_messages (
      id text primary key,
      thread_id text not null references hotspot_threads(id) on delete cascade,
      role text not null,
      content text not null,
      created_at text not null
    );
  `);
  migrateHotspotsTable(db);
  ensureHotspotThreadsSchema(db);
  ensureImagePromptColumn(db);
  ensureStructuredSpecColumn(db);
  ensureAlignmentRawColumn(db);
  ensurePinnedAtColumn(db);

  return {
    saveChatImage(result) {
      const now = new Date().toISOString();
      const createdAt = result.createdAt || now;
      withTransaction(db, () => {
        db.prepare(`
          insert into chat_images (
            id, question, raw_answer, title, summary, structured_spec_json, layout_json, image_url,
            image_width, image_height, image_prompt, provider_raw_json, alignment_raw_json, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(id) do update set
            question = excluded.question,
            raw_answer = excluded.raw_answer,
            title = excluded.title,
            summary = excluded.summary,
            structured_spec_json = excluded.structured_spec_json,
            layout_json = excluded.layout_json,
            image_url = excluded.image_url,
            image_width = excluded.image_width,
            image_height = excluded.image_height,
            image_prompt = excluded.image_prompt,
            provider_raw_json = excluded.provider_raw_json,
            alignment_raw_json = excluded.alignment_raw_json,
            updated_at = excluded.updated_at
          where chat_images.updated_at <= excluded.updated_at
        `).run(
          result.id,
          result.question || "",
          result.rawAnswer || "",
          result.title || "",
          result.summary || "",
          JSON.stringify(result.structuredSpec || null),
          JSON.stringify(result.layout || {}),
          result.imageUrl || "",
          Number(result.imageWidth || 0),
          Number(result.imageHeight || 0),
          result.imagePrompt || "",
          JSON.stringify(result.providerRaw || null),
          JSON.stringify(result.alignmentRaw || null),
          createdAt,
          now
        );

        db.prepare("delete from hotspots where chat_image_id = ?").run(result.id);
        const insertHotspot = db.prepare(`
          insert into hotspots (
            storage_id, id, chat_image_id, label, short_text, detail, source_excerpt, icon_hint, bounds_json
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const hotspot of result.hotspots || []) {
          insertHotspot.run(
            `${result.id}:${hotspot.id}`,
            hotspot.id,
            result.id,
            hotspot.label || "",
            hotspot.shortText || "",
            hotspot.detail || "",
            hotspot.sourceExcerpt || "",
            hotspot.iconHint || "",
            JSON.stringify({
              x: hotspot.x,
              y: hotspot.y,
              width: hotspot.width,
              height: hotspot.height,
              textBudget: hotspot.textBudget || null,
              zIndex: hotspot.zIndex || null,
              alignmentSource: hotspot.alignmentSource || "",
              regionKind: hotspot.regionKind || "",
              maskPolicy: hotspot.maskPolicy || "",
              mask: hotspot.mask || null,
              shape: hotspot.shape || null,
              clickShape: hotspot.clickShape || null,
              maskUsableForClick: hotspot.maskUsableForClick === true,
              clickDiagnostics: Array.isArray(hotspot.clickDiagnostics) ? hotspot.clickDiagnostics : []
            })
          );
        }
        cleanupThreadsForCurrentHotspots(db, result.id);
      });
      return { id: result.id };
    },

    listChatImages() {
      return db
        .prepare(
          "select id, question, title, summary, image_url as imageUrl, pinned_at as pinnedAt, created_at as createdAt, updated_at as updatedAt from chat_images order by pinned_at is null asc, pinned_at desc, updated_at desc limit 30"
        )
        .all();
    },

    getChatImage(chatImageId) {
      const row = db
        .prepare(
          "select id, question, raw_answer as rawAnswer, title, summary, structured_spec_json as structuredSpecJson, layout_json as layoutJson, image_url as imageUrl, image_width as imageWidth, image_height as imageHeight, image_prompt as imagePrompt, provider_raw_json as providerRawJson, alignment_raw_json as alignmentRawJson, pinned_at as pinnedAt, created_at as createdAt, updated_at as updatedAt from chat_images where id = ?"
        )
        .get(chatImageId);
      if (!row) return { result: null };
      const structuredSpec = safeJsonParse(row.structuredSpecJson, null);
      const alignmentRaw = safeJsonParse(row.alignmentRawJson, null);
      const hotspots = db
        .prepare(
          "select id, label, short_text as shortText, detail, source_excerpt as sourceExcerpt, icon_hint as iconHint, bounds_json as boundsJson from hotspots where chat_image_id = ? order by id asc"
        )
        .all(chatImageId)
        .map((hotspot) => ({
          id: hotspot.id,
          label: hotspot.label,
          shortText: hotspot.shortText,
          detail: hotspot.detail,
          sourceExcerpt: hotspot.sourceExcerpt,
          iconHint: hotspot.iconHint,
          ...safeJsonParse(hotspot.boundsJson, {})
        }));
      return {
        result: {
          id: row.id,
          question: row.question,
          rawAnswer: row.rawAnswer,
          title: row.title,
          summary: row.summary,
          structuredSpec,
          layout: safeJsonParse(row.layoutJson, {}),
          hotspots,
          threads: listThreads(db, chatImageId),
          imageUrl: row.imageUrl,
          imageWidth: row.imageWidth,
          imageHeight: row.imageHeight,
          imagePrompt: row.imagePrompt || "",
          providerRaw: safeJsonParse(row.providerRawJson, null),
          alignmentRaw,
          textModelUsed: (structuredSpec && structuredSpec.textModelUsed) || "",
          textModelFallbackReason: (structuredSpec && structuredSpec.textModelFallbackReason) || "",
          visualQualityRaw: alignmentRaw && alignmentRaw.visualQa ? alignmentRaw.visualQa : null,
          visualQualityWarnings:
            alignmentRaw && alignmentRaw.visualQa && Array.isArray(alignmentRaw.visualQa.warnings) ? alignmentRaw.visualQa.warnings : [],
          pinnedAt: row.pinnedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        }
      };
    },

    updateChatImageMeta(chatImageId, patch) {
      const existing = db
        .prepare("select id from chat_images where id = ?")
        .get(chatImageId);
      if (!existing) return { item: null };

      const now = new Date().toISOString();
      if (Object.prototype.hasOwnProperty.call(patch, "title")) {
        db.prepare("update chat_images set title = ?, updated_at = ? where id = ?").run(patch.title, now, chatImageId);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "pinned")) {
        db.prepare("update chat_images set pinned_at = ? where id = ?").run(patch.pinned ? now : null, chatImageId);
      }
      const item = db
        .prepare(
          "select id, question, title, summary, image_url as imageUrl, pinned_at as pinnedAt, created_at as createdAt, updated_at as updatedAt from chat_images where id = ?"
        )
        .get(chatImageId);
      return { item };
    },

    deleteChatImage(chatImageId) {
      const result = db.prepare("delete from chat_images where id = ?").run(chatImageId);
      return { deleted: result.changes > 0 };
    },

    getThread(chatImageId, hotspotId) {
      const thread = db
        .prepare("select * from hotspot_threads where chat_image_id = ? and hotspot_id = ?")
        .get(chatImageId, hotspotId);
      if (!thread) return { thread: null };
      const messages = db
        .prepare("select id, role, content, created_at as createdAt from hotspot_messages where thread_id = ? order by created_at asc")
        .all(thread.id);
      return {
        thread: {
          id: thread.id,
          chatImageId: thread.chat_image_id,
          hotspotId: thread.hotspot_id,
          messages,
          createdAt: thread.created_at,
          updatedAt: thread.updated_at
        }
      };
    },

    saveThread(chatImageId, hotspotId, thread) {
      if (!thread || !thread.id) {
        const error = new Error("thread is required");
        error.statusCode = 400;
        throw error;
      }
      const hotspot = db
        .prepare("select id from hotspots where chat_image_id = ? and id = ?")
        .get(chatImageId, hotspotId);
      if (!hotspot) {
        const error = new Error("hotspot does not belong to chat image");
        error.statusCode = 404;
        throw error;
      }
      const now = new Date().toISOString();
      const existingThread = db
        .prepare("select id from hotspot_threads where chat_image_id = ? and hotspot_id = ?")
        .get(chatImageId, hotspotId);
      if (existingThread && existingThread.id !== thread.id) {
        withTransaction(db, () => {
          db.prepare("delete from hotspot_messages where thread_id = ?").run(existingThread.id);
          upsertThread(db, chatImageId, hotspotId, thread, now);
        });
      } else {
        withTransaction(db, () => {
          upsertThread(db, chatImageId, hotspotId, thread, now);
        });
      }
      return this.getThread(chatImageId, hotspotId);
    },

    close() {
      db.close();
    }
  };
}

function ensureImagePromptColumn(db) {
  const columns = db.prepare("pragma table_info(chat_images)").all();
  if (columns.some((column) => column.name === "image_prompt")) return;
  db.exec("alter table chat_images add column image_prompt text not null default ''");
}

function ensureStructuredSpecColumn(db) {
  const columns = db.prepare("pragma table_info(chat_images)").all();
  if (columns.some((column) => column.name === "structured_spec_json")) return;
  db.exec("alter table chat_images add column structured_spec_json text not null default '{}'");
}

function ensureAlignmentRawColumn(db) {
  const columns = db.prepare("pragma table_info(chat_images)").all();
  if (columns.some((column) => column.name === "alignment_raw_json")) return;
  db.exec("alter table chat_images add column alignment_raw_json text not null default 'null'");
}

function ensurePinnedAtColumn(db) {
  const columns = db.prepare("pragma table_info(chat_images)").all();
  if (columns.some((column) => column.name === "pinned_at")) return;
  db.exec("alter table chat_images add column pinned_at text");
}

function ensureHotspotThreadsSchema(db) {
  const table = db
    .prepare("select sql from sqlite_master where type = 'table' and name = 'hotspot_threads'")
    .get();
  const sql = String((table && table.sql) || "");
  if (!/hotspot_id\s+text\s+not\s+null\s+references/i.test(sql) && !/hotspots_legacy/i.test(sql)) return;

  db.exec(`
    pragma foreign_keys = off;

    alter table hotspot_messages rename to hotspot_messages_legacy;
    alter table hotspot_threads rename to hotspot_threads_legacy;

    create table hotspot_threads (
      id text primary key,
      chat_image_id text not null references chat_images(id) on delete cascade,
      hotspot_id text not null,
      created_at text not null,
      updated_at text not null,
      unique (chat_image_id, hotspot_id)
    );

    create table hotspot_messages (
      id text primary key,
      thread_id text not null references hotspot_threads(id) on delete cascade,
      role text not null,
      content text not null,
      created_at text not null
    );

    insert into hotspot_threads (id, chat_image_id, hotspot_id, created_at, updated_at)
    select id, chat_image_id, hotspot_id, created_at, updated_at
    from hotspot_threads_legacy;

    insert into hotspot_messages (id, thread_id, role, content, created_at)
    select id, thread_id, role, content, created_at
    from hotspot_messages_legacy;

    drop table hotspot_messages_legacy;
    drop table hotspot_threads_legacy;

    pragma foreign_keys = on;
  `);
}

function cleanupThreadsForCurrentHotspots(db, chatImageId) {
  const staleThreads = db
    .prepare(
      "select id from hotspot_threads where chat_image_id = ? and hotspot_id not in (select id from hotspots where chat_image_id = ?)"
    )
    .all(chatImageId, chatImageId);
  const deleteMessages = db.prepare("delete from hotspot_messages where thread_id = ?");
  for (const thread of staleThreads) {
    deleteMessages.run(thread.id);
  }
  db.prepare(
    "delete from hotspot_threads where chat_image_id = ? and hotspot_id not in (select id from hotspots where chat_image_id = ?)"
  ).run(chatImageId, chatImageId);
}

function upsertThread(db, chatImageId, hotspotId, thread, now) {
  db.prepare(`
    insert into hotspot_threads (id, chat_image_id, hotspot_id, created_at, updated_at)
    values (?, ?, ?, ?, ?)
    on conflict(chat_image_id, hotspot_id) do update set
      id = excluded.id,
      updated_at = excluded.updated_at
  `).run(thread.id, chatImageId, hotspotId, thread.createdAt || now, thread.updatedAt || now);
  db.prepare("delete from hotspot_messages where thread_id = ?").run(thread.id);
  const insertMessage = db.prepare(
    "insert into hotspot_messages (id, thread_id, role, content, created_at) values (?, ?, ?, ?, ?)"
  );
  for (const message of thread.messages || []) {
    insertMessage.run(message.id, thread.id, message.role, message.content, message.createdAt || now);
  }
}

function withTransaction(db, callback) {
  // If a previous request crashed mid-transaction and its rollback also failed,
  // the connection can be left with an open transaction. The next "begin
  // immediate" would then throw "cannot start a transaction within a
  // transaction" and stall every subsequent write. Defensively roll back any
  // lingering transaction before starting a new one.
  try {
    db.exec("rollback");
  } catch {
    // Expected when no transaction is open.
  }
  db.exec("begin immediate transaction");
  try {
    const result = callback();
    db.exec("commit");
    return result;
  } catch (error) {
    try {
      db.exec("rollback");
    } catch (rollbackError) {
      // Surface rollback failure: the connection may now be unusable for
      // future writes, and silently swallowing it would mask a deadlock.
      console.error(
        `[store] rollback failed after write error: ${rollbackError && rollbackError.message ? rollbackError.message : rollbackError}`
      );
    }
    throw error;
  }
}

function listThreads(db, chatImageId) {
  const threads = db
    .prepare("select id, chat_image_id as chatImageId, hotspot_id as hotspotId, created_at as createdAt, updated_at as updatedAt from hotspot_threads where chat_image_id = ? order by updated_at asc")
    .all(chatImageId);
  const getMessages = db.prepare(
    "select id, role, content, created_at as createdAt from hotspot_messages where thread_id = ? order by created_at asc"
  );
  return threads.map((thread) => ({
    ...thread,
    messages: getMessages.all(thread.id)
  }));
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function migrateHotspotsTable(db) {
  const columns = db.prepare("pragma table_info(hotspots)").all();
  if (!columns.length || columns.some((column) => column.name === "storage_id")) return;

  db.exec(`
    alter table hotspots rename to hotspots_legacy;

    create table hotspots (
      storage_id text primary key,
      id text not null,
      chat_image_id text not null references chat_images(id) on delete cascade,
      label text not null,
      short_text text not null,
      detail text not null,
      source_excerpt text not null,
      icon_hint text not null,
      bounds_json text not null,
      unique (chat_image_id, id)
    );

    insert into hotspots (
      storage_id, id, chat_image_id, label, short_text, detail, source_excerpt, icon_hint, bounds_json
    )
    select
      chat_image_id || ':' || id,
      id,
      chat_image_id,
      label,
      short_text,
      detail,
      source_excerpt,
      icon_hint,
      bounds_json
    from hotspots_legacy;

    drop table hotspots_legacy;
  `);
}

module.exports = {
  cleanupThreadsForCurrentHotspots,
  createStore,
  ensureImagePromptColumn,
  ensureAlignmentRawColumn,
  ensurePinnedAtColumn,
  ensureHotspotThreadsSchema,
  ensureStructuredSpecColumn,
  migrateHotspotsTable,
  upsertThread,
  withTransaction
};
