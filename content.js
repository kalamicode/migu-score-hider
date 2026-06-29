(function () {
  'use strict';

  const ORIGIN = location.origin;

  // === Sniffer: auto-inject page-sniffer.js into main world ===

  let snifferInjected = false;

  function injectSniffer() {
    if (snifferInjected) return;
    snifferInjected = true;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('page-sniffer.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  injectSniffer();

  // === Score Hiding ===

  chrome.storage.sync.get({ enabled: true }, function (data) {
    if (!data.enabled) return;

    injectCSS(
      '.vdetail-title, .post-text, .detail { visibility: hidden !important; }' +
      '.migu-score-processed { visibility: visible !important; }'
    );

    const SCORE_REGEX = /([\u4e00-\u9fa5][\u4e00-\u9fa5a-zA-Z0-9]*)\s*(\d{1,2})\s*:\s*(\d{1,2})\s*([\u4e00-\u9fa5][\u4e00-\u9fa5a-zA-Z0-9]*)/g;
    const SCORE_REPLACEMENT = '$1 VS $4';

    const SELECTORS = [
      '.vdetail-title',
      '.post-text',
      '.detail',
      '[class*="vdetail-title"]',
      '[class*="post-text"]',
      '[class*="detail"]'
    ];

    function hideScoreInText(text) {
      return text.replace(SCORE_REGEX, SCORE_REPLACEMENT);
    }

    function processElement(el) {
      var changed = false;

      if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
        var original = el.textContent;
        var replaced = hideScoreInText(original);
        if (replaced !== original) {
          el.textContent = replaced;
          changed = true;
        }
      } else {
        walkTextNodes(el, function (node) {
          var original = node.textContent;
          var replaced = hideScoreInText(original);
          if (replaced !== original) {
            node.textContent = replaced;
            changed = true;
          }
        });
      }

      if (el.hasAttribute('title')) {
        var origTitle = el.getAttribute('title');
        var newTitle = hideScoreInText(origTitle);
        if (newTitle !== origTitle) {
          el.setAttribute('title', newTitle);
          changed = true;
        }
      }

      el.classList.add('migu-score-processed');

      return changed;
    }

    function walkTextNodes(root, callback) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      var node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim()) {
          callback(node);
        }
      }
    }

    function scanAndProcess() {
      SELECTORS.forEach(function (selector) {
        document.querySelectorAll(selector).forEach(processElement);
      });
      updateTitle();
    }

    function updateTitle() {
      if (document.title && document.title !== '__placeholder__') {
        var newTitle = hideScoreInText(document.title);
        if (newTitle !== document.title) {
          document.title = newTitle;
        }
      }
    }

    var observer = new MutationObserver(function () {
      clearTimeout(observer._timer);
      observer._timer = setTimeout(scanAndProcess, 100);
    });

    var intervalId = setInterval(scanAndProcess, 2000);

    function init() {
      scanAndProcess();
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  });

  function injectCSS(cssText) {
    var style = document.createElement('style');
    style.textContent = cssText;
    (document.head || document.documentElement).appendChild(style);
  }

  function safeChrome(fn, fallback) {
    try {
      if (chrome.runtime && chrome.runtime.id && chrome.runtime.id !== '') return fn();
    } catch (e) { /* extension context invalidated */ }
    if (typeof fallback === 'function') fallback();
  }

  // === Downloader: inject page-downloader.js into main world ===

  let downloaderInjected = false;
  let pendingUrl = null;

  function injectPageDownloader() {
    if (downloaderInjected) return;
    downloaderInjected = true;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('page-downloader.js');
    s.onload = () => {
      s.remove();
      if (pendingUrl) {
        window.postMessage({ type: 'MIGU_DOWNLOAD', url: pendingUrl }, ORIGIN);
        pendingUrl = null;
      }
    };
    (document.head || document.documentElement).appendChild(s);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'download' && msg.url) {
      if (downloaderInjected) {
        window.postMessage({ type: 'MIGU_DOWNLOAD', url: msg.url }, ORIGIN);
      } else {
        pendingUrl = msg.url;
        injectPageDownloader();
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === 'cancel_download') {
      window.postMessage({ type: 'MIGU_CANCEL' }, ORIGIN);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === 'pause_download') {
      window.postMessage({ type: 'MIGU_PAUSE' }, ORIGIN);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === 'resume_download') {
      window.postMessage({ type: 'MIGU_RESUME' }, ORIGIN);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === 'save_partial') {
      window.postMessage({ type: 'MIGU_SAVE_PARTIAL' }, ORIGIN);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === 'save') {
      window.postMessage({ type: 'MIGU_SAVE' }, ORIGIN);
      sendResponse({ ok: true });
      return;
    }
  });

  window.addEventListener('message', (e) => {
    if (e.origin !== ORIGIN) return;
    const d = e.data;
    if (d.type === 'MIGU_PROGRESS') {
      safeChrome(function () { chrome.runtime.sendMessage({ action: 'progress', current: d.current, total: d.total, percent: d.percent, downloadedBytes: d.downloadedBytes, speed: d.speed, paused: d.paused }); });
    } else if (d.type === 'MIGU_DONE') {
      safeChrome(function () { chrome.runtime.sendMessage({ action: 'download_done', totalBytes: d.totalBytes }); });
    } else if (d.type === 'MIGU_ERROR') {
      safeChrome(function () { chrome.runtime.sendMessage({ action: 'download_error', error: d.error }); });
    } else if (d.type === 'MIGU_SAVED') {
      safeChrome(function () { chrome.runtime.sendMessage({ action: 'download_saved', detail: d.detail }); });
    } else if (d.type === 'MIGU_M3U8_DETECTED') {
      safeChrome(function () { chrome.storage.local.set({ sniffedUrl: d.url, sniffedAt: Date.now(), sniffedPageUrl: location.href }); });
      safeChrome(function () { chrome.runtime.sendMessage({ action: 'm3u8_detected', url: d.url }); });
    }
  });

  window.addEventListener('pagehide', function () {
    safeChrome(function () { chrome.storage.local.remove(['sniffedUrl', 'sniffedAt', 'sniffedPageUrl']); });
  });
})();
