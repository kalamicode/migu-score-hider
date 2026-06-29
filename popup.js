(function () {
  'use strict';

  // === Elements ===
  const toggle = document.getElementById('toggle');
  const sniffBox = document.getElementById('sniffBox');
  const btnCopySniff = document.getElementById('btnCopySniff');
  const btnResniff = document.getElementById('btnResniff');
  const btnDownload = document.getElementById('btnDownload');
  const btnPause = document.getElementById('btnPause');
  const btnSave = document.getElementById('btnSave');
  const btnCancel = document.getElementById('btnCancel');
  const dlSection = document.getElementById('dlSection');
  const dlBarFill = document.getElementById('dlBarFill');
  const dlPct = document.getElementById('dlPct');
  const statusBar = document.getElementById('statusBar');
  const dlSub = document.getElementById('dlSub');

  // === State ===
  let activePort = null;
  let isDownloading = false;
  let isPaused = false;
  let sniffExpanded = false;
  let lastSniffedUrl = '';
  let isCompleted = false;

  // === Score toggle ===
  chrome.storage.sync.get({ enabled: true }, function (data) {
    toggle.checked = data.enabled;
  });
  toggle.addEventListener('change', function () {
    chrome.storage.sync.set({ enabled: toggle.checked });
  });

  // === Init: get current tab and load saved data ===
  let currentTabUrl = '';

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    currentTabUrl = tabs.length ? (tabs[0].url || '') : '';

    chrome.storage.local.get({ sniffedUrl: '', sniffedPageUrl: '' }, function (data) {
      if (data.sniffedUrl && data.sniffedPageUrl && currentTabUrl && currentTabUrl.indexOf(data.sniffedPageUrl) === 0) {
        showSniffed(data.sniffedUrl);
      }
    });
  });

  function showSniffed(url) {
    lastSniffedUrl = url;
    sniffBox.textContent = url;
    sniffBox.className = 'sniff-box collapsed';
    btnCopySniff.disabled = false;
    setStatus('已嗅探到串流地址', 'val');
  }

  // === Sniff - click to expand/collapse ===
  sniffBox.addEventListener('click', function () {
    if (!lastSniffedUrl) return;
    sniffExpanded = !sniffExpanded;
    sniffBox.className = 'sniff-box ' + (sniffExpanded ? 'expanded' : 'collapsed');
  });

  // === Copy sniffed URL ===
  btnCopySniff.addEventListener('click', function () {
    if (!lastSniffedUrl) return;
    navigator.clipboard.writeText(lastSniffedUrl).then(function () {
      var orig = btnCopySniff.textContent;
      btnCopySniff.textContent = '✅ 已复制';
      setTimeout(function () { btnCopySniff.textContent = orig; }, 1500);
    });
  });

  // === Refresh page to re-sniff ===
  btnResniff.addEventListener('click', function () {
    sniffBox.textContent = '刷新中...';
    sniffBox.className = 'sniff-box collapsed';
    btnCopySniff.disabled = true;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs.length) chrome.tabs.reload(tabs[0].id);
    });
    setStatus('页面已刷新，等待嗅探...', 'info');
  });

  // === Real-time sniff via storage ===
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.sniffedUrl) return;
    chrome.storage.local.get({ sniffedPageUrl: '' }, function (d) {
      if (d.sniffedPageUrl && currentTabUrl && currentTabUrl.indexOf(d.sniffedPageUrl) === 0) {
        showSniffed(changes.sniffedUrl.newValue);
      }
    });
  });

  // === On open: restore download state ===
  chrome.runtime.sendMessage({ action: 'get_dl_state' }, function (state) {
    if (!state) return;
    // 如果下载状态关联了页面 URL 且与当前标签页不匹配，跳过
    if (state.downloadPageUrl && currentTabUrl && currentTabUrl.indexOf(state.downloadPageUrl) !== 0) return;
    if (state.status === 'progress') {
      isDownloading = true;
      isPaused = false;
      btnDownload.disabled = true;
      showDlUI();
      showSaveBtn(false);
      setPauseBtn(false);
      showDlProgress(state.current, state.total, state.percent, state.downloadedBytes, state.speed);
      setStatus('正在下载', 'val');
      pollDownloadState();
    } else if (state.status === 'paused') {
      isDownloading = true;
      isPaused = true;
      btnDownload.disabled = true;
      showDlUI();
      showSaveBtn(true);
      setPauseBtn(true);
      showDlProgress(state.current, state.total, state.percent, state.downloadedBytes, 0);
      setStatus('已暂停', 'info');
      pollDownloadState();
    } else if (state.status === 'done') {
      isCompleted = true;
      isDownloading = false;
      btnDownload.disabled = false;
      showDlUI();
      showDoneProgress(state.totalBytes);
      showPauseBtn(false);
      showSaveBtn(true);
      setStatus('下载完成，点击保存', 'val');
      pollDownloadState();
    } else if (state.status === 'saved') {
      setStatus('文件已保存', 'val');
    } else if (state.status === 'error') {
      setStatus(state.error || '下载失败', 'err');
    }
  });

  // === Start download ===
  btnDownload.addEventListener('click', function () {
    var url = lastSniffedUrl;
    if (!url) {
      setStatus('未嗅探到串流地址', 'err');
      return;
    }
    isDownloading = true;
    isPaused = false;
    btnDownload.disabled = true;
    showDlUI();
    setPauseBtn(false);
    setStatus('下载中...', 'val');
    chrome.runtime.sendMessage({ action: 'start_download', url: url }, function () {
      if (chrome.runtime.lastError) {
        hideDlUI();
        isDownloading = false;
        btnDownload.disabled = false;
        setStatus('错误: ' + chrome.runtime.lastError.message, 'err');
      } else {
        pollDownloadState();
      }
    });
  });

  function showSaveBtn(show) {
    btnSave.style.display = show ? '' : 'none';
  }

  // === Pause / Resume ===
  btnPause.addEventListener('click', function () {
    if (isPaused) {
      chrome.runtime.sendMessage({ action: 'resume_download' }, function () {
        isPaused = false;
        setPauseBtn(false);
        setStatus('继续下载', 'val');
      });
    } else {
      chrome.runtime.sendMessage({ action: 'pause_download' }, function () {
        isPaused = true;
        setPauseBtn(true);
        setStatus('已暂停', 'info');
      });
    }
  });

  function setPauseBtn(paused) {
    btnPause.textContent = paused ? '▶ 继续' : '⏸ 暂停';
    btnPause.className = 'btn ' + (paused ? 'btn-resume' : 'btn-pause');
  }

  // === Save ===
  btnSave.addEventListener('click', function () {
    var action = isCompleted ? 'save' : 'save_partial';
    chrome.runtime.sendMessage({ action: action }, function () {
      setStatus('正在保存...', 'info');
    });
  });

  // === Cancel / Close ===
  btnCancel.addEventListener('click', function () {
    if (isCompleted) {
      isCompleted = false;
      btnDownload.disabled = false;
      hideDlUI();
      setStatus('已关闭', 'label');
      return;
    }
    chrome.runtime.sendMessage({ action: 'cancel_download' }, function () {
      isDownloading = false;
      isPaused = false;
      btnDownload.disabled = false;
      hideDlUI();
      setStatus('下载已取消', 'label');
    });
  });

  // === Poll download state ===
  function pollDownloadState() {
    startPolling('popup', function (msg) {
      if (msg.action !== 'state') return;
      if (msg.status === 'progress') {
        isPaused = false;
        setPauseBtn(false);
        showSaveBtn(false);
        showDlProgress(msg.current, msg.total, msg.percent, msg.downloadedBytes, msg.speed);
        setStatus('正在下载', 'val');
      } else if (msg.status === 'paused') {
        isPaused = true;
        setPauseBtn(true);
        showSaveBtn(true);
        showDlProgress(msg.current, msg.total, msg.percent, msg.downloadedBytes, 0);
        setStatus('已暂停', 'info');
      } else if (msg.status === 'done') {
        finishDl(msg);
      } else if (msg.status === 'saved') {
        stopPolling();
        isCompleted = false;
        isDownloading = false;
        btnDownload.disabled = false;
        hideDlUI();
        setStatus('文件已保存', 'val');
      } else if (msg.status === 'error') {
        stopPolling();
        isDownloading = false;
        isPaused = false;
        btnDownload.disabled = false;
        hideDlUI();
        setStatus(msg.error || '下载失败', 'err');
      } else if (msg.status === 'starting') {
        setStatus('启动中...', 'info');
      }
    });
  }

  // === Download UI ===
  function showDlUI() {
    dlSection.style.display = 'block';
    dlBarFill.style.width = '0%';
    dlBarFill.style.background = '#2196F3';
    dlPct.textContent = '0%';
    dlSub.textContent = '';
    showSaveBtn(false);
  }
  function hideDlUI() {
    dlSection.style.display = 'none';
  }
  function showDlProgress(current, total, percent, downloadedBytes, speed) {
    var p = Math.min(percent, 100);
    dlBarFill.style.width = p + '%';
    dlPct.textContent = p + '%';
    showDlSub(downloadedBytes, speed, current, total, percent);
  }
  function finishDl(msg) {
    isDownloading = false;
    isPaused = false;
    isCompleted = true;
    btnDownload.disabled = false;
    showDoneProgress(msg && msg.totalBytes);
    showPauseBtn(false);
    showSaveBtn(true);
    setStatus('下载完成，点击保存', 'val');
  }

  function showDoneProgress(totalBytes) {
    dlSection.style.display = 'block';
    dlBarFill.style.width = '100%';
    dlBarFill.style.background = '#4CAF50';
    dlPct.textContent = '100%';
    if (totalBytes) {
      showDlSub(totalBytes, 0, 0, 0, 100);
    } else {
      dlSub.textContent = '';
    }
  }

  function showPauseBtn(show) {
    btnPause.style.display = show ? '' : 'none';
  }

  // === Download sub status (size + speed + segment + percent) ===
  function showDlSub(downloadedBytes, speed, current, total, percent) {
    var parts = [];
    if (downloadedBytes > 0) {
      parts.push('已下载 ' + formatBytes(downloadedBytes));
    }
    if (speed > 0) {
      parts.push('速度 ' + formatSpeed(speed));
    }
    if (current !== undefined && total) {
      parts.push('片段 ' + current + '/' + total);
    }
    if (percent !== undefined) {
      parts.push(percent + '%');
    }
    dlSub.innerHTML = parts.length ? '<span class="highlight">' + escapeHtml(parts.join(' | ')) + '</span>' : '';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1048576) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
  }

  // === Status bar ===
  function setStatus(msg, cls) {
    if (cls === 'err') {
      statusBar.innerHTML = '<span class="err">' + escapeHtml(msg) + '</span>';
    } else if (cls === 'val') {
      statusBar.innerHTML = '<span class="val">' + escapeHtml(msg) + '</span>';
    } else if (cls === 'info') {
      statusBar.innerHTML = '<span class="info">' + escapeHtml(msg) + '</span>';
    } else {
      statusBar.innerHTML = '<span class="lbl">' + escapeHtml(msg) + '</span>';
    }
  }

  // === Polling ===
  function startPolling(name, handler) {
    stopPolling();
    var port = chrome.runtime.connect({ name: name });
    var iv = setInterval(function () {
      port.postMessage({ action: 'get_state' });
    }, 800);
    port.onMessage.addListener(function (msg) {
      if (msg.action === 'state') handler(msg);
    });
    activePort = { port: port, iv: iv, cleanup: function () { clearInterval(iv); port.disconnect(); } };
  }

  function stopPolling() {
    if (activePort) {
      activePort.cleanup();
      activePort = null;
    }
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();
