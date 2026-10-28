# QRZ Callsign Lookup 2.0

Highlight one callsign on a page, right-click, and choose **QRZ**:

- **Lookup Callsign** opens the public QRZ station page in a new tab.
- **Search My Logbook** reuses a QRZ Logbook tab in any Chrome window, activates it, restores a minimized window, fills the search field, and clicks Find. If no tab exists, it opens the logbook and waits for it. An already open logbook is not reloaded for each search.

## Download the extension

First, save the repository to a permanent folder on your computer. Choose either method:

- **Download ZIP (no Git required):** Open the [GitHub repository](https://github.com/kf6ufo/qrz-chrome-extension), choose **Code → Download ZIP**, and extract the ZIP. Move the extracted `qrz-chrome-extension-main` folder somewhere you want to keep it.
- **Clone with Git:** Open a terminal in the parent folder where you want to keep the extension, then run:

  ```sh
  git clone https://github.com/kf6ufo/qrz-chrome-extension.git
  ```

The extension folder is the downloaded or cloned folder containing `manifest.json`. Keep it in place after loading it in Chrome; Chrome uses these local files.

## Load in Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. If the previous version is already installed from this folder, click its **Reload** button. Otherwise click **Load unpacked** and select the extension folder you downloaded or cloned (the one containing `manifest.json`, not `previous-version/`).
3. Accept Chrome's requested QRZ Logbook site access. Sign in at https://logbook.qrz.com/logbook using your normal QRZ account.
4. Highlight `KF6UFO`, right-click, and try each menu item. For logbook reuse, keep the QRZ tab in a second window and try another callsign: the same tab should come forward and show the new search.

## Update an installed copy

If you cloned with Git, open a terminal in your `qrz-chrome-extension` folder and run:

```sh
git pull --ff-only
```

If you downloaded a ZIP, download and extract the latest ZIP, then copy its contents into the same extension folder, replacing the older files.

After either method, open `chrome://extensions` and click **Reload** on QRZ Callsign Lookup.

## Callsigns

Lowercase is converted to uppercase; surrounding whitespace, quotes, brackets, and common punctuation are removed. Portable and prefixed callsigns stay intact, including `EA8/KF6UFO`, `KF6UFO/P`, and `W1AW/7`. Spaces around a slash are allowed. Internal spaces, prose, multiple callsigns, URLs, and malformed slashes are rejected with a help message. This validates plausible syntax, not whether a station is licensed or listed in QRZ.

## Logbook behavior

Search uses the visible `#search` input. It first clicks QRZ's `#findBtn` control, then checks for a search-specific click handler or a nearby Find/Search button. If no button is found, it dispatches Enter with the legacy key code used in the supplied QRZ markup. It never calls a page-global function directly. A successful interaction means the search was submitted; the extension does not inspect or certify QRZ's returned contacts.

The extension waits up to 25 seconds for page navigation and 10 seconds for a visible search input. If login is required, sign in and use the menu again. Requests are not kept after a browser restart or an extension reload. Several quick requests are processed in order. Tabs are reused within the same normal/incognito browsing context; Chrome's **Allow in incognito** setting is needed for private windows.

## Permissions and privacy

- `contextMenus`: show the two selected-text commands.
- `scripting`: fill and operate the logbook search after you choose it.
- `https://logbook.qrz.com/*`: locate and interact with QRZ Logbook tabs.

There is no broad `tabs`, `activeTab`, storage, notification, or all-websites permission. Public callsign lookup only opens a URL. No credentials, contacts, or search history are stored by this extension. Selected callsigns go to QRZ when you request a lookup. All code and icons are local, with no third-party libraries or external services.

## Previous version and verification

`previous-version/` preserves the original version 1.0 manifest and background script, unchanged. To restore it, copy those two files back to this folder and reload the extension in Chrome.

Version 2.0 has automated checks for callsign handling, menu creation, tab reuse/creation, window activation, load waiting, error handling, and logbook button/Enter interactions. The logbook interaction checks use a local page reproducing the supplied QRZ markup. An authenticated search against your actual QRZ account must be confirmed in Chrome after loading; QRZ can change its page structure.

Icons: original radio illustration in PNG at 16, 32, 48, and 128 pixels. QRZ is a third-party service; this helper is not an official QRZ product.

## Repository overview

Chrome extension for QRZ.com that adds right-click callsign tools. Look up highlighted callsigns on QRZ or search your personal QRZ Logbook, reusing an existing logbook tab when available. Lightweight, local, and easy to load in Chrome Developer Mode.

## License

MIT License. See [LICENSE](LICENSE).
