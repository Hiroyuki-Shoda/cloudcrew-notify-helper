"use strict";

const mentionTextEl = document.getElementById("mention-text");
const copyMentionBtn = document.getElementById("copy-mention-btn");

const webCheckUrlsEl = document.getElementById("web-check-urls");
const webCheckStatusEl = document.getElementById("web-check-status");
const openWebUrlsBtn = document.getElementById("open-web-urls-btn");

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

// ---------- WEB表示確認 ----------

const PENDING_WEB_CHECK_URLS_KEY = "pendingWebCheckUrls";

function isValidHttpUrl(text) {
  // URL コンストラクタは改行やタブ等の制御文字を解析前に取り除いてしまうため、
  // 複数行/複数URLが混ざった文字列を1件の正しいURLと誤判定することがある。
  // 空白・制御文字を含む時点で単一のURLとは認めない。
  if (/\s/.test(text)) return false;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function appendUrlsToWebCheck(urls) {
  const existingLines = webCheckUrlsEl.value.split("\n").filter((line) => line.trim().length > 0);
  webCheckUrlsEl.value = [...existingLines, ...urls].join("\n");
}

async function importPendingWebCheckUrls() {
  if (!chrome.storage) return;
  const stored = await chrome.storage.local.get(PENDING_WEB_CHECK_URLS_KEY);
  const pending = stored[PENDING_WEB_CHECK_URLS_KEY] || [];
  if (pending.length === 0) return;
  appendUrlsToWebCheck(pending);
  await chrome.storage.local.remove(PENDING_WEB_CHECK_URLS_KEY);
}

// "storage" 権限の反映前（拡張機能の再読み込み前）は chrome.storage が未定義になり
// 得るため、ここが無くても他の初期化処理を止めないようガードする。
if (chrome.storage) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[PENDING_WEB_CHECK_URLS_KEY]) {
      importPendingWebCheckUrls();
    }
  });
} else {
  console.warn("chrome.storage が利用できません。拡張機能を再読み込みしてください。");
}

openWebUrlsBtn.addEventListener("click", () => {
  const lines = webCheckUrlsEl.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let hasInvalid = false;
  for (const line of lines) {
    if (isValidHttpUrl(line)) {
      window.open(line, "_blank");
    } else {
      hasInvalid = true;
    }
  }

  webCheckStatusEl.textContent = hasInvalid ? "URL形式が不正です" : "";
});

// ---------- ⑤⑥ → ⑦ 有効化制御 ----------

function updateCustomInstructionEnabled() {
  const resultType = getSelectedRadioValue("result-type");
  customInstructionSelect.disabled = resultType !== "個別指示";
}

document.getElementById("result-type-group").addEventListener("change", updateCustomInstructionEnabled);

// ---------- ⑤ → ⑥「メールエスカ」の有効化制御 ----------

function updateMailEscalationAvailability() {
  const checkItem = getSelectedRadioValue("check-item");
  const mailEscalationRadio = document.querySelector('input[name="result-type"][value="メールエスカ"]');
  const shouldDisable = checkItem !== "5分待機";

  mailEscalationRadio.disabled = shouldDisable;

  if (shouldDisable && mailEscalationRadio.checked) {
    mailEscalationRadio.checked = false;
    document.querySelector('input[name="result-type"][value="問題なし"]').checked = true;
    updateCustomInstructionEnabled();
  }
}

document.getElementById("check-item-group").addEventListener("change", updateMailEscalationAvailability);

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
    const groupOrder = [];
    const groupedItems = new Map();
    for (const item of instructions) {
      const key = item.group || "";
      if (!groupedItems.has(key)) {
        groupedItems.set(key, []);
        groupOrder.push(key);
      }
      groupedItems.get(key).push(item);
    }
    // グループ指定が1つもない場合は従来通りフラットなリストのまま表示する
    const useGroups = groupOrder.length > 1 || groupOrder[0] !== "";

    for (const key of groupOrder) {
      const container = useGroups ? document.createElement("optgroup") : customInstructionSelect;
      if (useGroups) {
        container.label = key || CUSTOM_INSTRUCTIONS_UNGROUPED_LABEL;
      }
      for (const item of groupedItems.get(key)) {
        const option = document.createElement("option");
        option.value = item.text;
        option.textContent = item.text;
        container.appendChild(option);
      }
      if (useGroups) {
        customInstructionSelect.appendChild(container);
      }
    }
  }

  const values = instructions.map((item) => item.text);
  if (values.includes(previousValue)) {
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

  if (checkItem === "WEB表示") {
    if (resultType === "問題なし") {
      return host ? `${host}のWEB表示問題ございません。` : "WEB表示問題ございません。";
    }
    if (resultType === "電話エスカ") {
      return host
        ? `${host}のWEB表示に問題が発生しておりますため、電話エスカレーションいたします。`
        : "WEB表示に問題が発生しておりますため、電話エスカレーションいたします。";
    }
    return "";
  }

  if (checkItem === "リモートデスクトップ接続") {
    if (resultType === "問題なし") {
      return host ? `${host}へのリモートデスクトップ接続問題ございません。` : "リモートデスクトップ接続問題ございません。";
    }
    if (resultType === "電話エスカ") {
      return host
        ? `${host}へのリモートデスクトップ接続が行えないため、電話エスカレーションいたします。`
        : "リモートデスクトップ接続が行えないため、電話エスカレーションいたします。";
    }
    return "";
  }

  if (checkItem === "5分待機") {
    if (resultType === "問題なし") {
      return "5分待機いたします。";
    }
    if (resultType === "電話エスカ") {
      return "5分経過後も復旧しないため、電話エスカレーションいたします。";
    }
    if (resultType === "メールエスカ") {
      return "5分経過後も復旧しないため、メールエスカレーションいたします。";
    }
    return "";
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
updateMailEscalationAvailability();
refreshInstructionsFromFile();
importPendingWebCheckUrls();
