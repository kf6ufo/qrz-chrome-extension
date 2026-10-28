chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "qrzLookup",
        title: "Look up %s on QRZ",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "qrzLookup") {

        const callsign = info.selectionText
            .trim()
            .toUpperCase();

        if (!/^[A-Z0-9/]{3,20}$/.test(callsign)) {
            return;
        }

        const url = "https://www.qrz.com/db/"
                  + encodeURIComponent(callsign);

        chrome.tabs.create({ url: url });
    }
});
