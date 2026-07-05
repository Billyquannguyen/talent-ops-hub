const DEFAULT_APP_URL = "https://katlas-buddy-app.vercel.app/creator-sourcing#billy";
const OLD_LOCAL_APP_URL = "http://127.0.0.1:8080/creator-sourcing#billy";
const BILLY_EXTENSION_SOURCE = "katlas-billy-extension";
const BILLY_IMPORT_STORAGE_KEY = "katlas-billy-extension-import-v1";
const BILLY_IMPORT_ACK_STORAGE_KEY = "katlas-billy-extension-import-ack-v1";

const appUrlInput = document.getElementById("appUrl");
const collectButton = document.getElementById("collect");
const sendButton = document.getElementById("send");
const creatorCount = document.getElementById("creatorCount");
const videoCount = document.getElementById("videoCount");
const statusLine = document.getElementById("status");

let lastPayload;
let sessionActive = false;
let sessionTabId;
let liveRefreshTimer;

init();

async function init() {
  const saved = await chrome.storage.local.get([
    "billyAppUrl",
    "lastBillyPayload",
    "billySessionTabId",
  ]);
  appUrlInput.value = getInitialAppUrl(saved.billyAppUrl);
  await chrome.storage.local.set({ billyAppUrl: appUrlInput.value });
  lastPayload = saved.lastBillyPayload;
  sessionTabId = saved.billySessionTabId;
  renderPayload(lastPayload);

  appUrlInput.addEventListener("change", async () => {
    await chrome.storage.local.set({ billyAppUrl: normalizeAppUrl(appUrlInput.value) });
    appUrlInput.value = normalizeAppUrl(appUrlInput.value);
  });

  collectButton.addEventListener("click", beginScrapingSession);
  sendButton.addEventListener("click", sendToBilly);
  await syncActiveTikTokSession();
  startLiveSessionRefresh();
}

async function beginScrapingSession() {
  setStatus("Starting Billy scraping session...");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("tiktok.com")) {
    setStatus("Open a TikTok hashtag or sound page first.");
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "START_BILLY_SESSION" });
    if (!response?.ok) throw new Error(response?.error || "Collector did not respond.");
    sessionActive = true;
    sessionTabId = tab.id;
    lastPayload = response.payload;
    await chrome.storage.local.set({
      billyAppUrl: normalizeAppUrl(appUrlInput.value),
      lastBillyPayload: lastPayload,
      billySessionTabId: sessionTabId,
    });
    renderPayload(lastPayload);
    startLiveSessionRefresh();
    setStatus("Session started. Scroll TikTok and Billy will keep adding loaded videos.");
  } catch (error) {
    setStatus(`Could not start. Reload the TikTok page and try again. ${getError(error)}`);
  }
}

async function sendToBilly() {
  if (!sessionActive) {
    renderPayload(undefined);
    setStatus("Click Begin Scraping Session first. Billy will only collect after you start.");
    return;
  }

  const sourceTabId = sessionTabId || (await getActiveTikTokTabId());
  const payload = await finishActiveSession(sourceTabId);

  if (!payload?.creators?.length) {
    setStatus("Begin a session on a TikTok hashtag or sound page first.");
    return;
  }

  const appUrl = normalizeAppUrl(appUrlInput.value);
  await chrome.storage.local.set({ billyAppUrl: appUrl });
  appUrlInput.value = appUrl;
  setStatus("Sending to Billy in the background...");

  try {
    const tab = await openBillyTabInBackground(appUrl);
    await sendPayloadToTab(tab.id, payload, createImportId());
    lastPayload = undefined;
    sessionActive = false;
    sessionTabId = undefined;
    stopLiveSessionRefresh();
    await chrome.storage.local.remove(["billySessionTabId", "lastBillyPayload"]);
    renderPayload(undefined);
    await notifyTikTokTab(
      sourceTabId,
      `Sent ${payload.creators.length} creators to Billy. You can keep scrolling.`,
    );
    setStatus(`Sent ${payload.creators.length} creators to Billy. TikTok stayed open.`);
  } catch (error) {
    await notifyTikTokTab(sourceTabId, `Billy did not receive the import. ${getError(error)}`);
    setStatus(`Billy did not receive the import. ${getError(error)}`);
  }
}

