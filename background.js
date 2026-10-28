import { sanitizeCallsign } from "./callsign.js";
import { searchLogbookPage } from "./logbook.js";

const LOGBOOK_URL = "https://logbook.qrz.com/logbook";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Serialize requests so two quick selections cannot create duplicate logbook tabs
// or overwrite the search field before the preceding lookup is submitted.
let logbookQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }
    chrome.contextMenus.create({ id: "qrz", title: "QRZ", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "qrzLookup", parentId: "qrz", title: "Lookup Callsign", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "qrzLogbook", parentId: "qrz", title: "Search My Logbook", contexts: ["selection"] });
  });
});

async function showError(message) {
  console.warn("QRZ Lookup:", message);
  await chrome.tabs.create({ url: chrome.runtime.getURL("help.html") + "#" + encodeURIComponent(message) });
}

async function waitForLoad(tabId) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    // Check current state instead of relying on a load listener installed too late.
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete" && !tab.discarded) return tab;
    await sleep(250);
  }
  throw new Error("QRZ Logbook is still loading. Let it finish, then select Search My Logbook again.");
}

export async function searchLogbook(callsign, sourceTab) {
  const tabs = (await chrome.tabs.query({ url: ["https://logbook.qrz.com/*"] }))
    .filter(tab => Boolean(tab.incognito) === Boolean(sourceTab?.incognito));
  // Prefer the actual logbook, then the source window, then the most recently used tab.
  const rank = tab => (new URL(tab.url).pathname.startsWith("/logbook") ? 4 : 0)
    + (tab.windowId === sourceTab?.windowId ? 2 : 0) + (tab.active ? 1 : 0);
  tabs.sort((a, b) => rank(b) - rank(a) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  let tab = tabs[0];
  if (!tab) {
    const options = { url: LOGBOOK_URL, active: true };
    if (sourceTab?.windowId != null) options.windowId = sourceTab.windowId;
    tab = await chrome.tabs.create(options);
  } else {
    tab = await chrome.tabs.update(tab.id, { active: true });
  }
  const win = await chrome.windows.get(tab.windowId);
  await chrome.windows.update(tab.windowId, {
    focused: true,
    ...(win.state === "minimized" ? { state: "normal" } : {})
  });
  tab = await waitForLoad(tab.id);
  // A tab on another logbook-host page is reused, but needs the logbook UI.
  if (tab.url && new URL(tab.url).hostname === "logbook.qrz.com"
      && !/^\/logbook(?:\/|$)/.test(new URL(tab.url).pathname)) {
    await chrome.tabs.update(tab.id, { url: LOGBOOK_URL });
    tab = await waitForLoad(tab.id);
  }
  if (!tab.url || new URL(tab.url).origin !== "https://logbook.qrz.com") {
    throw new Error("Sign in to QRZ in the opened tab, open your Logbook, then select Search My Logbook again.");
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, func: searchLogbookPage, args: [callsign]
  });
  if (!results[0]?.result?.ok) {
    throw new Error(results[0]?.result?.message || "QRZ could not receive the search. Try again after the Logbook finishes loading.");
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!["qrzLookup", "qrzLogbook"].includes(info.menuItemId)) return;
  const callsign = sanitizeCallsign(info.selectionText);
  if (!callsign) {
    void showError("Select one complete callsign, for example KF6UFO, EA8/KF6UFO, or KF6UFO/P. Surrounding punctuation is okay; sentences and lists are not.").catch(console.error);
    return;
  }
  if (info.menuItemId === "qrzLookup") {
    const options = { url: "https://www.qrz.com/db/" + encodeURIComponent(callsign), active: true };
    if (tab?.windowId != null) options.windowId = tab.windowId;
    void chrome.tabs.create(options).catch(error => showError(error.message)).catch(console.error);
  } else {
    logbookQueue = logbookQueue.then(() => searchLogbook(callsign, tab))
      .catch(error => showError(error.message)).catch(console.error);
  }
});
