const ADD_URL_MENU_ID = "add-selection-to-web-check";
const PENDING_WEB_CHECK_URLS_KEY = "pendingWebCheckUrls";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

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

    // 選択範囲に複数行/複数URLが含まれる場合もあるため、空白文字で分割してから
    // それぞれをURLとして認識できるか個別に判定する。
    const candidates = (info.selectionText || "").split(/\s+/).filter((token) => token.length > 0);
    const validUrls = candidates.filter(isValidHttpUrl);
    if (validUrls.length === 0) return;

    const stored = await chrome.storage.local.get(PENDING_WEB_CHECK_URLS_KEY);
    const pending = stored[PENDING_WEB_CHECK_URLS_KEY] || [];
    pending.push(...validUrls);
    await chrome.storage.local.set({ [PENDING_WEB_CHECK_URLS_KEY]: pending });

    if (tab && tab.id !== undefined) {
      chrome.sidePanel.open({ tabId: tab.id }).catch((error) => console.error(error));
    }
  });
} else {
  console.warn("chrome.contextMenus が利用できません。拡張機能を再読み込みしてください。");
}

