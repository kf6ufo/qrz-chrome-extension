# Verification — QRZ Callsign Extension 2.2.13

Updated November 8, 2026. The verification set contains **229 local checks**. All **95 background checks**, **14 settings checks**, **83 Web Log browser checks**, and **10 Settings browser checks** passed for 2.2.13 (**202 current checks**). The unchanged Logbook and notification browser fixtures retain their prior passing results below.

Version 2.2.13 adds an Options page for an optional, reusable Web Log comment. The **171-character** limit matches the user's complete West Virginia example, excluding its outer quotation marks. The Colorado example is a placeholder; existing users continue signing with an empty comment until they explicitly save a setting. The page provides a live count, Save, and Clear followed by Save, and reports load/save errors. Comments remain local to the Chrome profile using `chrome.storage.local`; the manifest adds only the `storage` permission and the options page, without expanding site access. See Chrome's [storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) and [Options page documentation](https://developer.chrome.com/docs/extensions/develop/ui/options-page).

Signing loads and validates one settings snapshot per request. The page helper validates again and writes the exact plain text only after all station/account/form/draft checks, immediately before one native submit click. Preparation and observation never fill the form. Existing drafts, including ones matching the configured text, are protected. A stricter station form limit, invalid setting, unavailable storage, or unverifiable value stops submission rather than truncating or silently signing empty. Duplicate and lost-response guards remain in place.

Version 2.2.12 fixes **Search My Logbook** when an existing tab is showing QSO details at the same `/logbook` URL. It detects QRZ's visible, scoped QSO Detail title and hidden search field, reopens the main Logbook in the same tab once, and polls for the visible search field before submitting the requested search once. Read-only readiness checks can recover from transient document navigation errors, while permission failures and sign-in redirects stop. Unknown views and editing forms do not trigger a reset. No permissions were added.

Version 2.2.11 fixes **Look Up Their Callsign** and **Search My Logbook** for the linked callsigns observed on QRZ QSO details and PSKReporter. QRZ's HTTP station URLs are parsed and converted into canonical HTTPS destinations. PSKReporter's two map callsign link formats are parsed as literal text, without executing their JavaScript. A recognized station link takes precedence over selected text; otherwise, one valid selected callsign can be used on other links. Web Log signing retains its existing link validation and never falls back to a leftover selection on an unrecognized link. No permissions were added.

Version 2.2.10 updates the menu labels and documentation to **Look Up Their Callsign**, **Search My Logbook**, and **Sign Their Web Log**. The notifications screenshot was recaptured after reloading this version, with all three native menu labels visible. Its station lookup, Logbook search, and signing behavior is unchanged.

Version 2.2.9 waits during preparation when QRZ's intact native tab structure is present but its widget has not yet added roles. The existing 25-second preparation limit applies, and every poll revalidates the station and account. Signing never waits or retries a possible submission. Missing, malformed, and duplicate pending tab structures remain validation failures.

Version 2.2.8 introduced the shared callsign marker inside QRZ's native station summary instead of an allowlist of subscription and management styles. Exact URL, unique heading, exact callsign, account, and native form checks remain required. Version 2.2.6 introduced the updated extension name, README, help-page heading, and documentation screenshot.

| Check | Result | Latest execution |
| --- | --- | --- |
| Background orchestration and menu tests | 95/95 | Rerun for 2.2.13 |
| Settings validation and UI controller tests | 14/14 | Run for 2.2.13 |
| Web Log browser fixtures in Chrome | 83/83 | Rerun for 2.2.13 |
| Settings browser fixtures in Chrome | 10/10 | Run for 2.2.13 |
| Logbook search browser fixtures in Chrome | 14/14 | Prior passing run for 2.2.12; Logbook code unchanged |
| Notification callsign browser fixtures in Chrome | 13/13 | Prior passing run; notification code unchanged |

## Local coverage

The background suite simulates Chrome APIs and checks:

- One inactive checking tab in the originating window, without cross-window tab searches or window focus changes.
- Retention and activation of already-signed tabs, with informational feedback and Web still selected.
- Biography selection after verified signing or when there is no Web Log.
- Duplicate-request suppression, ordered requests, moved or closed tabs, and normal/incognito separation.
- Page readiness while unrelated resources remain loading, bounded HTML-parsing waits, and one recovery from a transient preparation failure.
- Delayed tab-widget initialization before an already-signed result, bounded initialization timeouts with tabs left open, and immediate rejection of malformed tabs.
- No retry for permission or validation failures, no automatic signature retry after a lost response, and preservation of a verified outcome if tab activation fails.
- Regression coverage for Look Up Their Callsign and Search My Logbook.
- Direct lookup and Logbook search for the observed HTTP QRZ QSO link, QRZ hostname variants, portable callsigns, and both PSKReporter map callsign functions without highlighted text.
- Valid selection fallback on unrecognized links, rejection of invalid selections, and recognized-link precedence over stale selection.
- PSKReporter source/frame validation and rejection of appended JavaScript, extra arguments, expressions, mismatched quotes, and unrelated functions. QRZ lookalike hosts, credentials, nonstandard ports, malformed encoding, queries, and fragments remain rejected without a valid selection.
- All newly supported read-only link formats remain unable to trigger signing using stale selected text.
- QSO recovery in the existing Logbook tab with and without query parameters, readiness while the old document still reports complete, delayed search fields, transient frame errors, bounded timeouts, permission errors, and sign-in redirects.
- Search submission occurs once after recovery, errors do not repeat searches, and queued Logbook requests remain ordered during recovery. A normal list or unrecognized view is not reset.
- Default-empty and configured comments, one settings read per request, unchanged comment snapshots through preparation/signing, and visible failure feedback without signing when storage or configured data is invalid.

The settings unit checks validate the exact 171-character example, boundary rejection, punctuation and Unicode preservation, single-line control restrictions, missing/invalid data, read/write failures, explicit Save, and Clear followed by Save. Browser checks load the production Options page with simulated storage and verify persistence across reopening, live counts, overlength correction without truncation, validation bypass rejection, and load/save failure handling. No real extension settings are changed by the browser fixtures.

The Web Log browser checks additionally intercept submissions with the Colorado greeting, the complete 171-character example, and text containing quotes, ampersands, and markup-like characters. They verify plain-text submission once, no premature writes or input/change events, draft preservation, native length limits, exact value verification, and duplicate suppression with configured text.

The Logbook browser fixtures execute the production inspector and search function against synthetic HTML. They reproduce the inspected QSO Detail title and hidden `#search`, verify visible/disabled/read-only fields and draft preservation, and check callsign entry, field events, one intercepted Find click, delayed field readiness, and the Enter fallback. These fixtures make no QRZ requests.

The Web Log browser fixtures execute the production page function against synthetic HTML. All submissions are intercepted. They cover all five observed station heading styles; unsigned, already-signed, and no-Web states; identity and destination checks; drafts; unexpected or hidden controls; conflicting signature information; duplicate protection; delayed content; unfinished HTML parsing; and Biography selection. Regressions include FK8HA's no-Web/Biography flow, KC5UZI's already-signed Web state, and single intercepted submissions for both additional styles. Wrong callsigns, mixed duplicate headings, and callsigns found only in body or biography content must stop submission.

Delayed-widget fixtures start with parsed native markup before roles and ARIA state are added. They verify an already-signed result after initialization, no early clicks or submissions, and one explicit unsigned submission only after readiness. Missing or duplicate native structures and incorrect roles cannot be treated as loading.

The notification fixtures cover QRZ’s line-break formatting, multiple and portable callsigns, pagination, unchanged View links and account callsigns, unrelated pages, and idempotent linking.

## Live validation and limits

For 2.2.13, the production Options page was previewed in Chrome using simulated local storage, and all 83 Web Log plus 10 Settings browser checks passed. A screenshot records the new page with the sample greeting and live counter. No real extension setting was changed and no live Web Log signature was submitted. The installed extension must be updated/reloaded before opening its Options page and trying a configured signature.

For 2.2.12, inspection of the user's open Logbook tab confirmed the same `/logbook` address, a visible `#lb_body .panelItem.title` containing `QSO Detail`, and a hidden `#search` input. QRZ's List control returned to the searchable list. A fresh canonical `https://logbook.qrz.com/logbook` navigation also opened that list with a visible search field and the same selected Logbook. No QSO was edited or submitted. The 14 new browser checks passed in Chrome; the installed extension still needs reloading for a complete live menu retry.

On November 8, read-only inspection of the user's open pages confirmed that QRZ QSO details linked JE4YMO with `http://www.qrz.com/db/JE4YMO`, while PSKReporter's map linked KF6UFO and TF1FT with `javascript:showAndSetCallsign('KF6UFO')` and `javascript:showAndSetRxCallsign('TF1FT')`. The new regressions use these exact formats. Chrome's [context-menu API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus#type-OnClickData) supplies a link URL and any selected text, rather than the link's displayed callsign. The previous resolver rejected both formats and ignored selected text whenever a link URL was present.

The installed extension was not reloaded during this check: browser security blocked navigation to Chrome's extension settings. A live menu retry with 2.2.11 remains for the user after reloading. No live Logbook searches or signatures were submitted during this investigation.

The user confirmed a complete unsigned-to-signed flow in version 2.2.2: QRZ displayed the account-specific added-on confirmation and the extension selected Biography. Version 2.2.5 retains that signing flow, but a fresh unsigned live submission was not repeated for 2.2.5.

The user reloaded version 2.2.5 and confirmed that an already-signed station’s tab remains open with the correct informational message. Read-only inspection also verified that a managed station without a Web tab is recognized as the no-Web outcome.

On November 2, read-only inspection of NH6D confirmed its lifetime-member heading (`csignl hamcall`), an unsigned native Web Log form, and the expected station destination. The user then reloaded version 2.2.7 and confirmed that signing succeeded and the biography opened.

On November 3, read-only inspection confirmed FK8HA's `csignm hamcall` heading and absence of a Web tab or panel. KC5UZI uses `csignz hamcall` and displayed the account-specific existing-signature confirmation with no signature form. Both headings are in QRZ's native station summary, outside the biography and Web Log content. The new fixtures reproduce these layouts. No live signature was submitted during this inspection.

The user reloaded version 2.2.8 and confirmed both FK8HA's no-Web/Biography outcome and KC5UZI's retained already-signed tab.

On November 6, read-only inspection of CE2EP found initialized native station tabs, the account-specific existing-signature confirmation, and no signature form. The reported early tab-readiness failure is covered by synthetic delayed-widget fixtures; the transient initialization state was not captured live.

The user reloaded version 2.2.9, retried CE2EP, and confirmed that its tab stays open with the already-signed message.

No real signature was submitted by the agent. The user initiated the live signature. Tests verify the inspected QRZ layout; future QRZ changes may require updated selectors. Unknown or conflicting states stop submission and leave the station tab open for review.

## Running the checks

```sh
node --test tests/background.test.mjs tests/settings.test.mjs
```

Serve the repository locally, then open `tests/options.html`, `tests/logbook.html`, `tests/weblog.html`, and `tests/notifications.html` in Chrome and use their test buttons. These browser fixtures do not contact QRZ, change real extension settings, or submit real signatures.
