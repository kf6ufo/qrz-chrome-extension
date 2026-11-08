import { WEB_LOG_COMMENT_LIMIT, WEB_LOG_COMMENT_KEY, getWebLogCommentError } from "./settings.js";

const form = document.getElementById("settings-form");
const input = document.getElementById("web-log-comment");
const count = document.getElementById("comment-count");
const save = document.getElementById("save");
const clear = document.getElementById("clear");
const status = document.getElementById("status");
input.maxLength = WEB_LOG_COMMENT_LIMIT;
let loaded = false, busy = false;

function feedback(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function update() {
  const error = getWebLogCommentError(input.value);
  count.textContent = `${input.value.length} / ${WEB_LOG_COMMENT_LIMIT}`;
  input.setAttribute("aria-invalid", String(Boolean(error)));
  input.disabled = !loaded || busy;
  save.disabled = !loaded || busy || Boolean(error);
  clear.disabled = !loaded || busy;
  return error;
}
input.addEventListener("input", () => {
  const error = update();
  feedback(error || "Unsaved changes. Choose Save to use this comment.", Boolean(error));
});
clear.addEventListener("click", () => {
  input.value = "";
  update();
  feedback("Comment cleared. Choose Save to sign without a comment.");
  input.focus();
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!loaded || busy) return;
  const error = update();
  if (error) { feedback(error, true); return; }
  const comment = input.value;
  busy = true; update();
  try {
    await chrome.storage.local.set({ [WEB_LOG_COMMENT_KEY]: comment });
    feedback(comment ? "Saved. This comment will be included with new Web Log signatures." : "Saved. New Web Log signatures will have no comment.");
  } catch { feedback("Your comment could not be saved. Please try again.", true); }
  finally { busy = false; update(); }
});

try {
  const settings = await chrome.storage.local.get({ [WEB_LOG_COMMENT_KEY]: "" });
  const comment = settings[WEB_LOG_COMMENT_KEY];
  const error = getWebLogCommentError(comment);
  // A text input would silently remove newlines. Show an explicit replacement
  // message instead, and never save until the user chooses Save.
  input.value = typeof comment === "string" && !/[\u0000-\u001f\u007f]/.test(comment) ? comment : "";
  loaded = true; update();
  feedback(error ? `The saved comment needs correction. ${error} Enter a replacement or clear it, then Save.` : "", Boolean(error));
} catch {
  feedback("Your saved comment could not be loaded. Reload Settings to try again.", true);
}
