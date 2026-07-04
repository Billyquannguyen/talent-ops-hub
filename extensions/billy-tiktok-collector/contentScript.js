const KATLAS_BILLY_EXTENSION_SOURCE = "katlas-billy-extension";
const BILLY_SESSION_PREVIEW_ID = "katlas-billy-session-preview";

let billySession;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "START_BILLY_SESSION") {
    if (!isTikTokPage()) {
      sendResponse({ ok: false, error: "Open a TikTok hashtag or sound page first." });
      return false;
    }

    startBillySession();
    sendResponse({ ok: true, active: true, payload: getBillySessionPayload() });
    return false;
  }

  if (message.type === "GET_BILLY_SESSION_STATE") {
    if (billySession?.active) scanTikTokCardsIntoSession();
    sendResponse({
      ok: true,
      active: Boolean(billySession?.active),
      payload: billySession ? getBillySessionPayload() : undefined,
    });
    return false;
  }

  if (message.type === "STOP_BILLY_SESSION") {
    if (billySession?.active) scanTikTokCardsIntoSession();
    const payload = billySession ? getBillySessionPayload() : collectTikTokCards();
    stopBillySession();
    persistBillyPayload(payload);
    sendResponse({ ok: true, active: false, payload });
    return false;
  }

  if (message.type === "COLLECT_TIKTOK_CARDS") {
    if (billySession?.active) {
      scanTikTokCardsIntoSession();
      sendResponse({ ok: true, active: true, payload: getBillySessionPayload() });
      return false;
    }

    const payload = collectTikTokCards();
    persistBillyPayload(payload);
    sendResponse({ ok: true, active: false, payload });
    return false;
  }

  if (message.type === "PING_KATLAS_PAGE") {
    sendResponse({ ok: isKatlasPage() });
    return false;
  }

  if (message.type === "SEND_BILLY_IMPORT") {
    if (!isKatlasPage()) {
      sendResponse({ ok: false, error: "This tab is not the Katlas app." });
      return false;
    }

    window.postMessage(
      {
        source: KATLAS_BILLY_EXTENSION_SOURCE,
        type: "BILLY_IMPORT",
        payload: message.payload,
      },
      window.location.origin,
    );
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "SHOW_BILLY_NOTICE") {
    showBillyNotice(message.message);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

function startBillySession() {
  stopBillySession();
  billySession = {
    active: true,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceLabel: getTikTokSourceLabel(),
    sourceUrl: window.location.href,
    creatorsByUsername: new Map(),
    videoLinks: new Set(),
    scanTimer: undefined,
    observer: undefined,
    intervalId: undefined,
  };

  scanTikTokCardsIntoSession();
  watchTikTokPage();
  renderBillySessionPreview();
}

function stopBillySession() {
  if (!billySession) return;
  if (billySession.observer) billySession.observer.disconnect();
  if (billySession.intervalId) window.clearInterval(billySession.intervalId);
  if (billySession.scanTimer) window.clearTimeout(billySession.scanTimer);
  billySession.active = false;
  removeBillySessionPreview();
}

function watchTikTokPage() {
  if (!billySession?.active) return;

  if (document.body) {
    billySession.observer = new MutationObserver(scheduleSessionScan);
    billySession.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  billySession.intervalId = window.setInterval(() => {
    scanTikTokCardsIntoSession();
  }, 1800);
}

function scheduleSessionScan() {
  if (!billySession?.active) return;
  if (billySession.scanTimer) window.clearTimeout(billySession.scanTimer);
  billySession.scanTimer = window.setTimeout(() => {
    scanTikTokCardsIntoSession();
  }, 450);
}

function scanTikTokCardsIntoSession() {
  if (!billySession?.active) return;
  collectTikTokCardsInto(billySession.creatorsByUsername, billySession.videoLinks);
  billySession.updatedAt = new Date().toISOString();
  persistBillyPayload(getBillySessionPayload());
  renderBillySessionPreview();
}

function collectTikTokCards() {
  const creatorsByUsername = new Map();
  const videoLinks = new Set();
  collectTikTokCardsInto(creatorsByUsername, videoLinks);

  return {
    collectedAt: new Date().toISOString(),
    sourceLabel: getTikTokSourceLabel(),
    sourceUrl: window.location.href,
    videosFound: videoLinks.size,
    creators: Array.from(creatorsByUsername.values()),
  };
}

function collectTikTokCardsInto(creatorsByUsername, videoLinks) {
  const videoAnchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));

  videoAnchors.forEach((anchor) => {
    const parsed = parseTikTokVideoUrl(anchor.href);
    if (!parsed) return;

    const videoDescription = getVideoDescription(anchor);
    const existing = creatorsByUsername.get(parsed.username);
    const creator = existing ?? {
      username: parsed.username,
      profileUrl: `https://www.tiktok.com/@${parsed.username}`,
      sampleVideoUrl: parsed.videoUrl,
      videoDescription,
      sourceLink: window.location.href,
      videos: [],
    };

    if (!creator.videos.includes(parsed.videoUrl)) {
      creator.videos.push(parsed.videoUrl);
    }
    if (!creator.videoDescription && videoDescription) {
      creator.videoDescription = videoDescription;
    }
    creatorsByUsername.set(parsed.username, creator);
    videoLinks.add(parsed.videoUrl);
  });
}

