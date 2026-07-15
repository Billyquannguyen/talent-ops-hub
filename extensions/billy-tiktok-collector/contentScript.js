const KATLAS_BILLY_EXTENSION_SOURCE = "katlas-billy-extension";
const BILLY_EXTENSION_IMPORT_STORAGE_KEY = "katlas-billy-extension-import-v1";
const SUPPORTED_SOURCE_ERROR =
  "Open a TikTok, Instagram, or YouTube source page first.";

const platformLabels = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

let billySession;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (
    message.type === "START_BILLY_SESSION" ||
    message.type === "GET_BILLY_SESSION_STATE" ||
    message.type === "STOP_BILLY_SESSION" ||
    message.type === "COLLECT_TIKTOK_CARDS"
  ) {
    void handleCollectorMessage(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ ok: false, error: getErrorMessage(error) });
      });
    return true;
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

async function handleCollectorMessage(message) {
  if (message.type === "START_BILLY_SESSION") {
    const platform = getCurrentPlatform();
    if (!platform || !isSupportedCollectionPage(platform)) {
      return { ok: false, error: SUPPORTED_SOURCE_ERROR };
    }

    startBillySession(platform);
    await scanCurrentPageIntoSession();
    return { ok: true, active: true, payload: getBillySessionPayload() };
  }

  if (message.type === "GET_BILLY_SESSION_STATE") {
    if (billySession?.active) await scanCurrentPageIntoSession();
    return {
      ok: true,
      active: Boolean(billySession?.active),
      payload: billySession ? getBillySessionPayload() : undefined,
    };
  }

  if (message.type === "STOP_BILLY_SESSION") {
    if (billySession?.active) await scanCurrentPageIntoSession();
    await waitForPendingTikTokHydration(6000);
    await waitForPendingInstagramHydration(6000);
    await waitForPendingYouTubeHydration(6000);
    const payload = billySession ? getBillySessionPayload() : await collectCurrentPage();
    stopBillySession();
    persistBillyPayload(payload);
    return { ok: true, active: false, payload };
  }

  if (message.type === "COLLECT_TIKTOK_CARDS") {
    if (billySession?.active) {
      await scanCurrentPageIntoSession();
      return { ok: true, active: true, payload: getBillySessionPayload() };
    }

    const payload = await collectCurrentPage();
    persistBillyPayload(payload);
    return { ok: true, active: false, payload };
  }

  return { ok: false, error: "Unknown Billy collector command." };
}

function startBillySession(platform) {
  stopBillySession();
  billySession = createCollectionStore(platform, {
    active: true,
    startedAt: new Date().toISOString(),
  });

  watchCurrentPage();
}

function createCollectionStore(platform, overrides = {}) {
  return {
    platform,
    active: Boolean(overrides.active),
    startedAt: overrides.startedAt,
    updatedAt: new Date().toISOString(),
    sourceLabel: getSourceLabel(platform),
    sourceUrl: window.location.href,
    creatorsByKey: new Map(),
    mediaLinks: new Set(),
    scanTimer: undefined,
    observer: undefined,
    intervalId: undefined,
    instagramPostQueue: [],
    instagramPostQueued: new Set(),
    instagramPostHydrating: 0,
    instagramProfileQueue: [],
    instagramProfileQueued: new Set(),
    instagramProfileHydrating: 0,
    instagramHydrationPromises: new Set(),
    youtubeVideoQueue: [],
    youtubeVideoQueued: new Set(),
    youtubeVideoHydrating: 0,
    youtubeProfileQueue: [],
    youtubeProfileQueued: new Set(),
    youtubeProfileHydrating: 0,
    youtubeHydrationPromises: new Set(),
    tiktokProfileQueue: [],
    tiktokProfileQueued: new Set(),
    tiktokProfileHydrating: 0,
    tiktokHydrationPromises: new Set(),
  };
}

function stopBillySession() {
  if (!billySession) return;
  if (billySession.observer) billySession.observer.disconnect();
  if (billySession.intervalId) window.clearInterval(billySession.intervalId);
  if (billySession.scanTimer) window.clearTimeout(billySession.scanTimer);
  billySession.active = false;
}

