/**
 * Service worker — seed vazio + mensagens.
 */

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
  highlightKeywords: true,
  onlyOnSeiPages: true,
  catalogSources: [],
  institutionName: "",
  driveApiKey: ""
};

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
    updates[STORAGE_KEYS.SETTINGS] = {
      ...DEFAULT_SETTINGS,
      ...data[STORAGE_KEYS.SETTINGS]
    };
  }
  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureSeeded();
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureSeeded();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SEI_FLUXO_PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }
  if (message?.type === "SEI_FLUXO_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

ensureSeeded().catch(() => {});