async function syncActiveTikTokSession() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("tiktok.com")) {
    renderPayload(undefined);
    stopLiveSessionRefresh();
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_BILLY_SESSION_STATE" });
    if (!response?.ok) return;
    sessionActive = Boolean(response.active);
    if (!sessionActive) {
      sessionTabId = undefined;
      lastPayload = undefined;
      await chrome.storage.local.remove(["billySessionTabId", "lastBillyPayload"]);
      renderPayload(undefined);
      stopLiveSessionRefresh();
      setStatus("No Billy session running. Click Begin when you want to start collecting.");
      return;
    }

    sessionTabId = tab.id;
    if (response.payload) {
      lastPayload = response.payload;
      await chrome.storage.local.set({
        lastBillyPayload: lastPayload,
        ...(sessionActive ? { billySessionTabId: sessionTabId } : {}),
      });
    }
    renderPayload(lastPayload);
    startLiveSessionRefresh();
    setStatus("Session is running. Keep scrolling TikTok, then finish and send.");
  } catch {
    renderPayload(undefined);
  }
}

async function finishActiveSession(targetTabId) {
  targetTabId = targetTabId || sessionTabId || (await getActiveTikTokTabId());
  if (!targetTabId) return undefined;

  try {
    const response = await chrome.tabs.sendMessage(targetTabId, { type: "STOP_BILLY_SESSION" });
    if (!response?.ok) throw new Error(response?.error || "Collector did not respond.");
    sessionActive = false;
    sessionTabId = undefined;
    lastPayload = response.payload;
    stopLiveSessionRefresh();
    await chrome.storage.local.set({ lastBillyPayload: lastPayload });
    await chrome.storage.local.remove("billySessionTabId");
    renderPayload(lastPayload);
    return lastPayload;
  } catch (error) {
    setStatus(
      `Could not finish the active session. Return to the TikTok tab and try again. ${getError(error)}`,
    );
    return undefined;
  }
}

async function getActiveTikTokTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id && tab.url?.includes("tiktok.com") ? tab.id : undefined;
}

function startLiveSessionRefresh() {
  if (liveRefreshTimer || !sessionActive) return;
  liveRefreshTimer = window.setInterval(() => {
    void refreshActiveSession();
  }, 1000);
}

function stopLiveSessionRefresh() {
  if (!liveRefreshTimer) return;
  window.clearInterval(liveRefreshTimer);
  liveRefreshTimer = undefined;
}

async function refreshActiveSession() {
  if (!sessionActive) {
    stopLiveSessionRefresh();
    return;
  }

  const targetTabId = sessionTabId || (await getActiveTikTokTabId());
  if (!targetTabId) return;

  try {
    const response = await chrome.tabs.sendMessage(targetTabId, {
      type: "GET_BILLY_SESSION_STATE",
    });
    if (!response?.ok) return;
    sessionActive = Boolean(response.active);

    if (!sessionActive) {
      sessionTabId = undefined;
      lastPayload = undefined;
      await chrome.storage.local.remove(["billySessionTabId", "lastBillyPayload"]);
      renderPayload(undefined);
      stopLiveSessionRefresh();
      setStatus("No Billy session running. Click Begin when you want to start collecting.");
      return;
    }

    sessionTabId = targetTabId;
    if (response.payload) {
      lastPayload = response.payload;
      await chrome.storage.local.set({
        lastBillyPayload: lastPayload,
        billySessionTabId: sessionTabId,
      });
      renderPayload(lastPayload);
    }
  } catch {
    // Keep the current numbers visible. The popup will retry while it is open.
  }
}

async function openBillyTabInBackground(appUrl) {
  const target = new URL(appUrl);
  const tabs = await chrome.tabs.query({});
  const existing =
    tabs.find((tab) => isExistingBillyDashboardTab(tab, target, true)) ||
    tabs.find((tab) => isExistingBillyDashboardTab(tab, target, false));

  if (existing?.id) {
    return existing;
  }

  return await chrome.tabs.create({ active: false, url: target.href });
}