function watchCurrentPage() {
  if (!billySession?.active) return;

  if (document.body) {
    billySession.observer = new MutationObserver(scheduleSessionScan);
    billySession.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  billySession.intervalId = window.setInterval(() => {
    void scanCurrentPageIntoSession();
  }, 1800);
}

function scheduleSessionScan() {
  if (!billySession?.active) return;
  if (billySession.scanTimer) window.clearTimeout(billySession.scanTimer);
  billySession.scanTimer = window.setTimeout(() => {
    void scanCurrentPageIntoSession();
  }, 450);
}

async function scanCurrentPageIntoSession() {
  if (!billySession?.active) return;
  collectCurrentPageInto(billySession);
  billySession.updatedAt = new Date().toISOString();
  persistBillyPayload(getBillySessionPayload());
}

async function collectCurrentPage() {
  const platform = getCurrentPlatform() || "tiktok";
  const store = createCollectionStore(platform);
  collectCurrentPageInto(store);
  return getPayloadFromStore(store);
}

function collectCurrentPageInto(store) {
  if (store.platform === "instagram") {
    collectInstagramCardsInto(store);
    runInstagramHydrationQueues(store);
    return;
  }

  if (store.platform === "youtube") {
    collectYouTubeCardsInto(store);
    runYouTubeHydrationQueues(store);
    return;
  }

  collectTikTokCardsInto(store);
  runTikTokProfileHydrationQueue(store);
}

function collectTikTokCardsInto(store) {
  const videoAnchors = getCurrentSourceVideoAnchors();

  videoAnchors.forEach((anchor) => {
    const parsed = parseTikTokVideoUrl(anchor.href);
    if (!parsed) return;

    const videoDescription = getMediaDescription(anchor);
    addCreatorToStore(store, {
      platform: "TikTok",
      username: parsed.username,
      profileUrl: `https://www.tiktok.com/@${parsed.username}`,
      sampleVideoUrl: parsed.videoUrl,
      videoDescription,
      sourceLink: store.sourceUrl,
      videos: [parsed.videoUrl],
    });
    queueTikTokProfileHydration(store, parsed.username);
    store.mediaLinks.add(parsed.videoUrl);
  });
}

function collectInstagramCardsInto(store) {
  const mediaAnchors = getCurrentSourceInstagramAnchors();

  mediaAnchors.forEach((anchor) => {
    const parsed = parseInstagramMediaUrl(anchor.href);
    if (!parsed) return;

    const mediaDescription = getMediaDescription(anchor);
    const username =
      extractInstagramUsernameFromAnchor(anchor) ||
      extractInstagramUsernameFromText(mediaDescription);

    store.mediaLinks.add(parsed.mediaUrl);

    if (username) {
      addInstagramCreatorToStore(store, parsed, username, mediaDescription);
      return;
    }

    queueInstagramPostHydration(store, parsed, mediaDescription);
  });
}

function addInstagramCreatorToStore(store, parsed, username, mediaDescription) {
  addCreatorToStore(store, {
    platform: "Instagram",
    username,
    profileUrl: `https://www.instagram.com/${username}/`,
    sampleVideoUrl: parsed.mediaUrl,
    videoDescription: mediaDescription,
    sourceLink: store.sourceUrl,
    videos: [parsed.mediaUrl],
  });
  queueInstagramProfileHydration(store, username);
}

function collectYouTubeCardsInto(store) {
  const mediaAnchors = getCurrentSourceYouTubeAnchors();

  mediaAnchors.forEach((anchor) => {
    const parsed = parseYouTubeMediaUrl(anchor.href);
    if (!parsed) return;

    const mediaDescription = getMediaDescription(anchor);
    const channel =
      extractYouTubeChannelFromAnchor(anchor) ||
      extractYouTubeChannelFromText(mediaDescription);

    store.mediaLinks.add(parsed.mediaUrl);

    if (channel?.username) {
      addYouTubeCreatorToStore(store, parsed, channel, mediaDescription);
      return;
    }

    queueYouTubeVideoHydration(store, parsed, mediaDescription);
  });
}

function addYouTubeCreatorToStore(store, parsed, channel, mediaDescription) {
  addCreatorToStore(store, {
    platform: "YouTube",
    username: channel.username,
    profileUrl: channel.profileUrl,
    sampleVideoUrl: parsed.mediaUrl,
    videoDescription: mediaDescription,
    sourceLink: store.sourceUrl,
    followers: channel.followers,
    videos: [parsed.mediaUrl],
  });
  queueYouTubeProfileHydration(store, channel.username, channel.profileUrl);
}

function addCreatorToStore(store, creator) {
  const username = cleanUsername(creator.username);
  if (!username) return;

  const key = `${creator.platform.toLowerCase()}:${username.toLowerCase()}`;
  const existing = store.creatorsByKey.get(key);
  const next = existing ?? {
    platform: creator.platform,
    username,
    profileUrl: creator.profileUrl,
    sampleVideoUrl: creator.sampleVideoUrl,
    videoDescription: creator.videoDescription || "",
    profileBio: creator.profileBio || "",
    bioLink: creator.bioLink || "",
    sourceLink: creator.sourceLink || store.sourceUrl,
    followers: normalizeFollowerValue(creator.followers),
    videos: [],
  };

  if (!next.profileUrl && creator.profileUrl) next.profileUrl = creator.profileUrl;
  if (!next.sampleVideoUrl && creator.sampleVideoUrl) next.sampleVideoUrl = creator.sampleVideoUrl;
  if (!next.videoDescription && creator.videoDescription) {
    next.videoDescription = creator.videoDescription;
  }
  if (!next.profileBio && creator.profileBio) next.profileBio = creator.profileBio;
  if (!next.bioLink && creator.bioLink) next.bioLink = creator.bioLink;
  if (!next.sourceLink && creator.sourceLink) next.sourceLink = creator.sourceLink;

  const followerValue = normalizeFollowerValue(creator.followers);
  if ((next.followers === "" || next.followers == null) && followerValue !== "") {
    next.followers = followerValue;
  }

  (creator.videos || []).forEach((videoUrl) => {
    if (videoUrl && !next.videos.includes(videoUrl)) next.videos.push(videoUrl);
  });

  store.creatorsByKey.set(key, next);
}

function updateCreatorProfileData(store, platform, username, profileData) {
  const key = `${platform.toLowerCase()}:${cleanUsername(username).toLowerCase()}`;
  const creator = store.creatorsByKey.get(key);
  if (!creator) return;

  const followerValue = normalizeFollowerValue(profileData.followers);
  if ((creator.followers === "" || creator.followers == null) && followerValue !== "") {
    creator.followers = followerValue;
  }
  if (profileData.bio) creator.profileBio = profileData.bio;
  if (!creator.bioLink && profileData.bioLink) {
    creator.bioLink = profileData.bioLink;
  }
}

function queueTikTokProfileHydration(store, username) {
  if (store !== billySession || store.platform !== "tiktok") return;
  const clean = cleanUsername(username);
  if (!clean || store.tiktokProfileQueued.has(clean.toLowerCase())) return;
  store.tiktokProfileQueued.add(clean.toLowerCase());
  store.tiktokProfileQueue.push(clean);
}

function runTikTokProfileHydrationQueue(store) {
  if (store.platform !== "tiktok") return;

  while (store.tiktokProfileHydrating < 2 && store.tiktokProfileQueue.length > 0) {
    const username = store.tiktokProfileQueue.shift();
    store.tiktokProfileHydrating += 1;

    const promise = hydrateTikTokProfile(username)
      .then((profileData) => {
        updateCreatorProfileData(store, "TikTok", username, profileData);
      })
      .catch(() => {
        // Profile data is best-effort and must not block the creator import.
      })
      .finally(() => {
        store.tiktokProfileHydrating -= 1;
        store.tiktokHydrationPromises.delete(promise);
        store.updatedAt = new Date().toISOString();
        persistBillyPayload(getPayloadFromStore(store));
        runTikTokProfileHydrationQueue(store);
      });

    store.tiktokHydrationPromises.add(promise);
  }
}

async function waitForPendingTikTokHydration(timeoutMs) {
  const store = billySession;
  if (!store || store.platform !== "tiktok") return;

  const deadline = Date.now() + timeoutMs;
  while (
    (store.tiktokProfileQueue.length > 0 || store.tiktokProfileHydrating > 0) &&
    Date.now() < deadline
  ) {
    runTikTokProfileHydrationQueue(store);
    if (store.tiktokHydrationPromises.size === 0) {
      await wait(250);
      continue;
    }
    await Promise.race([Promise.allSettled(Array.from(store.tiktokHydrationPromises)), wait(250)]);
  }
}

async function hydrateTikTokProfile(username) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(`https://www.tiktok.com/@${cleanUsername(username)}`, {
      credentials: "include",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`TikTok returned HTTP ${response.status}.`);
    const html = await response.text();
    return {
      followers: extractTikTokFollowersFromHtml(html),
      bio: extractTikTokBioFromHtml(html),
      bioLink: extractTikTokBioLinkFromHtml(html),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function getCurrentSourceVideoAnchors() {
  const root = document.querySelector("main") ?? document.body;
  if (!root) return [];

  return Array.from(root.querySelectorAll('a[href*="/video/"]')).filter(
    isCollectableTikTokVideoAnchor,
  );
}

function getCurrentSourceInstagramAnchors() {
  const root = document.querySelector("main") ?? document.body;
  if (!root) return [];

  return Array.from(
    root.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]'),
  ).filter(isCollectableInstagramMediaAnchor);
}

function getCurrentSourceYouTubeAnchors() {
  const root = document.querySelector("ytd-app") ?? document.querySelector("main") ?? document.body;
  if (!root) return [];

  return Array.from(
    root.querySelectorAll('a[href*="/watch"], a[href*="/shorts/"]'),
  ).filter(isCollectableYouTubeMediaAnchor);
}

function isCollectableTikTokVideoAnchor(anchor) {
  if (!anchor?.href || !parseTikTokVideoUrl(anchor.href)) return false;
  if (isInsidePageChrome(anchor)) return false;
  return isCollectableCardAnchor(anchor, 90, 120);
}

function isCollectableInstagramMediaAnchor(anchor) {
  if (!anchor?.href || !parseInstagramMediaUrl(anchor.href)) return false;
  if (isInsidePageChrome(anchor)) return false;
  return isCollectableCardAnchor(anchor, 70, 70);
}

function isCollectableYouTubeMediaAnchor(anchor) {
  if (!anchor?.href || !parseYouTubeMediaUrl(anchor.href)) return false;
  if (isInsidePageChrome(anchor)) return false;

  const rect = anchor.getBoundingClientRect();
  const hasVisibleSize = rect.width >= 80 && rect.height >= 45;
  const hasImage = Boolean(anchor.querySelector("img, yt-image"));
  const hasTitleishText = cleanText(anchor.innerText || anchor.getAttribute("title") || "").length > 8;
  if (!hasVisibleSize && !hasImage && !hasTitleishText) return false;

  const scanMargin = Math.max(window.innerHeight * 2, 1200);
  if (rect.bottom < -scanMargin || rect.top > window.innerHeight + scanMargin) return false;

  return isElementVisible(anchor);
}

function isCollectableCardAnchor(anchor, minWidth, minHeight) {
  if (!isElementVisible(anchor)) return false;

  const rect = anchor.getBoundingClientRect();
  if (rect.width < minWidth || rect.height < minHeight) return false;

  const scanMargin = Math.max(window.innerHeight * 2, 1200);
  if (rect.bottom < -scanMargin || rect.top > window.innerHeight + scanMargin) {
    return false;
  }

  return true;
}

function isInsidePageChrome(element) {
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
  return getPayloadFromStore(billySession);
}

function getPayloadFromStore(store) {
  const platform = platformLabels[store?.platform] || "TikTok";
  return {
    platform,
    collectedAt: store?.updatedAt ?? new Date().toISOString(),
    sourceLabel: store?.sourceLabel ?? getSourceLabel(store?.platform || getCurrentPlatform()),
    sourceUrl: store?.sourceUrl ?? window.location.href,
    startedAt: store?.startedAt,
    active: Boolean(store?.active),
    videosFound: store?.mediaLinks.size ?? 0,
    creators: Array.from(store?.creatorsByKey.values() ?? []),
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

function parseInstagramMediaUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    if (!url.hostname.includes("instagram.com")) return undefined;
    const match = url.pathname.match(/^\/(p|reel|tv)\/([^/?#]+)/i);
    if (!match) return undefined;
    const mediaType = match[1].toLowerCase();
    const shortcode = match[2];
    if (!shortcode) return undefined;
    return {
      mediaType,
      shortcode,
      mediaUrl: `https://www.instagram.com/${mediaType}/${shortcode}/`,
    };
  } catch {
    return undefined;
  }
}

function parseInstagramProfileUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    if (!url.hostname.includes("instagram.com")) return undefined;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return undefined;
    const username = cleanUsername(parts[0]);
    if (!username || isReservedInstagramPath(username)) return undefined;
    return username;
  } catch {
    return undefined;
  }
}

function parseYouTubeMediaUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    if (!isYouTubeHost(url.hostname)) return undefined;

    if (url.pathname === "/watch") {
      const videoId = url.searchParams.get("v");
      if (!isLikelyYouTubeVideoId(videoId)) return undefined;
      return {
        mediaType: "watch",
        videoId,
        mediaUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }

    const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/i);
    if (shortsMatch?.[1] && isLikelyYouTubeVideoId(shortsMatch[1])) {
      return {
        mediaType: "shorts",
        videoId: shortsMatch[1],
        mediaUrl: `https://www.youtube.com/shorts/${shortsMatch[1]}`,
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function parseYouTubeChannelUrl(value, fallbackText = "") {
  try {
    const url = new URL(value, window.location.href);
    if (!isYouTubeHost(url.hostname)) return undefined;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return undefined;

    const first = decodeURIComponent(parts[0]);
    let username = "";
    let profileUrl = "";

    if (first.startsWith("@")) {
      username = cleanUsername(first);
      profileUrl = `https://www.youtube.com/@${username}`;
    } else if (["channel", "c", "user"].includes(first) && parts[1]) {
      username = cleanUsername(parts[1]);
      profileUrl = `https://www.youtube.com/${first}/${username}`;
    }

    if (!username || isReservedYouTubePath(username)) return undefined;

    return {
      username,
      profileUrl,
      label: cleanText(fallbackText) || username,
    };
  } catch {
    return undefined;
  }
}

function getMediaDescription(anchor) {
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

function extractInstagramUsernameFromAnchor(anchor) {
  let current = anchor;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const profileLinks = Array.from(current.querySelectorAll("a[href]"));
    for (const link of profileLinks) {
      const username = parseInstagramProfileUrl(link.href);
      if (username) return username;
    }
    current = current.parentElement;
  }
  return undefined;
}

function extractYouTubeChannelFromAnchor(anchor) {
  let current = anchor;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    const channelLinks = Array.from(
      current.querySelectorAll('a[href^="/@"], a[href*="/channel/"], a[href*="/c/"], a[href*="/user/"]'),
    );

    for (const link of channelLinks) {
      const channel = parseYouTubeChannelUrl(link.href, link.innerText || link.textContent || "");
      if (channel) return channel;
    }

    const handleText = cleanText(current.innerText || "").match(/@([A-Za-z0-9._-]{2,80})/)?.[1];
    if (handleText) {
      return {
        username: cleanUsername(handleText),
        profileUrl: `https://www.youtube.com/@${cleanUsername(handleText)}`,
        label: cleanUsername(handleText),
      };
    }

    current = current.parentElement;
  }

  return undefined;
}

function extractYouTubeChannelFromText(value) {
  const text = cleanText(value || "");
  if (!text) return undefined;

  const handle = text.match(/@([A-Za-z0-9._-]{2,80})/)?.[1];
  if (handle) {
    const username = cleanUsername(handle);
    return {
      username,
      profileUrl: `https://www.youtube.com/@${username}`,
      label: username,
    };
  }

  return undefined;
}

function queueInstagramPostHydration(store, parsed, fallbackDescription) {
  if (store !== billySession || store.platform !== "instagram") return;
  if (store.instagramPostQueued.has(parsed.mediaUrl)) return;
  store.instagramPostQueued.add(parsed.mediaUrl);
  store.instagramPostQueue.push({ parsed, fallbackDescription });
}

function queueInstagramProfileHydration(store, username) {
  if (store !== billySession || store.platform !== "instagram") return;
  const clean = cleanUsername(username);
  if (!clean || store.instagramProfileQueued.has(clean.toLowerCase())) return;
  store.instagramProfileQueued.add(clean.toLowerCase());
  store.instagramProfileQueue.push(clean);
}

function runInstagramHydrationQueues(store) {
  runInstagramPostHydrationQueue(store);
  runInstagramProfileHydrationQueue(store);
}

function runInstagramPostHydrationQueue(store) {
  if (store.platform !== "instagram") return;

  while (store.instagramPostHydrating < 3 && store.instagramPostQueue.length > 0) {
    const item = store.instagramPostQueue.shift();
    store.instagramPostHydrating += 1;

    const promise = hydrateInstagramPost(item)
      .then((result) => {
        if (!result?.username) return;
        addInstagramCreatorToStore(store, item.parsed, result.username, result.description);
      })
      .catch(() => {
        // Instagram sometimes hides post data. The visible grid scan still keeps any direct hits.
      })
      .finally(() => {
        store.instagramPostHydrating -= 1;
        store.instagramHydrationPromises.delete(promise);
        store.updatedAt = new Date().toISOString();
        persistBillyPayload(getPayloadFromStore(store));
        runInstagramHydrationQueues(store);
      });

    store.instagramHydrationPromises.add(promise);
  }
}

function runInstagramProfileHydrationQueue(store) {
  if (store.platform !== "instagram") return;

  while (store.instagramProfileHydrating < 2 && store.instagramProfileQueue.length > 0) {
    const username = store.instagramProfileQueue.shift();
    store.instagramProfileHydrating += 1;

    const promise = hydrateInstagramProfile(username)
      .then((profileData) => {
        updateCreatorProfileData(store, "Instagram", username, profileData);
      })
      .catch(() => {
        // Profile lookup is best-effort and should never block collected links.
      })
      .finally(() => {
        store.instagramProfileHydrating -= 1;
        store.instagramHydrationPromises.delete(promise);
        store.updatedAt = new Date().toISOString();
        persistBillyPayload(getPayloadFromStore(store));
        runInstagramHydrationQueues(store);
      });

    store.instagramHydrationPromises.add(promise);
  }
}

async function waitForPendingInstagramHydration(timeoutMs) {
  const store = billySession;
  if (!store || store.platform !== "instagram") return;

  const deadline = Date.now() + timeoutMs;
  while (hasPendingInstagramHydration(store) && Date.now() < deadline) {
    runInstagramHydrationQueues(store);
    if (store.instagramHydrationPromises.size === 0) {
      await wait(250);
      continue;
    }
    await Promise.race([Promise.allSettled(Array.from(store.instagramHydrationPromises)), wait(250)]);
  }
}

function hasPendingInstagramHydration(store) {
  return (
    store.instagramPostQueue.length > 0 ||
    store.instagramPostHydrating > 0 ||
    store.instagramProfileQueue.length > 0 ||
    store.instagramProfileHydrating > 0
  );
}

function queueYouTubeVideoHydration(store, parsed, fallbackDescription) {
  if (store !== billySession || store.platform !== "youtube") return;
  if (store.youtubeVideoQueued.has(parsed.mediaUrl)) return;
  store.youtubeVideoQueued.add(parsed.mediaUrl);
  store.youtubeVideoQueue.push({ parsed, fallbackDescription });
}

function queueYouTubeProfileHydration(store, username, profileUrl) {
  if (store !== billySession || store.platform !== "youtube") return;
  const clean = cleanUsername(username);
  if (!clean || store.youtubeProfileQueued.has(clean.toLowerCase())) return;
  store.youtubeProfileQueued.add(clean.toLowerCase());
  store.youtubeProfileQueue.push({ username: clean, profileUrl });
}

function runYouTubeHydrationQueues(store) {
  runYouTubeVideoHydrationQueue(store);
  runYouTubeProfileHydrationQueue(store);
}

function runYouTubeVideoHydrationQueue(store) {
  if (store.platform !== "youtube") return;

  while (store.youtubeVideoHydrating < 3 && store.youtubeVideoQueue.length > 0) {
    const item = store.youtubeVideoQueue.shift();
    store.youtubeVideoHydrating += 1;

    const promise = hydrateYouTubeVideo(item)
      .then((result) => {
        if (!result?.channel?.username) return;
        addYouTubeCreatorToStore(
          store,
          item.parsed,
          result.channel,
          result.description || item.fallbackDescription || "",
        );
      })
      .catch(() => {
        // YouTube page data is best-effort. Visible card data still stays collected.
      })
      .finally(() => {
        store.youtubeVideoHydrating -= 1;
        store.youtubeHydrationPromises.delete(promise);
        store.updatedAt = new Date().toISOString();
        persistBillyPayload(getPayloadFromStore(store));
        runYouTubeHydrationQueues(store);
      });

    store.youtubeHydrationPromises.add(promise);
  }
}

function runYouTubeProfileHydrationQueue(store) {
  if (store.platform !== "youtube") return;

  while (store.youtubeProfileHydrating < 2 && store.youtubeProfileQueue.length > 0) {
    const item = store.youtubeProfileQueue.shift();
    store.youtubeProfileHydrating += 1;

    const promise = hydrateYouTubeProfile(item.profileUrl, item.username)
      .then((profileData) => {
        updateCreatorProfileData(store, "YouTube", item.username, profileData);
      })
      .catch(() => {
        // Subscriber lookup is best-effort and should never block collected links.
      })
      .finally(() => {
        store.youtubeProfileHydrating -= 1;
        store.youtubeHydrationPromises.delete(promise);
        store.updatedAt = new Date().toISOString();
        persistBillyPayload(getPayloadFromStore(store));
        runYouTubeHydrationQueues(store);
      });

    store.youtubeHydrationPromises.add(promise);
  }
}

async function waitForPendingYouTubeHydration(timeoutMs) {
  const store = billySession;
  if (!store || store.platform !== "youtube") return;

  const deadline = Date.now() + timeoutMs;
  while (hasPendingYouTubeHydration(store) && Date.now() < deadline) {
    runYouTubeHydrationQueues(store);
    if (store.youtubeHydrationPromises.size === 0) {
      await wait(250);
      continue;
    }
    await Promise.race([Promise.allSettled(Array.from(store.youtubeHydrationPromises)), wait(250)]);
  }
}

function hasPendingYouTubeHydration(store) {
  return (
    store.youtubeVideoQueue.length > 0 ||
    store.youtubeVideoHydrating > 0 ||
    store.youtubeProfileQueue.length > 0 ||
    store.youtubeProfileHydrating > 0
  );
}

async function hydrateYouTubeVideo(item) {
  const html = await fetchYouTubeHtml(item.parsed.mediaUrl);
  const channel = extractYouTubeChannelFromHtml(html);
  if (!channel?.username) return undefined;
  return {
    channel,
    description: extractYouTubeDescriptionFromHtml(html) || item.fallbackDescription || "",
  };
}

async function hydrateYouTubeProfile(profileUrl, username) {
  const html = await fetchYouTubeHtml(profileUrl || `https://www.youtube.com/@${cleanUsername(username)}`);
  return {
    followers: extractYouTubeSubscribersFromHtml(html),
    bio: extractYouTubeDescriptionFromHtml(html),
    bioLink: extractYouTubeBioLinkFromHtml(html),
  };
}

async function fetchYouTubeHtml(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      credentials: "include",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`YouTube returned HTTP ${response.status}.`);
    return await response.text();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function hydrateInstagramPost(item) {
  const html = await fetchInstagramHtml(item.parsed.mediaUrl);
  const username =
    extractInstagramUsernameFromHtml(html) ||
    extractInstagramUsernameFromText(item.fallbackDescription);
  if (!username) return undefined;
  return {
    username,
    description: extractInstagramCaptionFromHtml(html) || item.fallbackDescription || "",
  };
}

async function hydrateInstagramProfile(username) {
  const html = await fetchInstagramHtml(`https://www.instagram.com/${cleanUsername(username)}/`);
  return {
    followers: extractInstagramFollowersFromHtml(html),
    bio: extractInstagramBioFromHtml(html),
    bioLink: extractInstagramBioLinkFromHtml(html),
  };
}

async function fetchInstagramHtml(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      credentials: "include",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`Instagram returned HTTP ${response.status}.`);
    return await response.text();
  } finally {
    window.clearTimeout(timeout);
  }
}

function extractInstagramUsernameFromHtml(html) {
  const textCandidates = [
    getMetaContent(html, "og:title"),
    getMetaContent(html, "twitter:title"),
    getMetaContent(html, "description"),
    getMetaContent(html, "og:description"),
  ];

  for (const text of textCandidates) {
    const username = extractInstagramUsernameFromText(decodeHtmlEntities(text));
    if (username) return username;
  }

  const jsonCandidates = [
    html.match(/"owner_username"\s*:\s*"([A-Za-z0-9._]{1,30})"/i)?.[1],
    html.match(/"ownerUsername"\s*:\s*"([A-Za-z0-9._]{1,30})"/i)?.[1],
    html.match(/"owner"\s*:\s*\{[^{}]*"username"\s*:\s*"([A-Za-z0-9._]{1,30})"/i)?.[1],
  ];

  for (const candidate of jsonCandidates) {
    const username = normalizeInstagramUsername(candidate);
    if (username) return username;
  }

  return undefined;
}

function extractInstagramUsernameFromText(value) {
  const text = cleanText(decodeHtmlEntities(value || ""));
  if (!text) return undefined;

  const patterns = [
    /\b(?:Photo|Video|Reel)\s+by\s+@?([A-Za-z0-9._]{1,30})\b/i,
    /^@?([A-Za-z0-9._]{1,30})\s+on Instagram\b/i,
    /\(@([A-Za-z0-9._]{1,30})\)/i,
    /@([A-Za-z0-9._]{1,30})\b/i,
  ];

  for (const pattern of patterns) {
    const username = normalizeInstagramUsername(text.match(pattern)?.[1]);
    if (username) return username;
  }

  return undefined;
}

function extractInstagramCaptionFromHtml(html) {
  const description =
    getMetaContent(html, "og:description") ||
    getMetaContent(html, "description") ||
    getMetaContent(html, "twitter:description");
  const decoded = cleanText(decodeHtmlEntities(description));
  const quoted = decoded.match(/:\s*["“](.+?)["”]\s*$/)?.[1];
  return cleanText(quoted || decoded);
}

function extractInstagramFollowersFromHtml(html) {
  const text = cleanText(
    decodeHtmlEntities(
      [
        getMetaContent(html, "og:description"),
        getMetaContent(html, "description"),
        getMetaContent(html, "twitter:description"),
      ].join(" "),
    ),
  );
  const match = text.match(/([\d,.]+)\s*([KMB]?)\s+Followers/i);
  if (!match) return "";
  return parseCompactNumber(`${match[1]}${match[2]}`);
}

function extractInstagramBioFromHtml(html) {
  const biography = html.match(/"biography"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1];
  if (biography) return cleanText(decodeJsonString(biography));

  const description = cleanText(
    decodeHtmlEntities(getMetaContent(html, "description") || getMetaContent(html, "og:description")),
  );
  const afterPosts = description.split(/\bPosts?\s*-\s*/i)[1];
  return cleanText(afterPosts || "");
}

function extractInstagramBioLinkFromHtml(html) {
  const candidates = [
    html.match(/"external_url"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1],
    html.match(/"externalUrl"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1],
    html.match(/"bio_links"\s*:\s*\[[\s\S]{0,3000}?"url"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1],
  ];
  return firstDirectBioLink(candidates, "instagram.com");
}

function extractTikTokBioFromHtml(html) {
  const signature = html.match(/"signature"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1];
  return signature ? cleanText(decodeJsonString(signature)) : "";
}

function extractTikTokFollowersFromHtml(html) {
  const structuredCount = html.match(/"followerCount"\s*:\s*"?([\d,.]+)"?/i)?.[1];
  if (structuredCount) {
    const parsed = parseCompactNumber(structuredCount);
    if (parsed !== "") return parsed;
  }

  const metaText = cleanText(
    decodeHtmlEntities(
      [
        getMetaContent(html, "description"),
        getMetaContent(html, "og:description"),
        getMetaContent(html, "twitter:description"),
      ].join(" "),
    ),
  );
  const metaMatch = metaText.match(/([\d,.]+)\s*([KMB]?)\s*Followers/i);
  if (!metaMatch) return "";
  return parseCompactNumber(`${metaMatch[1]}${metaMatch[2]}`);
}

function extractTikTokBioLinkFromHtml(html) {
  const candidates = [
    html.match(/"bioLink"\s*:\s*\{[\s\S]{0,1000}?"link"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1],
    html.match(/"bioLink"\s*:\s*\{[\s\S]{0,1000}?"url"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1],
  ];
  return firstDirectBioLink(candidates, "tiktok.com");
}

function extractYouTubeChannelFromHtml(html) {
  const profileCandidates = [
    decodeJsonString(html.match(/"ownerProfileUrl"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1] || ""),
    decodeJsonString(html.match(/"canonicalBaseUrl"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1] || ""),
    decodeJsonString(html.match(/"browseUrl"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1] || ""),
  ].filter(Boolean);
  const ownerName = decodeJsonString(
    html.match(/"ownerChannelName"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1] ||
      html.match(/"channelName"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1] ||
      "",
  );

  for (const candidate of profileCandidates) {
    const channel = parseYouTubeChannelUrl(candidate, ownerName);
    if (channel) return channel;
  }

  const handle = html.match(/"webCommandMetadata"\s*:\s*\{[^{}]*"url"\s*:\s*"\\?\/(@[^"\\]+)"/i)?.[1];
  if (handle) {
    const username = cleanUsername(decodeJsonString(handle));
    return {
      username,
      profileUrl: `https://www.youtube.com/@${username}`,
      label: ownerName || username,
    };
  }

  return undefined;
}

function extractYouTubeSubscribersFromHtml(html) {
  const textCandidates = [
    decodeJsonString(
      html.match(/"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1] ||
        "",
    ),
    decodeHtmlEntities(getMetaContent(html, "description")),
    decodeHtmlEntities(getMetaContent(html, "og:description")),
    decodeHtmlEntities(html),
  ];

  for (const text of textCandidates) {
    const match = cleanText(text).match(/([\d,.]+)\s*([KMB]?)\s+subscribers?/i);
    if (!match) continue;
    const parsed = parseCompactNumber(`${match[1]}${match[2]}`);
    if (parsed !== "") return parsed;
  }

  return "";
}

function extractYouTubeDescriptionFromHtml(html) {
  const attributed = decodeJsonString(
    html.match(/"attributedDescription"\s*:\s*\{\s*"content"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1] ||
      "",
  );
  if (attributed) return cleanText(attributed);

  const simple = decodeJsonString(
    html.match(/"description"\s*:\s*\{\s*"simpleText"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1] || "",
  );
  if (simple) return cleanText(simple);

  return cleanText(
    decodeHtmlEntities(
      getMetaContent(html, "description") ||
        getMetaContent(html, "og:description") ||
        getMetaContent(html, "twitter:description"),
    ),
  );
}

function extractYouTubeBioLinkFromHtml(html) {
  const externalLinkSection = html.match(/"channelExternalLinkViewModel"[\s\S]{0,4000}/i)?.[0] || "";
  const candidates = [
    externalLinkSection.match(/"content"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1],
    externalLinkSection.match(/"url"\s*:\s*"((?:\\"|[^"])*)"/i)?.[1],
  ];
  return firstDirectBioLink(candidates, "youtube.com");
}

function firstDirectBioLink(candidates, platformDomain) {
  for (const candidate of candidates) {
    const normalized = normalizeDirectBioLink(candidate, platformDomain);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeDirectBioLink(value, platformDomain) {
  const decoded = decodeHtmlEntities(decodeJsonString(value || "")).trim();
  if (!decoded) return "";

  try {
    const url = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded);
    if (!/^https?:$/.test(url.protocol)) return "";

    const redirectTarget =
      url.searchParams.get("u") || url.searchParams.get("q") || url.searchParams.get("url");
    if (redirectTarget) {
      const unwrapped = normalizeDirectBioLink(redirectTarget, platformDomain);
      if (unwrapped) return unwrapped;
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === platformDomain || hostname.endsWith(`.${platformDomain}`)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function getMetaContent(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const nameMatch = tag.match(/(?:name|property)=["']([^"']+)["']/i);
    if (nameMatch?.[1]?.toLowerCase() !== name.toLowerCase()) continue;
    const contentMatch = tag.match(/content=(["'])(.*?)\1/i);
    if (contentMatch?.[2]) return contentMatch[2];
  }

  return "";
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
}

function getSourceLabel(platform) {
  if (platform === "instagram") return getInstagramSourceLabel();
  if (platform === "youtube") return getYouTubeSourceLabel();
  return getTikTokSourceLabel();
}

function getTikTokSourceLabel() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "tag" && parts[1]) return `#${decodeURIComponent(parts[1])}`;
  if (parts[0] === "music" && parts[1]) return decodeURIComponent(parts[1]).replace(/-/g, " ");
  return document.title.replace(/\s*\|\s*TikTok\s*$/i, "").trim() || window.location.href;
}

function getInstagramSourceLabel() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "explore" && parts[1] === "tags" && parts[2]) {
    return `#${decodeURIComponent(parts[2])}`;
  }
  if ((parts[0] === "reels" && parts[1] === "audio" && parts[2]) || parts[0] === "audio") {
    return `Instagram audio ${decodeURIComponent(parts[2] || parts[1] || "")}`.trim();
  }
  return document.title.replace(/\s*•\s*Instagram\s*$/i, "").trim() || window.location.href;
}

function getYouTubeSourceLabel() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "hashtag" && parts[1]) return `#${decodeURIComponent(parts[1])}`;
  if (parts[0] === "results") {
    const query = new URLSearchParams(window.location.search).get("search_query");
    return query ? `YouTube search: ${query}` : "YouTube search";
  }
  if (parts[0]?.startsWith("@")) return `YouTube ${decodeURIComponent(parts[0])}`;
  if (parts[0] === "shorts") return "YouTube Shorts";
  return document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim() || window.location.href;
}

function isKatlasPage() {
  return (
    window.location.pathname.includes("creator-sourcing") ||
    document.body?.innerText?.includes("CREATOR SOURCING ASSISTANT")
  );
}

function getCurrentPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes("tiktok.com")) return "tiktok";
  if (hostname.includes("instagram.com")) return "instagram";
  if (isYouTubeHost(hostname)) return "youtube";
  return undefined;
}

function isSupportedCollectionPage(platform) {
  const parts = window.location.pathname.split("/").filter(Boolean);

  if (platform === "tiktok") {
    return parts[0] === "tag" || parts[0] === "music";
  }

  if (platform === "instagram") {
    return (
      (parts[0] === "explore" && parts[1] === "tags" && Boolean(parts[2])) ||
      (parts[0] === "reels" && parts[1] === "audio" && Boolean(parts[2])) ||
      (parts[0] === "audio" && Boolean(parts[1]))
    );
  }

  if (platform === "youtube") {
    return (
      parts[0] === "results" ||
      parts[0] === "hashtag" ||
      parts[0] === "feed" ||
      parts[0] === "shorts" ||
      parts[0]?.startsWith("@") ||
      ["channel", "c", "user"].includes(parts[0])
    );
  }

  return false;
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

function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "");
}

function normalizeInstagramUsername(value) {
  const username = cleanUsername(value);
  if (!username || !/^[A-Za-z0-9._]{1,30}$/.test(username)) return undefined;
  if (isReservedInstagramPath(username)) return undefined;
  return username;
}

function isReservedInstagramPath(value) {
  return [
    "about",
    "accounts",
    "api",
    "audio",
    "direct",
    "explore",
    "instagram",
    "legal",
    "p",
    "reel",
    "reels",
    "stories",
    "tv",
  ].includes(String(value || "").toLowerCase());
}

function isYouTubeHost(hostname) {
  return (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname.endsWith(".youtube.com") ||
    hostname === "youtu.be"
  );
}

function isLikelyYouTubeVideoId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(value);
}

function isReservedYouTubePath(value) {
  return [
    "account",
    "clip",
    "creators",
    "feed",
    "gaming",
    "hashtag",
    "playlist",
    "results",
    "shorts",
    "watch",
    "youtube",
  ].includes(String(value || "").toLowerCase());
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  const text = String(value || "");
  if (!text) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function normalizeFollowerValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return parseCompactNumber(value);
  return "";
}

function parseCompactNumber(value) {
  const match = String(value || "")
    .trim()
    .match(/^([\d,.]+)\s*([KMB])?$/i);
  if (!match) return "";
  const base = Number((match[1] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(base)) return "";

  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[
    (match[2] || "").toUpperCase()
  ];
  return Math.round(base * (multiplier || 1));
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Billy collector failed.";
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
