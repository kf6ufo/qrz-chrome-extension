import { sanitizeCallsign } from "./callsign.js";
import { searchLogbookPage } from "./logbook.js";
import { webLogPage, showWebLogFeedback } from "./weblog.js";

const LOGBOOK_URL = "https://logbook.qrz.com/logbook";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Serialize requests so two quick selections cannot create duplicate logbook tabs
// or overwrite the search field before the preceding lookup is submitted.
let logbookQueue = Promise.resolve();
let webLogQueue = Promise.resolve();
const pendingWebLogs = new Set();

// A link context must identify its own station; stale selected text must never
// cause a signature for a different station.
export function menuCallsign(info) {
  if (!info.linkUrl) return sanitizeCallsign(info.selectionText);
  try {
    const url = new URL(info.linkUrl);
    if (url.origin !== "https://www.qrz.com" || url.search || url.hash) return null;
    const match = url.pathname.match(/^\/db\/(.+?)\/?$/i);
    return match ? sanitizeCallsign(decodeURIComponent(match[1])) : null;
  } catch { return null; }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }
    chrome.contextMenus.create({ id: "qrz", title: "QRZ", contexts: ["selection", "link"] });
    chrome.contextMenus.create({ id: "qrzLookup", parentId: "qrz", title: "Look Up Their Callsign", contexts: ["selection", "link"] });
    chrome.contextMenus.create({ id: "qrzLogbook", parentId: "qrz", title: "Search My Logbook", contexts: ["selection", "link"] });
    chrome.contextMenus.create({ id: "qrzWebLog", parentId: "qrz", title: "Sign Their Web Log", contexts: ["selection", "link"] });
  });
});

async function showError(message) {
  console.warn("QRZ Callsign Extension:", message);
  await chrome.tabs.create({ url: chrome.runtime.getURL("help.html") + "#" + encodeURIComponent(message) });
}

async function waitForLoad(tabId, label = "QRZ Logbook") {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    // Check current state instead of relying on a load listener installed too late.
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete" && !tab.pendingUrl && !tab.discarded) return tab;
    await sleep(250);
  }
  throw new Error(`${label} is still loading. Let it finish, then try the menu again.`);
}

