// Serialized by chrome.scripting: keep all dependencies inside this function.
// Clicks execute the page's own event handlers without accessing page globals.
export async function searchLogbookPage(callsign) {
  const visible = element => Boolean(element && element.getClientRects().length
    && getComputedStyle(element).visibility !== "hidden" && !element.disabled);
  const findInput = () => {
    const input = document.getElementById("search");
    return input instanceof HTMLInputElement && visible(input) && !input.readOnly ? input : null;
  };
  const input = findInput() || await new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const found = findInput();
      if (found) { clearTimeout(timer); observer.disconnect(); resolve(found); }
    });
    const timer = setTimeout(() => { observer.disconnect(); resolve(null); }, 10000);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  });
  if (!input) return { ok: false, message: "QRZ Logbook's search field is unavailable. Sign in, open your Logbook, and select Search My Logbook again." };

  input.focus();
  // Use the native setter and normal events for page listeners/frameworks.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, callsign);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  const clickable = element => visible(element) && element.getAttribute("aria-disabled") !== "true";
  const controls = [...document.querySelectorAll("button, input[type=button], input[type=submit], a, [role=button], [onclick]")];
  const findButton = document.getElementById("findBtn");
  // #findBtn is QRZ's documented control; some layouts wrap it in an input group.
  let button = [findButton, ...(findButton?.querySelectorAll("button, input, a, [role=button]") || [])]
    .find(element => element && clickable(element)
      && (element.matches("button, input[type=button], input[type=submit], a, [role=button]") || element.hasAttribute("onclick")));
  if (!button) {
    button = controls.find(element => clickable(element)
      && /\bgoto\s*\(\s*['"]search['"]\s*\)/.test(element.getAttribute("onclick") || ""));
  }
  if (!button) {
    // Restrict label-based matching to the field's immediate control group.
    const group = input.closest(".input-group") || input.parentElement;
    button = [...group.querySelectorAll("button, input[type=button], input[type=submit], a, [role=button]")]
      .find(element => clickable(element) && /^(?:find|search)$/i.test(
        (element.getAttribute("aria-label") || element.value || element.textContent || element.title || "").trim()));
  }
  if (button) {
    button.click();
    return { ok: true, method: "button" };
  }
  // QRZ's supplied markup handles keydown with event.keyCode === 13.
  // Dispatch only once: firing keydown and then submitting could search twice.
  const handled = !input.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Enter", code: "Enter", keyCode: 13, which: 13,
    bubbles: true, cancelable: true, composed: true
  }));
  if (handled) return { ok: true, method: "enter" };
  return { ok: false, message: "The callsign has been entered, but QRZ's search control was not recognized. Press Enter or click Find in the Logbook. If this persists, its page layout may have changed." };
}
