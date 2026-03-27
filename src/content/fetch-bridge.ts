/**
 * Content script that:
 * 1. Injects a page-level script for x-zse authenticated fetches
 * 2. Relays fetch requests between the extension and page JS context
 */

// Inject page-level fetch helper
const script = document.createElement('script');
script.textContent = `
(function() {
  'use strict';
  window.addEventListener('__zhihu_analyzer_fetch_request', async function(e) {
    var detail = e.detail;
    try {
      var response = await fetch(detail.url, { credentials: 'include' });
      var data = null;
      var error = null;
      if (response.ok) {
        data = await response.json();
      } else {
        error = 'HTTP ' + response.status;
      }
      window.dispatchEvent(new CustomEvent('__zhihu_analyzer_fetch_response', {
        detail: { id: detail.id, data: data, error: error }
      }));
    } catch(err) {
      window.dispatchEvent(new CustomEvent('__zhihu_analyzer_fetch_response', {
        detail: { id: detail.id, data: null, error: err.message }
      }));
    }
  });
})();
`;
document.documentElement.appendChild(script);
script.remove();

// Listen for fetch requests from background/popup via chrome.runtime
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'fetchProxy') return false;

  const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);

  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail.id !== requestId) return;
    window.removeEventListener('__zhihu_analyzer_fetch_response', handler);
    if (detail.error) {
      sendResponse({ error: detail.error });
    } else {
      sendResponse({ data: detail.data });
    }
  };

  window.addEventListener('__zhihu_analyzer_fetch_response', handler);

  window.dispatchEvent(
    new CustomEvent('__zhihu_analyzer_fetch_request', {
      detail: { id: requestId, url: message.url },
    })
  );

  return true; // keep sendResponse channel open
});
