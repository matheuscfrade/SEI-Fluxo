/**
 * Service worker — seed, permissões de host SEI e content scripts dinâmicos.
 */
importScripts(
  "../shared/sites.js"
);

const STORAGE_KEYS = {
  FLOWS: "seiFluxo_flows",
  REMOTE_FLOWS: "seiFluxo_remoteFlows",
  SETTINGS: "seiFluxo_settings",
  SEEDED: "seiFluxo_seeded"
};

const DEFAULT_SETTINGS = {
  sidebarOpen: true,
  sidebarWidth: 340,
  autoDetect: true,
  onlyOnSeiPages: true,
  seiSites: [],
  catalogSources: [],
  institutionName: ""
};

const CONTENT_SCRIPT_ID = "sei-fluxo-content";
const CONTENT_JS = [
  "shared/default-flows.js",
  "shared/sites.js",
  "shared/catalog.js",
  "shared/storage.js",
  "content/detector.js",
  "content/sidebar.js",
  "content/content.js"
];
const CONTENT_CSS = ["content/content.css"];

async function ensureSeeded() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.SEEDED,
    STORAGE_KEYS.FLOWS,
    STORAGE_KEYS.REMOTE_FLOWS,
    STORAGE_KEYS.SETTINGS
  ]);
  const updates = {};
  if (!data[STORAGE_KEYS.SEEDED] || !Array.isArray(data[STORAGE_KEYS.FLOWS])) {
    updates[STORAGE_KEYS.FLOWS] = [];
    updates[STORAGE_KEYS.SEEDED] = true;
  }
  if (!Array.isArray(data[STORAGE_KEYS.REMOTE_FLOWS])) {
    updates[STORAGE_KEYS.REMOTE_FLOWS] = [];
  }
  if (!data[STORAGE_KEYS.SETTINGS]) {
    updates[STORAGE_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS };
  } else {
    const prev = data[STORAGE_KEYS.SETTINGS] || {};
    updates[STORAGE_KEYS.SETTINGS] = {
      ...DEFAULT_SETTINGS,
      ...prev,
      seiSites: Array.isArray(prev.seiSites) ? prev.seiSites : []
    };
  }
  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }
}

async function getSeiSitesFromStorage() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
  const raw = settings.seiSites || [];
  return globalThis.SeiFluxoSites.parseSeiSites(raw);
}

/**
 * Remove content script registrado e, se houver matches + permissão, registra de novo.
 * @returns {{ ok: boolean, registered: boolean, patterns: string[], error?: string }}
 */
async function syncContentScripts() {
  const sites = await getSeiSitesFromStorage();
  const patterns = sites.map((s) => s.matchPattern);

  try {
    await chrome.scripting.unregisterContentScripts({
      ids: [CONTENT_SCRIPT_ID]
    }).catch(() => {
      /* ainda não registrado */
    });
  } catch (_) {
    /* ignore */
  }

  if (!patterns.length) {
    return { ok: true, registered: false, patterns: [] };
  }

  // Só registra padrões para os quais já há permissão
  const allowed = [];
  for (const p of patterns) {
    const has = await chrome.permissions.contains({ origins: [p] });
    if (has) allowed.push(p);
  }

  if (!allowed.length) {
    return {
      ok: true,
      registered: false,
      patterns,
      error:
        "Nenhuma permissão de host concedida para as URLs do SEI. Salve e autorize nas Opções."
    };
  }

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        matches: allowed,
        js: CONTENT_JS,
        css: CONTENT_CSS,
        runAt: "document_idle",
        allFrames: true,
        matchAboutBlank: true,
        persistAcrossSessions: true
      }
    ]);
  } catch (err) {
    return {
      ok: false,
      registered: false,
      patterns: allowed,
      error: err?.message || String(err)
    };
  }

  return { ok: true, registered: true, patterns: allowed };
}

/**
 * Injeta scripts nas abas já abertas que batem com os padrões (após ativar).
 */
async function injectIntoOpenTabs(patterns) {
  if (!patterns?.length) return { injected: 0 };
  let injected = 0;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (_) {
    return { injected: 0 };
  }

  for (const tab of tabs) {
    if (!tab?.id || !tab.url) continue;
    if (!/^https?:/i.test(tab.url)) continue;
    let matches = false;
    try {
      const u = new URL(tab.url);
      matches = patterns.some((pattern) => urlMatchesPattern(u, pattern));
    } catch (_) {
      continue;
    }
    if (!matches) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: CONTENT_JS
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id, allFrames: true },
        files: CONTENT_CSS
      });
      injected += 1;
    } catch (_) {
      /* aba restrita ou sem permissão */
    }
  }
  return { injected };
}

/**
 * Match simples para padrões https://host/* ou https://host/path/*
 */
function urlMatchesPattern(url, pattern) {
  // pattern: scheme://host/*  ou  scheme://host/prefix/*
  const m = String(pattern).match(/^(https?):\/\/([^/]+)(\/.*)$/i);
  if (!m) return false;
  const scheme = m[1].toLowerCase();
  const host = m[2].toLowerCase();
  let pathPat = m[3]; // includes leading /
  if (!pathPat.endsWith("*")) return false;
  const pathPrefix = pathPat.slice(0, -1); // e.g. "/" or "/sei/"

  if (url.protocol.replace(":", "").toLowerCase() !== scheme) return false;

  // host do pattern (pode incluir porta, ex.: localhost:8080)
  const urlHostWithPort =
    url.port && !((scheme === "http" && url.port === "80") || (scheme === "https" && url.port === "443"))
      ? `${url.hostname}:${url.port}`.toLowerCase()
      : url.hostname.toLowerCase();
  if (urlHostWithPort !== host && url.hostname.toLowerCase() !== host) {
    return false;
  }

  const path = url.pathname || "/";
  if (pathPrefix === "/") return true; // origin/*
  return path === pathPrefix.replace(/\/$/, "") || path.startsWith(pathPrefix);
}

async function getSitesStatus() {
  const sites = await getSeiSitesFromStorage();
  const patterns = sites.map((s) => s.matchPattern);
  const granted = [];
  const missing = [];
  for (const p of patterns) {
    const has = await chrome.permissions.contains({ origins: [p] });
    if (has) granted.push(p);
    else missing.push(p);
  }

  let registered = false;
  try {
    const list = await chrome.scripting.getRegisteredContentScripts({
      ids: [CONTENT_SCRIPT_ID]
    });
    registered = list.length > 0;
  } catch (_) {
    registered = false;
  }

  return {
    sites: sites.map((s) => s.baseUrl),
    patterns,
    granted,
    missing,
    registered,
    active: registered && granted.length > 0
  };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureSeeded();
  await syncContentScripts().catch(() => {});
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureSeeded();
  await syncContentScripts().catch(() => {});
});

chrome.permissions.onRemoved.addListener(() => {
  syncContentScripts().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SEI_FLUXO_PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }

  if (message?.type === "SEI_FLUXO_SYNC_CONTENT_SCRIPTS") {
    (async () => {
      await ensureSeeded();
      const result = await syncContentScripts();
      let injected = 0;
      if (result.registered && message.injectOpenTabs !== false) {
        const inj = await injectIntoOpenTabs(result.patterns);
        injected = inj.injected || 0;
      }
      const status = await getSitesStatus();
      sendResponse({ ...result, injected, status });
    })().catch((err) => {
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
    return true;
  }

  if (message?.type === "SEI_FLUXO_SITES_STATUS") {
    getSitesStatus()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  return false;
});

ensureSeeded()
  .then(() => syncContentScripts())
  .catch(() => {});
