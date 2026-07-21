/**
 * Service worker — seed, permissões de host SEI e content scripts dinâmicos.
 */
importScripts("../shared/sites.js");

const STORAGE_KEYS = {
  FLOWS: "seiFluxo_flows",
  REMOTE_FLOWS: "seiFluxo_remoteFlows",
  SETTINGS: "seiFluxo_settings",
  SEEDED: "seiFluxo_seeded",
  LAST_REGISTER_ERROR: "seiFluxo_lastRegisterError"
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

/** Caminhos relativos à raiz da extensão (sem ../). */
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

async function setLastRegisterError(msg) {
  if (msg) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_REGISTER_ERROR]: String(msg)
    });
  } else {
    await chrome.storage.local.remove(STORAGE_KEYS.LAST_REGISTER_ERROR);
  }
}

async function getLastRegisterError() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.LAST_REGISTER_ERROR);
  return data[STORAGE_KEYS.LAST_REGISTER_ERROR] || null;
}

async function getSeiSitesFromStorage() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
  const raw = settings.seiSites || [];
  if (!globalThis.SeiFluxoSites?.parseSeiSites) {
    throw new Error("Módulo shared/sites.js não carregou no service worker.");
  }
  return globalThis.SeiFluxoSites.parseSeiSites(raw);
}

async function unregisterOurScripts() {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const ours = (existing || []).filter(
      (s) => s.id === CONTENT_SCRIPT_ID || String(s.id || "").startsWith("sei-fluxo")
    );
    if (ours.length) {
      await chrome.scripting.unregisterContentScripts({
        ids: ours.map((s) => s.id)
      });
    }
  } catch (_) {
    try {
      await chrome.scripting.unregisterContentScripts({
        ids: [CONTENT_SCRIPT_ID]
      });
    } catch (_) {
      /* ainda não registrado */
    }
  }
}

/**
 * Registra com o menor conjunto de propriedades (máxima compatibilidade).
 * Tenta matchOriginAsFallback só se o Chrome aceitar.
 */
async function registerWithBestEffort(matches) {
  const base = {
    id: CONTENT_SCRIPT_ID,
    matches,
    js: CONTENT_JS,
    css: CONTENT_CSS,
    runAt: "document_idle",
    allFrames: true,
    persistAcrossSessions: true
  };

  // 1) Tentativa completa (Chrome 119+)
  try {
    await chrome.scripting.registerContentScripts([
      { ...base, matchOriginAsFallback: true }
    ]);
    return { ok: true, mode: "matchOriginAsFallback" };
  } catch (err1) {
    // 2) Sem matchOriginAsFallback (versões/APIs mais restritas)
    try {
      await unregisterOurScripts();
      await chrome.scripting.registerContentScripts([base]);
      return {
        ok: true,
        mode: "basic",
        warning: err1?.message || String(err1)
      };
    } catch (err2) {
      return {
        ok: false,
        error: err2?.message || String(err2),
        firstError: err1?.message || String(err1)
      };
    }
  }
}

/**
 * @returns {{ ok: boolean, registered: boolean, patterns: string[], error?: string, mode?: string }}
 */
async function syncContentScripts() {
  const sites = await getSeiSitesFromStorage();
  const patterns = sites.map((s) => s.matchPattern);

  await unregisterOurScripts();

  if (!patterns.length) {
    await setLastRegisterError(null);
    return { ok: true, registered: false, patterns: [] };
  }

  const allowed = [];
  for (const p of patterns) {
    try {
      const has = await chrome.permissions.contains({ origins: [p] });
      if (has) allowed.push(p);
    } catch (_) {
      /* ignore single pattern */
    }
  }

  if (!allowed.length) {
    const msg =
      "Permissão de host ainda não concedida para: " + patterns.join(", ");
    await setLastRegisterError(msg);
    return {
      ok: true,
      registered: false,
      patterns,
      error: msg
    };
  }

  const result = await registerWithBestEffort(allowed);
  if (!result.ok) {
    const msg = result.error || "Falha ao registrar content scripts.";
    await setLastRegisterError(msg);
    return {
      ok: false,
      registered: false,
      patterns: allowed,
      error: msg
    };
  }

  // Confirma se realmente ficou registrado
  let registered = false;
  try {
    const list = await chrome.scripting.getRegisteredContentScripts({
      ids: [CONTENT_SCRIPT_ID]
    });
    registered = Array.isArray(list) && list.length > 0;
  } catch (_) {
    registered = false;
  }

  if (!registered) {
    const msg =
      "registerContentScripts não reportou erro, mas o script não aparece como registrado.";
    await setLastRegisterError(msg);
    return { ok: false, registered: false, patterns: allowed, error: msg };
  }

  await setLastRegisterError(null);
  return {
    ok: true,
    registered: true,
    patterns: allowed,
    mode: result.mode
  };
}

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

function urlMatchesPattern(url, pattern) {
  const m = String(pattern).match(/^(https?):\/\/([^/]+)(\/.*)$/i);
  if (!m) return false;
  const scheme = m[1].toLowerCase();
  const host = m[2].toLowerCase();
  let pathPat = m[3];
  if (!pathPat.endsWith("*")) return false;
  const pathPrefix = pathPat.slice(0, -1);

  if (url.protocol.replace(":", "").toLowerCase() !== scheme) return false;

  const urlHostWithPort =
    url.port &&
    !(
      (scheme === "http" && url.port === "80") ||
      (scheme === "https" && url.port === "443")
    )
      ? `${url.hostname}:${url.port}`.toLowerCase()
      : url.hostname.toLowerCase();
  if (urlHostWithPort !== host && url.hostname.toLowerCase() !== host) {
    return false;
  }

  const path = url.pathname || "/";
  if (pathPrefix === "/") return true;
  return path === pathPrefix.replace(/\/$/, "") || path.startsWith(pathPrefix);
}

async function getSitesStatus() {
  const sites = await getSeiSitesFromStorage();
  const patterns = sites.map((s) => s.matchPattern);
  const granted = [];
  const missing = [];
  for (const p of patterns) {
    try {
      const has = await chrome.permissions.contains({ origins: [p] });
      if (has) granted.push(p);
      else missing.push(p);
    } catch (_) {
      missing.push(p);
    }
  }

  let registered = false;
  let registeredMatches = [];
  try {
    const list = await chrome.scripting.getRegisteredContentScripts({
      ids: [CONTENT_SCRIPT_ID]
    });
    registered = Array.isArray(list) && list.length > 0;
    if (registered) {
      registeredMatches = list[0].matches || [];
    }
  } catch (_) {
    registered = false;
  }

  const lastError = await getLastRegisterError();

  return {
    sites: sites.map((s) => s.baseUrl),
    patterns,
    granted,
    missing,
    registered,
    registeredMatches,
    lastError,
    active: registered && granted.length > 0 && missing.length === 0
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

// Se o usuário conceder permissão por outro caminho, tenta registrar
chrome.permissions.onAdded.addListener(() => {
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
