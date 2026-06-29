(function () {
  'use strict';

  var detectedUrls = {};

  function isPlayable(url) {
    return /\.mp4\.m3u8(\?|$)/.test(url);
  }

  function reportUrl(url) {
    if (!url || detectedUrls[url] || !isPlayable(url)) return;
    detectedUrls[url] = true;
    window.postMessage({ type: 'MIGU_M3U8_DETECTED', url: url }, location.origin);
  }

  // Patch fetch
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
    if (url.indexOf('.m3u8') !== -1) reportUrl(url);
    return origFetch.call(this, input, init).then(function (response) {
      if (response.url && response.url.indexOf('.m3u8') !== -1) reportUrl(response.url);
      return response;
    });
  };

  // Patch XMLHttpRequest
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    this.addEventListener('load', function () {
      if (this.responseURL && this.responseURL.indexOf('.m3u8') !== -1) {
        reportUrl(this.responseURL);
      }
    });
    return origOpen.apply(this, arguments);
  };

  // Watch video element src changes
  var videoSrcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (videoSrcDesc && videoSrcDesc.configurable) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      get: videoSrcDesc.get,
      set: function (val) {
        if (val && val.indexOf && val.indexOf('.m3u8') !== -1) reportUrl(val);
        videoSrcDesc.set.call(this, val);
      }
    });
  }

  // Watch for new video elements in DOM
  new MutationObserver(function () {
    var videos = document.querySelectorAll('video[src*=".m3u8"], video source[src*=".m3u8"]');
    for (var i = 0; i < videos.length; i++) {
      reportUrl(videos[i].src);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: false });
})();
