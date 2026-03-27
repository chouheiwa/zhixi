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