function getBillySessionPayload() {
  return {
    collectedAt: billySession?.updatedAt ?? new Date().toISOString(),
    sourceLabel: billySession?.sourceLabel ?? getTikTokSourceLabel(),
    sourceUrl: billySession?.sourceUrl ?? window.location.href,
    startedAt: billySession?.startedAt,
    active: Boolean(billySession?.active),
    videosFound: billySession?.videoLinks.size ?? 0,
    creators: Array.from(billySession?.creatorsByUsername.values() ?? []),
  };
}

function parseTikTokVideoUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    const match = url.pathname.match(/\/@([^/]+)\/video\/(\d+)/);
    if (!match) return undefined;
    const username = decodeURIComponent(match[1]).replace(/^@+/, "").trim();
    const videoId = match[2];
    if (!username || !videoId) return undefined;
    return {
      username,
      videoId,
      videoUrl: `https://www.tiktok.com/@${username}/video/${videoId}`,
    };
  } catch {
    return undefined;
  }
}

function getVideoDescription(anchor) {
  const imageAlt = anchor.querySelector("img[alt]")?.getAttribute("alt") ?? "";
  const ariaLabel = anchor.getAttribute("aria-label") ?? "";
  const ownText = anchor.innerText ?? "";
  const cardText = getNearbyCardText(anchor);
  return cleanText(imageAlt || ariaLabel || ownText || cardText);
}

function getNearbyCardText(anchor) {
  let current = anchor;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const text = cleanText(current.innerText ?? "");
    if (text && text.length < 600) return text;
    current = current.parentElement;
  }
  return "";
}

function getTikTokSourceLabel() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "tag" && parts[1]) return `#${decodeURIComponent(parts[1])}`;
  if (parts[0] === "music" && parts[1]) return decodeURIComponent(parts[1]).replace(/-/g, " ");
  return document.title.replace(/\s*\|\s*TikTok\s*$/i, "").trim() || window.location.href;
}

function isKatlasPage() {
  return (
    window.location.pathname.includes("creator-sourcing") ||
    document.body?.innerText?.includes("CREATOR SOURCING ASSISTANT")
  );
}

function isTikTokPage() {
  return window.location.hostname.includes("tiktok.com");
}

function persistBillyPayload(payload) {
  try {
    chrome.storage.local.set({ lastBillyPayload: payload });
  } catch {
    // Storage is helpful for popup recovery, but collection should still work without it.
  }
}

function showBillyNotice(message) {
  const existing = document.getElementById("katlas-billy-transfer-notice");
  if (existing) existing.remove();

  const notice = document.createElement("div");
  notice.id = "katlas-billy-transfer-notice";
  notice.textContent = message || "Billy transfer complete.";
  notice.setAttribute("role", "status");
  notice.style.position = "fixed";
  notice.style.right = "18px";
  notice.style.bottom = "18px";
  notice.style.zIndex = "2147483647";
  notice.style.maxWidth = "340px";
  notice.style.padding = "12px 14px";
  notice.style.border = "1px solid rgba(16, 185, 129, 0.45)";
  notice.style.borderRadius = "10px";
  notice.style.background = "rgba(8, 13, 17, 0.96)";
  notice.style.boxShadow = "0 18px 48px rgba(0, 0, 0, 0.45)";
  notice.style.color = "#f8fafc";
  notice.style.font =
    "600 13px/1.45 Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  notice.style.letterSpacing = "0";

  document.documentElement.appendChild(notice);
  window.setTimeout(() => {
    notice.remove();
  }, 5200);
}

