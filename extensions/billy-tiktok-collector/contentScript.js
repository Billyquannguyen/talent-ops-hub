const KATLAS_BILLY_EXTENSION_SOURCE = "katlas-billy-extension";
const BILLY_EXTENSION_IMPORT_STORAGE_KEY = "katlas-billy-extension-import-v1";

let billySession;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "START_BILLY_SESSION") {
    if (!isTikTokCollectionPage()) {
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

    sendBillyImportToKatlasPage(message.payload, message.importId);
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
}

function stopBillySession() {
  if (!billySession) return;
  if (billySession.observer) billySession.observer.disconnect();
  if (billySession.intervalId) window.clearInterval(billySession.intervalId);
  if (billySession.scanTimer) window.clearTimeout(billySession.scanTimer);
  billySession.active = false;
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
  const videoAnchors = getCurrentSourceVideoAnchors();

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

function getCurrentSourceVideoAnchors() {
  const root = document.querySelector("main") ?? document.body;
  if (!root) return [];

  return Array.from(root.querySelectorAll('a[href*="/video/"]')).filter(
    isCollectableVideoAnchor,
  );
}

function isCollectableVideoAnchor(anchor) {
  if (!anchor?.href || !parseTikTokVideoUrl(anchor.href)) return false;
  if (isInsideTikTokChrome(anchor)) return false;
  if (!isElementVisible(anchor)) return false;

  const rect = anchor.getBoundingClientRect();
  if (rect.width < 90 || rect.height < 120) return false;

  const scanMargin = Math.max(window.innerHeight * 2, 1200);
  if (rect.bottom < -scanMargin || rect.top > window.innerHeight + scanMargin) {
    return false;
  }

  return true;
}

function isInsideTikTokChrome(element) {
  return Boolean(
    element.closest(
      [
        "nav",
        "aside",
        "header",
        "footer",
        '[role="navigation"]',
        '[role="dialog"]',
        '[data-e2e="search_top-item-list"]',
      ].join(","),
    ),
  );
}

function isElementVisible(element) {
  let current = element;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
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

function isTikTokCollectionPage() {
  if (!isTikTokPage()) return false;
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "tag" || parts[0] === "music";
}

function sendBillyImportToKatlasPage(payload, importId) {
  const envelope = {
    id: importId || createBillyImportId(),
    source: KATLAS_BILLY_EXTENSION_SOURCE,
    type: "BILLY_IMPORT",
    queuedAt: new Date().toISOString(),
    payload,
  };

  try {
    window.localStorage.setItem(BILLY_EXTENSION_IMPORT_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // The live message below still gives the dashboard a chance to receive the import.
  }

  window.postMessage(envelope, window.location.origin);
}

function createBillyImportId() {
  return `billy-import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}
