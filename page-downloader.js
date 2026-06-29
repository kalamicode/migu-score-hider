(function () {
  'use strict';

  var dl = null;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'MIGU_DOWNLOAD' && e.data.url) {
      downloadVideo(e.data.url).catch(function (err) {
        window.postMessage({ type: 'MIGU_ERROR', error: err.message }, location.origin);
      });
    }
    if (e.data && e.data.type === 'MIGU_CANCEL') {
      if (dl) dl.cancel = true;
    }
    if (e.data && e.data.type === 'MIGU_PAUSE') {
      if (dl) dl.paused = true;
    }
    if (e.data && e.data.type === 'MIGU_RESUME') {
      if (dl) dl.paused = false;
    }
    if (e.data && e.data.type === 'MIGU_SAVE_PARTIAL') {
      if (dl && dl.parts.length > 0) {
        doSave(dl.parts);
      }
    }
    if (e.data && e.data.type === 'MIGU_SAVE') {
      if (dl && dl.parts.length > 0) {
        doSave(dl.parts);
        dl = null;
      }
    }
  });

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1048576) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
  }

  function doSave(parts) {
    var blob = new Blob(parts, { type: 'video/mp2t' });
    var url = URL.createObjectURL(blob);
    var filename = 'migu_video_' + Date.now() + '.ts';
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    window.postMessage({
      type: 'MIGU_SAVED',
      detail: { filename: filename, totalBytes: blob.size }
    }, location.origin);
  }

  async function downloadVideo(m3u8Url) {
    dl = { parts: [], cancel: false, paused: false };
    var downloadedBytes = 0;
    var startTime = Date.now();

    var resp = await fetch(m3u8Url);
    if (!resp.ok) throw new Error('m3u8 fetch failed: ' + resp.status);
    var text = await resp.text();

    var baseUrl = new URL(m3u8Url, location.href);
    var tsUrls = text.split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l && l.charAt(0) !== '#' });
    var tsAbsUrls = tsUrls.map(function (u) {
      if (u.indexOf('http://') === 0 || u.indexOf('https://') === 0) return u;
      return new URL(u, baseUrl).href;
    });

    if (tsAbsUrls.length === 0) throw new Error('No TS segments found in m3u8');

    var total = tsAbsUrls.length;

    for (var i = 0; i < total; i++) {
      if (dl.cancel) {
        window.postMessage({ type: 'MIGU_ERROR', error: '已取消' }, location.origin);
        return;
      }

      while (dl.paused) {
        if (dl.cancel) {
          window.postMessage({ type: 'MIGU_ERROR', error: '已取消' }, location.origin);
          return;
        }
        window.postMessage({
          type: 'MIGU_PROGRESS',
          current: i,
          total: total,
          percent: Math.round((i / total) * 100),
          downloadedBytes: downloadedBytes,
          speed: 0,
          paused: true
        }, location.origin);
        await sleep(500);
      }

      var tsResp = null;
      for (var attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) await sleep(1000);
        try {
          tsResp = await fetch(tsAbsUrls[i]);
          if (tsResp.ok) break;
        } catch (e) {
          if (attempt === 4) throw e;
        }
      }
      if (!tsResp || !tsResp.ok) throw new Error('TS #' + (i + 1) + ' 下载失败 (重试后)');
      var buf = await tsResp.arrayBuffer();
      dl.parts.push(buf);
      downloadedBytes += buf.byteLength;

      var elapsed = (Date.now() - startTime) / 1000;
      var speed = elapsed > 0 ? Math.round(downloadedBytes / elapsed) : 0;

      window.postMessage({
        type: 'MIGU_PROGRESS',
        current: i + 1,
        total: total,
        percent: Math.round(((i + 1) / total) * 100),
        downloadedBytes: downloadedBytes,
        speed: speed,
        paused: false
      }, location.origin);
    }

    window.postMessage({ type: 'MIGU_DONE', totalBytes: downloadedBytes }, location.origin);
  }
})();
