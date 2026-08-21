const ADD_URL_MENU_ID = "add-selection-to-web-check";
const PENDING_WEB_CHECK_URLS_KEY = "pendingWebCheckUrls";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

function isValidHttpUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// "contextMenus" 権限の反映前（拡張機能の再読み込み前）は chrome.contextMenus が
// 未定義になり得るため、ここが無くても他の初期化処理を止めないようガードする。
if (chrome.contextMenus) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: ADD_URL_MENU_ID,
      title: "選択したURLをWEB表示確認に追加",
      contexts: ["selection"],
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== ADD_URL_MENU_ID) return;

    const selectedText = (info.selectionText || "").trim();
    if (!isValidHttpUrl(selectedText)) return;

    const stored = await chrome.storage.local.get(PENDING_WEB_CHECK_URLS_KEY);
    const pending = stored[PENDING_WEB_CHECK_URLS_KEY] || [];
    pending.push(selectedText);
    await chrome.storage.local.set({ [PENDING_WEB_CHECK_URLS_KEY]: pending });

    if (tab && tab.id !== undefined) {
      chrome.sidePanel.open({ tabId: tab.id }).catch((error) => console.error(error));
    }
  });
} else {
  console.warn("chrome.contextMenus が利用できません。拡張機能を再読み込みしてください。");
}