function renderBillySessionPreview() {
  if (!billySession?.active) return;

  const payload = getBillySessionPayload();
  const existing = document.getElementById(BILLY_SESSION_PREVIEW_ID);
  const panel = existing || document.createElement("div");
  panel.id = BILLY_SESSION_PREVIEW_ID;
  panel.setAttribute("role", "status");
  panel.innerHTML = "";

  const title = document.createElement("div");
  title.textContent = "Billy session running";
  title.style.color = "#f8fafc";
  title.style.fontSize = "13px";
  title.style.fontWeight = "750";

  const source = document.createElement("div");
  source.textContent = `Source: ${payload.sourceLabel}`;
  source.style.marginTop = "3px";
  source.style.color = "#aeb7c2";
  source.style.fontSize = "11px";
  source.style.lineHeight = "1.35";
  source.style.overflow = "hidden";
  source.style.textOverflow = "ellipsis";
  source.style.whiteSpace = "nowrap";

  const metrics = document.createElement("div");
  metrics.style.display = "grid";
  metrics.style.gridTemplateColumns = "1fr 1fr";
  metrics.style.gap = "8px";
  metrics.style.marginTop = "10px";

  metrics.appendChild(createBillyMetric("Creators", payload.creators.length));
  metrics.appendChild(createBillyMetric("Videos", payload.videosFound));

  const sample = document.createElement("div");
  const sampleCreators = payload.creators
    .slice(-3)
    .map((creator) => `@${creator.username}`)
    .join(", ");
  sample.textContent = sampleCreators ? `Latest: ${sampleCreators}` : "Latest: waiting for videos";
  sample.style.marginTop = "9px";
  sample.style.color = "#cbd5e1";
  sample.style.fontSize = "11px";
  sample.style.lineHeight = "1.4";
  sample.style.overflow = "hidden";
  sample.style.textOverflow = "ellipsis";
  sample.style.whiteSpace = "nowrap";

  const hint = document.createElement("div");
  hint.textContent = "Scroll TikTok, then finish in the B popup.";
  hint.style.marginTop = "8px";
  hint.style.color = "#8ee6c2";
  hint.style.fontSize = "11px";
  hint.style.fontWeight = "650";

  panel.appendChild(title);
  panel.appendChild(source);
  panel.appendChild(metrics);
  panel.appendChild(sample);
  panel.appendChild(hint);
  applyBillySessionPreviewStyles(panel);

  if (!existing) document.documentElement.appendChild(panel);
}

function createBillyMetric(label, value) {
  const metric = document.createElement("div");
  metric.style.border = "1px solid rgba(148, 163, 184, 0.22)";
  metric.style.borderRadius = "8px";
  metric.style.background = "rgba(15, 23, 42, 0.72)";
  metric.style.padding = "8px";

  const labelElement = document.createElement("div");
  labelElement.textContent = label;
  labelElement.style.color = "#94a3b8";
  labelElement.style.fontSize = "10px";
  labelElement.style.fontWeight = "700";
  labelElement.style.textTransform = "uppercase";

  const valueElement = document.createElement("div");
  valueElement.textContent = Number(value || 0).toLocaleString();
  valueElement.style.marginTop = "2px";
  valueElement.style.color = "#f8fafc";
  valueElement.style.fontSize = "18px";
  valueElement.style.fontWeight = "800";

  metric.appendChild(labelElement);
  metric.appendChild(valueElement);
  return metric;
}

function applyBillySessionPreviewStyles(panel) {
  panel.style.position = "fixed";
  panel.style.right = "18px";
  panel.style.bottom = "82px";
  panel.style.zIndex = "2147483646";
  panel.style.boxSizing = "border-box";
  panel.style.width = "286px";
  panel.style.maxWidth = "calc(100vw - 36px)";
  panel.style.padding = "12px";
  panel.style.border = "1px solid rgba(16, 185, 129, 0.35)";
  panel.style.borderRadius = "12px";
  panel.style.background = "rgba(8, 13, 17, 0.96)";
  panel.style.boxShadow = "0 18px 48px rgba(0, 0, 0, 0.45)";
  panel.style.fontFamily =
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  panel.style.letterSpacing = "0";
}

function removeBillySessionPreview() {
  document.getElementById(BILLY_SESSION_PREVIEW_ID)?.remove();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}
