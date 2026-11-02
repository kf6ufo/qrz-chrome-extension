// Injected by chrome.scripting in the isolated world. Keep dependencies local.
// inspect is read-only; prepare opens Web; sign rechecks before ONE click;
// bio selects only QRZ's own Biography tab after a completed outcome.
export async function webLogPage(callsign, mode = "inspect", expectedAccount = null) {
  const result = (status, extra = {}) => ({ status, ...extra });
  // Stable, non-sensitive reasons let the caller explain which check stopped.
  const ambiguous = reason => result("ambiguous", { reason });
  // Background checks may start while ads are still loading. Wait only for
  // HTML parsing here; the account/station/tab/form checks still all follow.
  if (document.readyState === "loading") {
    return mode === "sign" ? ambiguous("page-loading") : result("loading");
  }
  const clean = value => (value || "").replace(/\s+/g, " ").trim();
  const visible = node => Boolean(node?.getClientRects().length
    && getComputedStyle(node).visibility !== "hidden"
    && getComputedStyle(node).display !== "none");
  const callPath = url => {
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin === "https://www.qrz.com" && !parsed.search
        ? decodeURIComponent(parsed.pathname.replace(/^\/db\//, "").replace(/\/$/, "")).toUpperCase() : null;
    } catch { return null; }
  };
  if (location.origin !== "https://www.qrz.com") return result("login-required");
  const logout = document.querySelector('#qrztop a[href^="https://www.qrz.com/logout/"]');
  if (!logout) {
    const login = /log\s*in|sign\s*in/i.test(document.querySelector("#qrztop")?.textContent || "")
      || /\/login(?:\/|$)/.test(location.pathname);
    return login ? result("login-required") : ambiguous("account-menu");
  }
  // Derive identity only from QRZ's account menu, never biography or visitor text.
  const menu = logout.closest("ul");
  const accountLinks = [...(menu?.querySelectorAll('a[href^="https://www.qrz.com/db/"]') || [])];
  const account = accountLinks.length === 1 ? callPath(accountLinks[0].href) : null;
  if (!account) return ambiguous("account-menu");
  if (expectedAccount && account !== expectedAccount) return ambiguous("account-changed");
  // QRZ uses distinct headings for ordinary, managed, and lifetime-member calls.
  // Still require one authoritative heading within csdata and an exact call.
  const headings = document.querySelectorAll("#csdata .csigns.hamcall, #csdata .csignmg.hamcall, #csdata .csignl.hamcall");
  if (callPath(location.href) !== callsign || headings.length !== 1
    || clean(headings[0].textContent).toUpperCase() !== callsign) {
    return ambiguous("station");
  }
  const tabs = document.querySelector("#tabs > ul[role=tablist]");
  if (!tabs || !tabs.querySelector('a[href="#t_bio"]')) return ambiguous("tabs");
  if (mode === "bio") {
    const links = tabs.querySelectorAll('a[href="#t_bio"]');
    const panels = document.querySelectorAll("#tabs > #t_bio");
    if (links.length !== 1 || panels.length !== 1) return ambiguous("bio-layout");
    const link = links[0], panel = panels[0], tab = link.closest('[role="tab"]');
    const isOpen = () => tab?.getAttribute("aria-selected") === "true"
      && panel.getAttribute("aria-hidden") === "false" && visible(panel);
    if (!isOpen()) {
      if (!visible(link) || tab?.getAttribute("aria-disabled") === "true") return ambiguous("bio-hidden");
      link.click();
      const deadline = Date.now() + 3000;
      while (!isOpen() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    }
    return isOpen() ? result("bio", { account }) : ambiguous("bio-not-open");
  }
  const links = tabs.querySelectorAll('a[href="#t_webcon"]');
  const panels = document.querySelectorAll("#tabs > #t_webcon");
  if (!links.length && !panels.length) return result("no-web-tab", { account });
  if (links.length !== 1 || panels.length !== 1 || !/^Web(?: \d+)?$/.test(clean(links[0].textContent))) {
    return ambiguous("web-layout");
  }
  const link = links[0];
  const panel = panels[0];
  const tab = link.closest('[role="tab"]');
  const isOpen = () => tab?.getAttribute("aria-selected") === "true"
    && panel.getAttribute("aria-hidden") === "false" && visible(panel);
  if (mode === "prepare" && !isOpen()) {
    if (!visible(link) || tab?.getAttribute("aria-disabled") === "true") return ambiguous("web-hidden");
    link.click();
    const deadline = Date.now() + 3000;
    while (!isOpen() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if ((mode === "prepare" || mode === "sign") && !isOpen()) return ambiguous("web-not-open");
  const readState = () => ({
    forms: [...panel.querySelectorAll("form")],
    signed: [...panel.querySelectorAll(":scope > p")].some(p => {
      const match = clean(p.textContent).match(/^Your Web Contact, ([A-Z0-9/]+) was added on \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      return match?.[1] === account;
    }),
    listed: [...panel.querySelectorAll('#wclist a')].some(a =>
      clean(a.textContent).toUpperCase() === account && callPath(a.href) === account)
  });
  let state = readState();
  const loading = () => !state.forms.length && !state.signed && !state.listed;
  // QRZ fetches Web Log contents after opening the tab. aria-selected and
  // visibility describe the panel, not whether its form/confirmation arrived.
  // Only prepare waits; sign never defers or retries a possible submission.
  if (mode === "prepare" && loading()) {
    const deadline = Date.now() + 15000;
    while (loading() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      state = readState();
    }
    if (!isOpen()) return ambiguous("web-not-open");
  }
  if (loading()) return ambiguous("web-loading");
  const { forms, signed, listed } = state;
  if (signed && !forms.length) return result("already-signed", { account });
  // A conflicting visitor entry or signed message never authorizes submission.
  if (signed || listed || forms.length !== 1) return ambiguous("form-conflict");
  const form = forms[0];
  const fields = [...form.querySelectorAll("input, button, select, textarea")];
  const hidden = name => fields.filter(field => field.name === name && field.type === "hidden").length === 1;
  const comments = fields.filter(field => field.name === "wc_comment" && field.type === "text");
  const submits = fields.filter(field => field.type === "submit");
  const button = submits[0];
  if (form.method.toLowerCase() !== "post" || callPath(form.action) !== callsign
    || new URL(form.action).hash || form.target) return ambiguous("form-destination");
  if (fields.length !== 4 || !hidden("webcon") || !hidden("wc_userid")
    || comments.length !== 1) return ambiguous("form-fields");
  if (comments[0].value !== "") return ambiguous("comment-draft");
  if (comments[0].disabled || comments[0].readOnly) return ambiguous("form-fields");
  if (submits.length !== 1 || clean(button.value) !== `DE ${account}`) return ambiguous("submit-identity");
  if (button.disabled || button.hasAttribute("formaction") || button.hasAttribute("formmethod")
    || button.hasAttribute("formtarget")) return ambiguous("submit-controls");
  if (!/^Add your Web Contact:/.test(clean(form.parentElement.textContent))) return ambiguous("prompt");
  if (mode !== "sign") return result("unsigned", { account });
  if (!visible(button) || !visible(comments[0])) return ambiguous("form-hidden");
  if (form.dataset.qrzSigning) return ambiguous("duplicate");
  form.dataset.qrzSigning = "true";
  button.click(); // QRZ's native form submits with the existing signed-in session.
  return result("submitted", { account });
}

export function showWebLogFeedback(callsign, message) {
  document.getElementById("qrz-extension-feedback")?.remove();
  const host = document.createElement("div");
  host.id = "qrz-extension-feedback";
  host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;max-width:420px";
  const root = host.attachShadow({ mode: "closed" });
  const box = document.createElement("section");
  box.setAttribute("role", "status");
  box.style.cssText = "font:16px/1.5 system-ui,sans-serif;background:#effaff;color:#12223b;border:2px solid #036976;border-radius:10px;padding:18px;box-shadow:0 4px 18px #0005";
  const title = document.createElement("strong");
  title.textContent = `QRZ · ${callsign}`;
  const version = document.createElement("small");
  version.style.cssText = "font-size:11px;font-weight:400;margin-left:10px";
  version.textContent = "v2.2.7";
  title.append(version);
  const text = document.createElement("p");
  text.textContent = message;
  const dismiss = document.createElement("button");
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => host.remove());
  box.append(title, text, dismiss);
  root.append(box);
  document.documentElement.append(host);
}
