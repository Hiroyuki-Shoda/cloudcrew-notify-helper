"use strict";

const DB_NAME = "slack-helper-db";
const STORE_NAME = "handles";
const HANDLE_KEY = "custom-instructions-file";

let fileHandle = null;
let instructions = [];

const mentionTextEl = document.getElementById("mention-text");
const copyMentionBtn = document.getElementById("copy-mention-btn");

const targetHostEl = document.getElementById("target-host");
const customInstructionSelect = document.getElementById("custom-instruction-select");
const chooseFileBtn = document.getElementById("choose-file-btn");
const fileStatusEl = document.getElementById("file-status");
const newInstructionInput = document.getElementById("new-instruction-input");
const addInstructionBtn = document.getElementById("add-instruction-btn");
const instructionListEl = document.getElementById("instruction-list");
const generateMessageBtn = document.getElementById("generate-message-btn");
const resultMessageEl = document.getElementById("result-message");
const copyResultBtn = document.getElementById("copy-result-btn");

// ---------- ①→② 初動対応メンション ----------

function getSelectedRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : "";
}

function updateMentionText() {
  const mentionType = getSelectedRadioValue("mention-type");
  mentionTextEl.value = `${mentionType}\n確認いたします。`;
}

document.getElementById("mention-type-group").addEventListener("change", updateMentionText);

copyMentionBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(mentionTextEl.value);
});

// ---------- ⑤⑥ → ⑦ 有効化制御 ----------

function updateCustomInstructionEnabled() {
  const resultType = getSelectedRadioValue("result-type");
  customInstructionSelect.disabled = resultType !== "個別指示";
}

document.getElementById("result-type-group").addEventListener("change", updateCustomInstructionEnabled);

// ---------- ⑦ 個別指示の永続化 (File System Access API + IndexedDB) ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandleToDb(handle) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandleFromDb() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function renderInstructions() {
  customInstructionSelect.innerHTML = "";
  if (instructions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "(登録なし)";
    customInstructionSelect.appendChild(option);
  } else {
    for (const text of instructions) {
      const option = document.createElement("option");
      option.value = text;
      option.textContent = text;
      customInstructionSelect.appendChild(option);
    }
  }

  instructionListEl.innerHTML = "";
  instructions.forEach((text, index) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = text;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "削除";
    removeBtn.addEventListener("click", () => removeInstruction(index));
    li.appendChild(span);
    li.appendChild(removeBtn);
    instructionListEl.appendChild(li);
  });
}

async function readInstructionsFromFile(handle) {
  try {
    const file = await handle.getFile();
    const text = await file.text();
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("個別指示ファイルの読み込みに失敗しました", error);
    return [];
  }
}

async function writeInstructionsToFile() {
  if (!fileHandle) return;
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(instructions, null, 2));
  await writable.close();
}

async function connectFileHandle(handle, { persist } = { persist: true }) {
  fileHandle = handle;
  instructions = await readInstructionsFromFile(handle);
  renderInstructions();
  fileStatusEl.textContent = `接続済み: ${handle.name}`;
  if (persist) {
    await saveHandleToDb(handle);
  }
}

async function tryRestoreFileHandle() {
  try {
    const handle = await loadHandleFromDb();
    if (!handle) {
      fileStatusEl.textContent = "未接続";
      return;
    }
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") {
      await connectFileHandle(handle, { persist: false });
    } else {
      fileStatusEl.textContent = `再接続が必要です（${handle.name}）`;
    }
  } catch (error) {
    console.error("個別指示ファイルの復元に失敗しました", error);
    fileStatusEl.textContent = "未接続";
  }
}

chooseFileBtn.addEventListener("click", async () => {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "custom-instructions.json",
      types: [
        {
          description: "JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    await connectFileHandle(handle);
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("ファイル選択に失敗しました", error);
    }
  }
});

addInstructionBtn.addEventListener("click", async () => {
  const text = newInstructionInput.value.trim();
  if (!text || !fileHandle) return;
  instructions.push(text);
  renderInstructions();
  newInstructionInput.value = "";
  await writeInstructionsToFile();
});

async function removeInstruction(index) {
  instructions.splice(index, 1);
  renderInstructions();
  await writeInstructionsToFile();
}

// ---------- ⑧ メッセージ作成ロジック ----------

function buildMessage({ resultType, checkItem, targetHost, customInstruction }) {
  const host = targetHost.trim();

  if (resultType === "個別指示") {
    return customInstruction || "";
  }

  if (resultType === "問題なし") {
    if (checkItem === "WEB表示" || checkItem === "サービス稼働") {
      return `${checkItem}問題ございません。`;
    }
    if (checkItem === "リモートデスクトップ接続") {
      return `${host}へのリモートデスクトップ接続問題ございません。`;
    }
    if (checkItem === "5分待機") {
      return host ? `${host}への接続が行えないため、5分待機いたします。` : "5分待機いたします。";
    }
  }

  if (resultType === "電話エスカ") {
    const target = host ? `${checkItem}(${host})` : checkItem;
    return `${target}に問題が出ておりますため、電話エスカレーションいたします。`;
  }

  if (resultType === "メールエスカ") {
    if (checkItem === "5分待機") {
      return "5分経過後も復旧しないため、メールエスカレーションいたします。";
    }
    const target = host ? `${checkItem}(${host})` : checkItem;
    return `${target}に問題が出ておりますため、メールエスカレーションいたします。`;
  }

  return "";
}

generateMessageBtn.addEventListener("click", () => {
  const resultType = getSelectedRadioValue("result-type");
  const checkItem = getSelectedRadioValue("check-item");
  resultMessageEl.value = buildMessage({
    resultType,
    checkItem,
    targetHost: targetHostEl.value,
    customInstruction: customInstructionSelect.value,
  });
});

copyResultBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(resultMessageEl.value);
});

// ---------- 初期化 ----------

updateMentionText();
updateCustomInstructionEnabled();
tryRestoreFileHandle();
