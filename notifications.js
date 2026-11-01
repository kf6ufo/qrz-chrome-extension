// QRZ writes confirmation callsigns as plain text. Add only station links, so
// Chrome can offer the native link context menu without opening anything.
(() => {
  if (location.origin !== "https://forums.qrz.com"
    || location.pathname !== "/index.php"
    || !/^\?account\/alerts(?:[&/]|$)/.test(location.search)) return;

  const plausible = value => value.length <= 30
    && value.split("/").every(part => part.length <= 12)
    && value.split("/").some(part => /^(?=[A-Z0-9]*[A-Z])[A-Z0-9]{1,6}[0-9][A-Z]{1,6}$/.test(part));

  for (const alert of document.querySelectorAll('[id^="alert"]')) {
    if (!/^alert\d+$/.test(alert.id)) continue;
    for (const heading of alert.querySelectorAll("h3")) {
      // textContent does not insert whitespace for <br>, so the following
      // Congratulations text can touch the title on QRZ's actual markup.
      if (!heading.textContent.trim().startsWith("QRZ Logbook Confirmation")) continue;
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.parentElement.closest("a, script, style")) nodes.push(walker.currentNode);
      }
      for (const node of nodes) {
        const text = node.textContent;
        // Only the callsign between the QSO number and DE is the other station.
        const matches = [...text.matchAll(/\bQSO\s*#\d+\s+([A-Z0-9]+(?:\/[A-Z0-9]+){0,3})(?=\s+DE\b)/gi)]
          .filter(match => plausible(match[1].toUpperCase()));
        if (!matches.length) continue;
        const fragment = document.createDocumentFragment();
        let start = 0;
        for (const match of matches) {
          const offset = match.index + match[0].length - match[1].length;
          fragment.append(document.createTextNode(text.slice(start, offset)));
          const link = document.createElement("a");
          link.href = "https://www.qrz.com/db/" + encodeURIComponent(match[1].toUpperCase());
          link.textContent = match[1];
          link.dataset.qrzNotificationCallsign = "true";
          fragment.append(link);
          start = offset + match[1].length;
        }
        fragment.append(document.createTextNode(text.slice(start)));
        node.replaceWith(fragment);
      }
    }
  }
})();
