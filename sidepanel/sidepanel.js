"use strict";

const mentionTextEl = document.getElementById("mention-text");
const copyMentionBtn = document.getElementById("copy-mention-btn");

const targetHostEl = document.getElementById("target-host");
const customInstructionSelect = document.getElementById("custom-instruction-select");
const openSettingsBtn = document.getElementById("open-settings-btn");
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

// ---------- ⑦ 個別指示プルダウンの読み込み（管理は設定画面で行う） ----------

let instructions = [];

function renderInstructions() {
  const previousValue = customInstructionSelect.value;
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
  if (instructions.includes(previousValue)) {
    customInstructionSelect.value = previousValue;
  }
}

async function refreshInstructionsFromFile() {
  try {
    const handle = await loadCustomInstructionsHandle();
    if (!handle) {
      instructions = [];
      renderInstructions();
      return;
    }
    const permission = await handle.queryPermission({ mode: "read" });
    if (permission === "granted") {
      instructions = await readCustomInstructionsFromFile(handle);
    } else {
      instructions = [];
    }
    renderInstructions();
  } catch (error) {
    console.error("個別指示ファイルの読み込みに失敗しました", error);
  }
}

openSettingsBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("settings/settings.html") });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === CUSTOM_INSTRUCTIONS_UPDATED_MESSAGE) {
    refreshInstructionsFromFile();
  }
});

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
      return host ? `${host}へのリモートデスクトップ接続問題ございません。` : "リモートデスクトップ接続問題ございません。";
    }
    if (checkItem === "5分待機") {
      return host ? `${host}への接続が行えないため、5分待機いたします。` : "5分待機いたします。";
    }
  }

  if (resultType === "電話エスカ") {
    if (checkItem === "5分待機") {
      return "5分経過後も復旧しないため、電話エスカレーションいたします。";
    }
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
refreshInstructionsFromFile();