function isExistingBillyDashboardTab(tab, target, requireSameOrigin) {
  try {
    const url = new URL(tab.url || "");
    if (!url.pathname.includes("/creator-sourcing")) return false;
    if (requireSameOrigin) return url.origin === target.origin;
    return isKatlasAppHost(url, target);
  } catch {
    return false;
  }
}

function isKatlasAppHost(url, target) {
  if (url.origin === target.origin) return true;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  return url.hostname.includes("katlas-buddy") && url.hostname.endsWith(".vercel.app");
}

async function sendPayloadToTab(tabId, payload, importId) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    await wait(500);
    try {
      const ping = await chrome.tabs.sendMessage(tabId, { type: "PING_KATLAS_PAGE" });
      if (!ping?.ok) continue;
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "SEND_BILLY_IMPORT",
        importId,
        payload,
      });
      if (response?.ok) {
        await waitForBillyImportAck(tabId, importId);
        return;
      }
    } catch {
      // The app tab may still be loading. Retry briefly.
    }
  }

  await injectBillyImportIntoTab(tabId, payload, importId);
  await waitForBillyImportAck(tabId, importId);
}

async function injectBillyImportIntoTab(tabId, payload, importId) {
  if (!chrome.scripting?.executeScript) {
    throw new Error("Reload the Billy extension so it can use the improved sender.");
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(500);
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: queueBillyImportInPage,
        args: [payload, importId, BILLY_EXTENSION_SOURCE, BILLY_IMPORT_STORAGE_KEY],
      });
      if (result?.result?.ok) return;
    } catch {
      // The app tab may still be loading. Retry briefly.
    }
  }

  throw new Error("Make sure your Katlas app is open and the extension has permission for it.");
}

async function waitForBillyImportAck(tabId, importId) {
  if (!chrome.scripting?.executeScript) return;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    await wait(500);
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: readBillyImportAck,
        args: [BILLY_IMPORT_ACK_STORAGE_KEY, importId],
      });
      if (result?.result?.ok) return;
    } catch {
      // Keep polling until the dashboard has mounted and confirmed the import.
    }
  }

  throw new Error("Billy opened, but the dashboard did not confirm the import.");
}

async function notifyTikTokTab(tabId, message) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "SHOW_BILLY_NOTICE",
      message,
    });
  } catch {
    // The TikTok tab may have been closed. The popup status still reports the result.
  }
}

function renderPayload(payload) {
  const visiblePayload = sessionActive ? payload : undefined;
  const creators = visiblePayload?.creators?.length || 0;
  const videos = visiblePayload?.videosFound || 0;
  creatorCount.textContent = String(creators);
  videoCount.textContent = String(videos);
  collectButton.disabled = sessionActive;
  collectButton.textContent = sessionActive ? "Session Running" : "Begin Scraping Session";
  sendButton.textContent = "Finish & Send To Billy";
  sendButton.disabled = !sessionActive;
}

function normalizeAppUrl(value) {
  const trimmed = String(value || "").trim() || DEFAULT_APP_URL;
  try {
    const url = new URL(trimmed);
    url.pathname = "/creator-sourcing";
    url.search = "";
    url.hash = "billy";
    return url.href;
  } catch {
    return DEFAULT_APP_URL;
  }
}

function getInitialAppUrl(savedUrl) {
  const normalizedSavedUrl = normalizeAppUrl(savedUrl || DEFAULT_APP_URL);
  if (normalizedSavedUrl === normalizeAppUrl(OLD_LOCAL_APP_URL)) return DEFAULT_APP_URL;
  return normalizedSavedUrl;
}

function setStatus(value) {
  statusLine.textContent = value;
}

function getError(error) {
  return error instanceof Error ? error.message : "";
}

function createImportId() {
  return `billy-import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function queueBillyImportInPage(payload, importId, source, storageKey) {
  const envelope = {
    id: importId,
    source,
    type: "BILLY_IMPORT",
    queuedAt: new Date().toISOString(),
    payload,
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // The live message below can still be received by the app.
  }

  window.postMessage(envelope, window.location.origin);
  return { ok: true };
}

function readBillyImportAck(storageKey, importId) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { ok: false };
    const ack = JSON.parse(raw);
    return { ok: ack?.id === importId };
  } catch {
    return { ok: false };
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
