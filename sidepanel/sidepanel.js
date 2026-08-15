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
