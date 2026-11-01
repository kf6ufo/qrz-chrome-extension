# QRZ Callsign Lookup 2.2.5

Right-click a station callsign in QRZ confirmation notifications and choose **QRZ → Sign Web Log**. On other pages, highlight one callsign and use the same menu.

| Web Log state | What happens |
| --- | --- |
| Available and unsigned | Adds your signature with an empty comment, verifies QRZ’s confirmation, then displays the biography. |
| Already signed | Keeps the station tab open on Web and displays “You have already signed CALL’s Web Log.” Nothing is submitted. |
| No Web Log | Displays the biography with a brief informational message. |
| Login required or an unfamiliar page | Leaves the station tab open with an explanation. |
| Signature attempted but confirmation unavailable | Leaves the tab open for review and never retries the signature automatically. |

## Install or update

1. [Download the main branch ZIP](https://github.com/kf6ufo/qrz-chrome-extension/archive/refs/heads/main.zip) and extract it into a permanent folder. Alternatively, clone [the repository](https://github.com/kf6ufo/qrz-chrome-extension).
2. Open `chrome://extensions` in the Chrome profile where you use QRZ and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`. If an older copy is loaded from another folder, turn it off first.
4. Accept the requested QRZ site access and sign in to QRZ in that Chrome profile.
5. Refresh your QRZ notifications page so the confirmation callsigns become links.

For an existing installation, replace the files in its current folder with the updated files, then click **Reload** on QRZ Callsign Lookup at `chrome://extensions`. If you cloned the repository, `git pull --ff-only` updates the files before you reload. Keep the extension folder in place; Chrome reads the local files from there. Each Chrome profile needs its own installation. Enable **Allow in incognito** if you want to use it in private windows.

## Commands

- **Sign Web Log** checks the requested station using your current QRZ session and follows the outcomes above. It does not create a QSO or confirm a logbook contact.
- **Lookup Callsign** opens the station’s public QRZ biography in a new tab in the originating window.
- **Search My Logbook** fills QRZ’s visible search field and invokes Find. It can reuse and bring forward a Logbook tab from another window in the same normal/incognito context.

## Signing and tab behavior

Signing opens one inactive checking tab in the **same Chrome window where you chose the menu**. It does not search other windows for station tabs or repurpose existing tabs. The notifications page stays in place. After the check, the station tab becomes active: Biography is selected after a successful signature or when there is no Web Log; Web stays selected when you already signed it. No tabs are closed by the signing action.

Repeated requests for the same station in the same window share one pending operation. Different station requests run in order. A closed or moved source tab cancels a queued request. Pending requests do not survive an extension reload or browser restart. The extension does not open tabs on browser startup.

QRZ loads Web Log contents after the Web tab opens. The extension waits for the form or signature confirmation, rather than treating an empty loading panel as a result. It checks parsed station content while unrelated resources may still be loading and can recover once from an interrupted preparation check. These checks never retry a possible signature submission.

## Callsigns and notifications

On QRZ’s [notifications page](https://forums.qrz.com/index.php?account/alerts), confirmation station callsigns become biography links. Your own callsign after `DE` and QRZ’s existing **View** links stay unchanged. Linking runs once per page load and supports paginated notifications. Refresh the page after updating the extension.

Selected callsigns are normalized to uppercase. Surrounding punctuation and portable callsigns such as `EA8/W1AW`, `W1AW/P`, and `W1AW/7` are supported. Prose, multiple callsigns, URLs, and malformed calls are rejected. This checks plausible syntax, not whether a call is licensed.

When you use a QRZ biography link, the link identifies the station even if other text remains selected. An unrelated link cannot use stale selected text to authorize a signature.

## Signature checks

The extension requires the exact requested HTTPS station URL and one matching QRZ callsign heading, including QRZ’s managed-station heading style. It identifies your account from QRZ’s account menu beside Logout and checks that the account remains unchanged.

Signing requires QRZ’s Web panel and exactly one POST form back to the same station, the expected hidden inputs, an empty usable comment field, and the enabled `DE YOURCALL` submit control. Existing drafts, changed destinations, unexpected controls, hidden controls, conflicting signature information, and account changes stop the operation.

All conditions are rechecked immediately before one native submit-button click. Success requires QRZ’s account-specific added-on confirmation. A lost navigation response or missing confirmation never causes another click. Already-signed detection requires the account-specific confirmation without a competing form. Unfamiliar states leave the page open for review.

## Permissions and privacy

- `contextMenus`: adds the callsign commands for selections and links.
- `scripting`: operates the requested QRZ page and displays feedback.
- `https://www.qrz.com/*` and `https://logbook.qrz.com/*`: station checks, signing, and Logbook searches.
- A content script on `https://forums.qrz.com/index.php*`, further restricted in code to notifications: turns confirmation station names into links.

The extension uses your existing QRZ session. It does not store credentials or activity history, include analytics, load remote code, or use external libraries. It has no all-sites or broad `tabs` permission. Selected callsigns are sent to QRZ when you request an action; signing submits QRZ’s existing Web Contact form using your session.

## Verification

See [the verification report](tests/RESULTS.md) for coverage and live-check limits.

Run the background checks with:

```sh
node --test tests/background.test.mjs
```

To run the browser fixtures, serve this folder locally, open `tests/weblog.html` and `tests/notifications.html`, and click their test buttons. The fixtures use synthetic accounts and intercept submissions; they do not sign real QRZ Web Logs.

`previous-version/` preserves the original version 1.0 manifest and background script. QRZ may change its layout; unfamiliar layouts stop signing and show the station page for review.

## License

MIT. See [LICENSE](LICENSE). This helper is not an official QRZ product.
