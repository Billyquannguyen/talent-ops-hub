const KATLAS_BILLY_EXTENSION_SOURCE = "katlas-billy-extension";

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

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}
