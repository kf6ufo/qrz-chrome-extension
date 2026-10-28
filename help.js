try {
  const message = decodeURIComponent(location.hash.slice(1));
  if (message) document.getElementById("message").textContent = message;
} catch { /* Keep default help if an invalid fragment was supplied. */ }
