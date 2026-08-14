"use strict";

const CUSTOM_INSTRUCTIONS_DB_NAME = "slack-helper-db";
const CUSTOM_INSTRUCTIONS_STORE_NAME = "handles";
const CUSTOM_INSTRUCTIONS_HANDLE_KEY = "custom-instructions-file";
const CUSTOM_INSTRUCTIONS_UPDATED_MESSAGE = "custom-instructions-updated";
const CUSTOM_INSTRUCTIONS_UNGROUPED_LABEL = "未分類";

// 旧形式（文字列の配列）との互換用。文字列は「グループなし」として扱う。
function normalizeCustomInstructionEntry(entry) {
  if (typeof entry === "string") {
    return { group: "", text: entry };
  }
  if (entry && typeof entry === "object" && typeof entry.text === "string") {
    return { group: typeof entry.group === "string" ? entry.group : "", text: entry.text };
  }
  return null;
}

function openCustomInstructionsDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CUSTOM_INSTRUCTIONS_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CUSTOM_INSTRUCTIONS_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveCustomInstructionsHandle(handle) {
  const db = await openCustomInstructionsDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_INSTRUCTIONS_STORE_NAME, "readwrite");
    tx.objectStore(CUSTOM_INSTRUCTIONS_STORE_NAME).put(handle, CUSTOM_INSTRUCTIONS_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadCustomInstructionsHandle() {
  const db = await openCustomInstructionsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_INSTRUCTIONS_STORE_NAME, "readonly");
    const request = tx.objectStore(CUSTOM_INSTRUCTIONS_STORE_NAME).get(CUSTOM_INSTRUCTIONS_HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function readCustomInstructionsFromFile(handle) {
  try {
    const file = await handle.getFile();
    const text = await file.text();
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCustomInstructionEntry).filter(Boolean);
  } catch (error) {
    console.error("個別指示ファイルの読み込みに失敗しました", error);
    return [];
  }
}

async function writeCustomInstructionsToFile(handle, instructions) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(instructions, null, 2));
  await writable.close();
}

function notifyCustomInstructionsUpdated() {
  chrome.runtime.sendMessage({ type: CUSTOM_INSTRUCTIONS_UPDATED_MESSAGE }).catch(() => {});
}
