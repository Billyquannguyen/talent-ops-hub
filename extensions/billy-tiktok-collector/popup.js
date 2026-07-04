const DEFAULT_APP_URL = "http://127.0.0.1:8080/creator-sourcing#billy";

const appUrlInput = document.getElementById("appUrl");
const collectButton = document.getElementById("collect");
const sendButton = document.getElementById("send");
const creatorCount = document.getElementById("creatorCount");
const videoCount = document.getElementById("videoCount");
const statusLine = document.getElementById("status");

let lastPayload;
let sessionActive = false;
let sessionTabId;

init();

async function init() {
  const saved = await chrome.storage.local.get([
    "billyAppUrl",
    "lastBillyPayload",
    "billySessionTabId",
  ]);
  appUrlInput.value = saved.billyAppUrl || DEFAULT_APP_URL;
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
    setStatus("Session started. Scroll TikTok and Billy will keep adding loaded videos.");
  } catch (error) {
    setStatus(`Could not start. Reload the TikTok page and try again. ${getError(error)}`);
  }
}

async function sendToBilly() {
  const payload = await finishActiveSession();

  if (!payload?.creators?.length) {
    setStatus("Begin a session on a TikTok hashtag or sound page first.");
    return;
  }

  const appUrl = normalizeAppUrl(appUrlInput.value);
  await chrome.storage.local.set({ billyAppUrl: appUrl });
  appUrlInput.value = appUrl;
  setStatus("Opening Billy and sending the finished session...");

  try {
    const tab = await openOrFocusBillyTab(appUrl);
    await sendPayloadToTab(tab.id, payload);
    lastPayload = payload;
    sessionActive = false;
    sessionTabId = undefined;
    await chrome.storage.local.remove("billySessionTabId");
    renderPayload(lastPayload);
    setStatus(`Sent ${payload.creators.length} creators to Billy.`);
  } catch (error) {
    setStatus(`Billy did not receive the import. ${getError(error)}`);
  }
}

async function syncActiveTikTokSession() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("tiktok.com")) {
    renderPayload(lastPayload);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_BILLY_SESSION_STATE" });
    if (!response?.ok) return;
    sessionActive = Boolean(response.active);
    if (sessionActive) sessionTabId = tab.id;
    if (response.payload) {
      lastPayload = response.payload;
      await chrome.storage.local.set({
        lastBillyPayload: lastPayload,
        ...(sessionActive ? { billySessionTabId: sessionTabId } : {}),
      });
    }
    renderPayload(lastPayload);
    if (sessionActive) {
      setStatus("Session is running. Keep scrolling TikTok, then finish and send.");
    }
  } catch {
    renderPayload(lastPayload);
  }
}

async function finishActiveSession() {
  const targetTabId = sessionTabId || (await getActiveTikTokTabId());
  if (!targetTabId) return lastPayload;

  try {
    const response = await chrome.tabs.sendMessage(targetTabId, { type: "STOP_BILLY_SESSION" });
    if (!response?.ok) throw new Error(response?.error || "Collector did not respond.");
    sessionActive = false;
    sessionTabId = undefined;
    lastPayload = response.payload;
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

async function openOrFocusBillyTab(appUrl) {
  const target = new URL(appUrl);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => {
    try {
      const url = new URL(tab.url || "");
      return url.origin === target.origin;
    } catch {
      return false;
    }
  });

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url: target.href });
    return existing;
  }

  return await chrome.tabs.create({ active: true, url: target.href });
}

async function sendPayloadToTab(tabId, payload) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    await wait(500);
    try {
      const ping = await chrome.tabs.sendMessage(tabId, { type: "PING_KATLAS_PAGE" });
      if (!ping?.ok) continue;
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "SEND_BILLY_IMPORT",
        payload,
      });
      if (response?.ok) return;
    } catch {
      // The app tab may still be loading. Retry briefly.
    }
  }
  throw new Error("Make sure your Katlas app is open and the extension has permission for it.");
}

function renderPayload(payload) {
  const creators = payload?.creators?.length || 0;
  const videos = payload?.videosFound || 0;
  creatorCount.textContent = String(creators);
  videoCount.textContent = String(videos);
  collectButton.disabled = sessionActive;
  collectButton.textContent = sessionActive ? "Session Running" : "Begin Scraping Session";
  sendButton.textContent = sessionActive
    ? "Finish & Send To Billy"
    : "Send Last Collection To Billy";
  sendButton.disabled = !sessionActive && creators === 0;
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

function setStatus(value) {
  statusLine.textContent = value;
}

function getError(error) {
  return error instanceof Error ? error.message : "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
