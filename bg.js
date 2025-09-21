// bg.js (MV3 service worker)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'trustcall:ping') {
    sendResponse({ ok: true });
    return; // sync response
  }

  if (msg?.type === 'trustcall:openDashboardWithSnapshot' && msg.dataUrl) {
    chrome.storage.local.set({ pendingSnapshot: msg.dataUrl }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }, () => {
        sendResponse({ ok: true });
      });
    });
    return true; // async response
  }
});