export async function signWebLog(callsign, sourceTab) {
  if (!Number.isInteger(sourceTab?.id) || !Number.isInteger(sourceTab?.windowId)) {
    throw new Error("Sign Their Web Log needs the tab where you chose the menu.");
  }
  const source = await chrome.tabs.get(sourceTab.id);
  if (source.windowId !== sourceTab.windowId || Boolean(source.incognito) !== Boolean(sourceTab.incognito)) {
    throw new Error("The original tab moved or closed. Choose Sign Their Web Log again in its current window.");
  }
  const url = "https://www.qrz.com/db/" + encodeURIComponent(callsign);
  const matches = value => {
    try {
      const parsed = new URL(value);
      return parsed.origin === "https://www.qrz.com" && !parsed.search
        && decodeURIComponent(parsed.pathname.replace(/\/$/, "")).toUpperCase() === "/DB/" + callsign;
    } catch { return false; }
  };
  // Only this explicit menu click creates a work tab. Never search other windows
  // for station tabs or fall back to whichever window happens to have focus.
  const tab = await chrome.tabs.create({ url, active: false,
    windowId: sourceTab.windowId, openerTabId: sourceTab.id });
  const ownedTab = async () => {
    const current = await chrome.tabs.get(tab.id);
    if (current.windowId !== sourceTab.windowId
        || Boolean(current.incognito) !== Boolean(sourceTab.incognito)) {
      throw new Error("The Web Log tab moved. Check that tab manually.");
    }
    return current;
  };
  const messages = {
    "success": `Signed ${callsign}'s Web Log. QRZ confirmed your Web Contact was added.`,
    "already-signed": `You have already signed ${callsign}'s Web Log.`,
    "no-web-tab": `${callsign} doesn't publish a Web Log. Showing the biography.`,
    "login-required": "Sign in to QRZ in this Chrome profile, then choose Sign Their Web Log again. Nothing was submitted.",
    "ambiguous": "The Web Log state could not be verified. Nothing was submitted. Check the Web tab manually.",
    "unconfirmed": "A sign click was attempted, but QRZ's confirmation could not be verified. No automatic retry was made. Check the Web tab before trying again."
  };
  const run = async (mode, account = null) => {
    await ownedTab();
    const output = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: webLogPage,
      args: [callsign, mode, account], injectImmediately: true });
    return output[0]?.result || { status: "ambiguous" };
  };
  const prepareStation = async () => {
    const deadline = Date.now() + 25000;
    let navigationRetries = 0;
    while (Date.now() < deadline) {
      const current = await ownedTab();
      if (!matches(current.url)) {
        if (matches(current.pendingUrl) || !current.url || current.url === "about:blank") {
          await sleep(250);
          continue;
        }
        return { status: "login-required" };
      }
      let state;
      try { state = await run("prepare"); }
      catch (error) {
        // Preparation can open Web but never submits. Recover once from a
        // replaced frame; never retry sign or retry a returned validation failure.
        if (navigationRetries === 0 && /frame|document|navigation|context.*destroy/i.test(error.message)) {
          navigationRetries++;
          await sleep(250);
          continue;
        }
        throw error;
      }
      if (state.status !== "loading") return state;
      await sleep(250);
    }
    return { status: "ambiguous", reason: "page-loading" };
  };
  const reasons = {
    "account-menu": "QRZ's signed-in account could not be identified.",
    "account-changed": "The signed-in QRZ account changed during the check.",
    "station": "The loaded station did not match the requested callsign.",
    "tabs": "QRZ's station tabs were not ready.",
    "bio-layout": "QRZ's Biography tab could not be identified.",
    "bio-hidden": "QRZ's Biography tab was unavailable.",
    "bio-not-open": "QRZ's Biography tab did not finish opening.",
    "web-layout": "QRZ's Web Log layout was not recognized.",
    "web-hidden": "QRZ's Web tab was unavailable.",
    "web-not-open": "QRZ's Web tab did not finish opening.",
    "web-loading": "QRZ's Web Log contents did not finish loading. Wait for the page to finish, then try the menu again.",
    "form-conflict": "QRZ's signature form and existing signature information were inconsistent.",
    "form-destination": "The signature form did not lead back to the requested station.",
    "form-fields": "QRZ's signature form contained unexpected controls.",
    "comment-draft": "The comment field contained a draft or could not be used.",
    "submit-identity": "The signature button did not match your signed-in account.",
    "submit-controls": "The signature button was disabled or changed its destination.",
    "prompt": "QRZ's Add your Web Contact prompt was not recognized.",
    "form-hidden": "The signature controls were not visible.",
    "duplicate": "This page already had a signature attempt in progress.",
    "page-unavailable": "The page changed or became unavailable during the check.",
    "page-loading": "QRZ's station page is still loading. The tab has been left open."
  };
  const finish = async (status, account = null, reason = null) => {
    await ownedTab();
    let message = messages[status] || messages.ambiguous;
    if (status === "ambiguous" && reasons[reason]) message += " " + reasons[reason];
    if (status === "success" || status === "no-web-tab") {
      try {
        const state = await run("bio", account);
        if (state.status !== "bio") message += " Select Biography to view the bio.";
      } catch { message += " Select Biography to view the bio."; }
    }
    await ownedTab();
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showWebLogFeedback,
        args: [callsign, message], injectImmediately: true });
    } catch { console.warn("QRZ Web Log:", message); }
    // Selecting this tab does not focus a different Chrome window. It remains
    // in the window where the user invoked the command.
    try { await chrome.tabs.update(tab.id, { active: true }); }
    catch (error) {
      // A presentation failure must not erase a verified signature outcome.
      console.warn("QRZ Web Log tab activation:", error.message);
    }
    return { status, message };
  };
  let attempted = false;
  try {
    await ownedTab();
    // QRZ's own parsed content is the readiness signal. Slow ads can leave
    // Chrome's tab status loading after the Web Log is already usable.
    let state = await prepareStation();
    if (state.status !== "unsigned") return await finish(state.status, state.account, state.reason);
    const account = state.account;
    // This work tab was just opened from QRZ. The old reused-tab flow refreshed
    // here, but same-URL reloads can interrupt the next check before Chrome
    // reports loading. Keep the fresh page and revalidate in sign immediately.
    attempted = true;
    // A POST navigation may destroy executeScript's response. Observe only;
    // never submit again after a navigation error or a timeout.
    try { state = await run("sign", account); } catch { state = { status: "submitted" }; }
    if (state.status !== "submitted") return await finish(state.status, state.account, state.reason);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await sleep(300);
      try {
        state = await run("prepare", account);
        if (state.status === "already-signed") return await finish("success", account);
      } catch { /* Navigation may temporarily destroy the isolated world. */ }
    }
    return await finish("unconfirmed", account);
  } catch (error) {
    console.warn("QRZ Web Log:", error.message);
    return await finish(attempted ? "unconfirmed" : "ambiguous", null, "page-unavailable");
  }
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
  if (!["qrzLookup", "qrzLogbook", "qrzWebLog"].includes(info.menuItemId)) return;
  const callsign = menuCallsign(info);
  if (!callsign) {
    // Invalid links/selections cannot start signing or create surprise help tabs.
    if (info.menuItemId === "qrzWebLog") console.warn("QRZ: Choose one callsign or its QRZ biography link.");
    else void showError("Select one complete callsign, for example KF6UFO, EA8/KF6UFO, or KF6UFO/P. Surrounding punctuation is okay; sentences and lists are not.").catch(console.error);
    return;
  }
  if (info.menuItemId === "qrzLookup") {
    const options = { url: "https://www.qrz.com/db/" + encodeURIComponent(callsign), active: true };
    if (tab?.windowId != null) options.windowId = tab.windowId;
    void chrome.tabs.create(options).catch(error => showError(error.message)).catch(console.error);
  } else if (info.menuItemId === "qrzLogbook") {
    logbookQueue = logbookQueue.then(() => searchLogbook(callsign, tab))
      .catch(error => showError(error.message)).catch(console.error);
  } else {
    const key = `${tab?.windowId}:${Boolean(tab?.incognito)}:${callsign}`;
    if (pendingWebLogs.has(key)) return;
    pendingWebLogs.add(key);
    webLogQueue = webLogQueue.then(() => signWebLog(callsign, tab))
      .catch(error => console.warn("QRZ Web Log:", error.message))
      .finally(() => pendingWebLogs.delete(key));
  }
});
