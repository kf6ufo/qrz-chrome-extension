# Verification — QRZ Callsign Lookup 2.2.5

Verified November 1, 2026. The verification set contains **99 local checks**.

| Check | Result | Latest execution |
| --- | --- | --- |
| Background orchestration and menu tests | 45/45 | Rerun for 2.2.5 |
| Web Log browser fixtures in Chrome | 41/41 | Rerun for 2.2.5 |
| Notification callsign browser fixtures in Chrome | 13/13 | Prior passing run; notification code unchanged |

## Local coverage

The background suite simulates Chrome APIs and checks:

- One inactive checking tab in the originating window, without cross-window tab searches or window focus changes.
- Retention and activation of already-signed tabs, with informational feedback and Web still selected.
- Biography selection after verified signing or when there is no Web Log.
- Duplicate-request suppression, ordered requests, moved or closed tabs, and normal/incognito separation.
- Page readiness while unrelated resources remain loading, bounded HTML-parsing waits, and one recovery from a transient preparation failure.
- No retry for permission or validation failures, no automatic signature retry after a lost response, and preservation of a verified outcome if tab activation fails.
- Regression coverage for Lookup Callsign and Search My Logbook.

The Web Log browser fixtures execute the production page function against synthetic HTML. All submissions are intercepted. They cover ordinary and managed-station headings; unsigned, already-signed, and no-Web states; identity and destination checks; drafts; unexpected or hidden controls; conflicting signature information; duplicate protection; delayed content; unfinished HTML parsing; and Biography selection.

The notification fixtures cover QRZ’s line-break formatting, multiple and portable callsigns, pagination, unchanged View links and account callsigns, unrelated pages, and idempotent linking.

## Live validation and limits

The user confirmed a complete unsigned-to-signed flow in version 2.2.2: QRZ displayed the account-specific added-on confirmation and the extension selected Biography. Version 2.2.5 retains that signing flow, but a fresh unsigned live submission was not repeated for 2.2.5.

The user reloaded version 2.2.5 and confirmed that an already-signed station’s tab remains open with the correct informational message. Read-only inspection also verified that a managed station without a Web tab is recognized as the no-Web outcome.

No real signature was submitted by the agent. The user initiated the live signature. Tests verify the inspected QRZ layout; future QRZ changes may require updated selectors. Unknown or conflicting states stop submission and leave the station tab open for review.

## Running the checks

```sh
node --test tests/background.test.mjs
```

Serve the repository locally, then open `tests/weblog.html` and `tests/notifications.html` in Chrome and use their test buttons. These browser fixtures do not contact QRZ or submit real signatures.
