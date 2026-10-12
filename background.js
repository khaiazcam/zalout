chrome.action.onClicked.addListener((tab) => {
  if (tab.id && tab.url && tab.url.startsWith("https://chat.zalo.me")) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" }).catch(() => {});
  } else {
    chrome.tabs.create({ url: "https://chat.zalo.me/" });
  }
});
