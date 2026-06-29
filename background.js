let activeTabId = null;
let downloadState = { status: 'idle' };

chrome.storage.session.get('downloadState').then(function (data) {
  if (data && data.downloadState && data.downloadState.status !== 'idle') {
    downloadState = data.downloadState;
  }
});

function persistState() {
  chrome.storage.session.set({ downloadState: downloadState }).catch(function () {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'tab_ready') {
    activeTabId = sender.tab?.id || null;
    return;
  }

  if (msg.action === 'get_dl_state') {
    sendResponse(downloadState);
    return;
  }

  if (msg.action === 'start_download') {
    startDownload(msg.url);
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'save_partial') {
    savePartialDownload();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'save') {
    saveDownload();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'pause_download') {
    pauseDownload();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'resume_download') {
    resumeDownload();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'cancel_download') {
    cancelDownload();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'progress') {
    var s = downloadState.status;
    if (s === 'starting') s = 'progress';
    downloadState = { ...downloadState, status: s, current: msg.current, total: msg.total, percent: msg.percent, downloadedBytes: msg.downloadedBytes || 0, speed: msg.speed || 0 };
    persistState();
    return;
  }

  if (msg.action === 'download_done') {
    downloadState = { status: 'done', totalBytes: msg.totalBytes || 0, downloadPageUrl: downloadState.downloadPageUrl || '' };
    persistState();
    return;
  }

  if (msg.action === 'download_error') {
    downloadState = { status: 'error', error: msg.error, downloadPageUrl: downloadState.downloadPageUrl || '' };
    persistState();
    return;
  }

  if (msg.action === 'download_saved') {
    if (downloadState.status === 'progress' || downloadState.status === 'paused') {
      downloadState = { ...downloadState, lastSaved: { ...msg.detail } };
    } else {
      downloadState = { status: 'saved', ...msg.detail, downloadPageUrl: downloadState.downloadPageUrl || '' };
    }
    persistState();
    return;
  }

});

async function startDownload(m3u8Url) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) throw new Error('No active tab on miguvideo');
    activeTabId = tabs[0].id;
    downloadState = { status: 'starting', downloadPageUrl: tabs[0].url || '' };
    persistState();
    await chrome.tabs.sendMessage(tabs[0].id, { action: 'download', url: m3u8Url });
  } catch (err) {
    downloadState = { status: 'error', error: err.message, downloadPageUrl: downloadState.downloadPageUrl || '' };
    persistState();
  }
}

async function savePartialDownload() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length && tabs[0].id) {
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'save_partial' });
    }
  } catch (e) { }
}

async function saveDownload() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length && tabs[0].id) {
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'save' });
    }
  } catch (e) { }
}

async function cancelDownload() {
  downloadState = { status: 'idle', downloadPageUrl: downloadState.downloadPageUrl || '' };
  persistState();
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length && tabs[0].id) {
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'cancel_download' });
    }
  } catch (e) { }
}

async function pauseDownload() {
  if (downloadState.status === 'progress') {
    downloadState = { ...downloadState, status: 'paused' };
    persistState();
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length && tabs[0].id) {
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'pause_download' });
    }
  } catch (e) { }
}

async function resumeDownload() {
  downloadState = { ...downloadState, status: 'progress' };
  persistState();
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length && tabs[0].id) {
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'resume_download' });
    }
  } catch (e) { }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    port.onMessage.addListener((msg) => {
      if (msg.action === 'get_state') {
        port.postMessage({ action: 'state', ...downloadState });
      }
    });
  }
});
