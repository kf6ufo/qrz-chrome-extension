export const WEB_LOG_COMMENT_LIMIT = 171;
export const WEB_LOG_COMMENT_KEY = "webLogComment";

// Preserve the user's text exactly. QRZ uses a single-line text input.
export function getWebLogCommentError(value) {
  if (typeof value !== "string") return "Enter a text comment, or leave it empty.";
  if (value.length > WEB_LOG_COMMENT_LIMIT) return `Use ${WEB_LOG_COMMENT_LIMIT} characters or fewer.`;
  if (/[\u0000-\u001f\u007f]/.test(value)) return "Use a single line without tabs or other control characters.";
  return "";
}

export async function loadWebLogComment() {
  let settings;
  try { settings = await chrome.storage.local.get({ [WEB_LOG_COMMENT_KEY]: "" }); }
  catch {
    throw new Error("Your Web Log comment could not be loaded. Open extension Settings and try again. Nothing was submitted.");
  }
  const comment = settings[WEB_LOG_COMMENT_KEY];
  const error = getWebLogCommentError(comment);
  if (error) throw new Error(`Check your Web Log comment in extension Settings. ${error} Nothing was submitted.`);
  return comment;
}
