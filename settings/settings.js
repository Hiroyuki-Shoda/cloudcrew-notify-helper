"use strict";

let fileHandle = null;
let instructions = [];

const fileStatusEl = document.getElementById("file-status");
const openFileBtn = document.getElementById("open-file-btn");
const createFileBtn = document.getElementById("create-file-btn");
const newInstructionGroupInput = document.getElementById("new-instruction-group");
const newInstructionInput = document.getElementById("new-instruction-input");
const addInstructionBtn = document.getElementById("add-instruction-btn");
const instructionListEl = document.getElementById("instruction-list");

const JSON_FILE_TYPES = [
  {
    description: "JSON",
    accept: { "application/json": [".json"] },
  },
];

function renderInstructions() {
  instructionListEl.innerHTML = "";

  const groupOrder = [];
  const groupedItems = new Map();
  instructions.forEach((item, index) => {
    const key = item.group || "";
    if (!groupedItems.has(key)) {
      groupedItems.set(key, []);
      groupOrder.push(key);
    }
    groupedItems.get(key).push({ ...item, index });
  });

  for (const key of groupOrder) {
    const header = document.createElement("li");
    header.className = "group-header";
    header.textContent = key || CUSTOM_INSTRUCTIONS_UNGROUPED_LABEL;
    instructionListEl.appendChild(header);

    for (const item of groupedItems.get(key)) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = item.text;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "削除";
      removeBtn.addEventListener("click", () => removeInstruction(item.index));
      li.appendChild(span);
      li.appendChild(removeBtn);
      instructionListEl.appendChild(li);
    }
  }
}

async function writeInstructions() {
  if (!fileHandle) return;
  await writeCustomInstructionsToFile(fileHandle, instructions);
  notifyCustomInstructionsUpdated();
}

async function connectFileHandle(handle) {
  fileHandle = handle;
  instructions = await readCustomInstructionsFromFile(handle);
  renderInstructions();
  fileStatusEl.textContent = `接続済み: ${handle.name}`;
  await saveCustomInstructionsHandle(handle);
  notifyCustomInstructionsUpdated();
}

async function tryRestoreFileHandle() {
  try {
    const handle = await loadCustomInstructionsHandle();
    if (!handle) {
      fileStatusEl.textContent = "未接続";
      return;
    }
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") {
      fileHandle = handle;
      instructions = await readCustomInstructionsFromFile(handle);
      renderInstructions();
      fileStatusEl.textContent = `接続済み: ${handle.name}`;
    } else {
      fileStatusEl.textContent = `再接続が必要です（${handle.name}）`;
    }
  } catch (error) {
    console.error("個別指示ファイルの復元に失敗しました", error);
    fileStatusEl.textContent = "未接続";
  }
}

openFileBtn.addEventListener("click", async () => {
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: JSON_FILE_TYPES,
    });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      fileStatusEl.textContent = "書き込み権限が許可されませんでした";
      return;
    }
    // 既存ファイルを開くだけなので内容は読み込み専用で扱い、上書きしない
    await connectFileHandle(handle);
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("ファイル選択に失敗しました", error);
    }
  }
});

createFileBtn.addEventListener("click", async () => {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "custom-instructions.json",
      types: JSON_FILE_TYPES,
    });
    fileHandle = handle;
    instructions = [];
    await writeCustomInstructionsToFile(fileHandle, instructions);
    renderInstructions();
    fileStatusEl.textContent = `接続済み: ${handle.name}`;
    await saveCustomInstructionsHandle(handle);
    notifyCustomInstructionsUpdated();
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("新規ファイルの作成に失敗しました", error);
    }
  }
});

addInstructionBtn.addEventListener("click", async () => {
  const text = newInstructionInput.value.trim();
  if (!text || !fileHandle) return;
  const group = newInstructionGroupInput.value.trim();
  instructions.push({ group, text });
  renderInstructions();
  newInstructionInput.value = "";
  newInstructionGroupInput.value = "";
  await writeInstructions();
});

async function removeInstruction(index) {
  instructions.splice(index, 1);
  renderInstructions();
  await writeInstructions();
}

tryRestoreFileHandle();
