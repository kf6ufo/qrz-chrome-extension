# Verification — QRZ Callsign Extension 2.2.10

Verified November 7, 2026. The verification set contains **126 local checks**.

Version 2.2.10 updates the menu labels and documentation to **Look Up Their Callsign**, **Search My Logbook**, and **Sign Their Web Log**. The notifications screenshot was recaptured after reloading this version, with all three native menu labels visible. Its station lookup, Logbook search, and signing behavior is unchanged.

Version 2.2.9 waits during preparation when QRZ's intact native tab structure is present but its widget has not yet added roles. The existing 25-second preparation limit applies, and every poll revalidates the station and account. Signing never waits or retries a possible submission. Missing, malformed, and duplicate pending tab structures remain validation failures.

Version 2.2.8 introduced the shared callsign marker inside QRZ's native station summary instead of an allowlist of subscription and management styles. Exact URL, unique heading, exact callsign, account, and native form checks remain required. Version 2.2.6 introduced the updated extension name, README, help-page heading, and documentation screenshot.

| Check | Result | Latest execution |
| --- | --- | --- |
| Background orchestration and menu tests | 48/48 | Rerun for 2.2.10 |
| Web Log browser fixtures in Chrome | 65/65 | Prior passing run for 2.2.9; signing behavior unchanged |
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

The Web Log browser fixtures execute the production page function against synthetic HTML. All submissions are intercepted. They cover all five observed station heading styles; unsigned, already-signed, and no-Web states; identity and destination checks; drafts; unexpected or hidden controls; conflicting signature information; duplicate protection; delayed content; unfinished HTML parsing; and Biography selection. Regressions include FK8HA's no-Web/Biography flow, KC5UZI's already-signed Web state, and single intercepted submissions for both additional styles. Wrong callsigns, mixed duplicate headings, and callsigns found only in body or biography content must stop submission.

Delayed-widget fixtures start with parsed native markup before roles and ARIA state are added. They verify an already-signed result after initialization, no early clicks or submissions, and one explicit unsigned submission only after readiness. Missing or duplicate native structures and incorrect roles cannot be treated as loading.

The notification fixtures cover QRZ’s line-break formatting, multiple and portable callsigns, pagination, unchanged View links and account callsigns, unrelated pages, and idempotent linking.

## Live validation and limits

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
node --test tests/background.test.mjs
```

Serve the repository locally, then open `tests/weblog.html` and `tests/notifications.html` in Chrome and use their test buttons. These browser fixtures do not contact QRZ or submit real signatures.
