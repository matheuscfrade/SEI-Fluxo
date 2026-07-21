/**
 * Armazenamento:
 * - FLOWS: rascunho do editor (montar e baixar JSON)
 * - REMOTE_FLOWS: união dos catálogos carregados (vários departamentos)
 * - SETTINGS.catalogSources: lista de arquivos { id, label, url }
 *
 * Conflito (mesmo tipo de processo em mais de um arquivo):
 * - Match apenas por nome exato do tipo.
 * - No SEI o usuário escolhe qual fluxo exibir (e pode alternar).
 * - A ordem da lista só define a opção pré-selecionada na 1ª vez.
 * Conflitos ficam em remoteMeta.conflicts para o administrador ver.
 */
(function (root) {
  const STORAGE_KEYS = {
    FLOWS: "seiFluxo_flows",
    REMOTE_FLOWS: "seiFluxo_remoteFlows",
    REMOTE_META: "seiFluxo_remoteMeta",
    SETTINGS: "seiFluxo_settings",
    SEEDED: "seiFluxo_seeded"
  };

  const DEFAULT_SETTINGS = {
    sidebarOpen: true,
    sidebarWidth: 340,
    autoDetect: true,
    highlightKeywords: true,
    onlyOnSeiPages: true,
    /** @type {{ id: string, label: string, url: string, kind?: 'file'|'folder'|'auto' }[]} */
    catalogSources: [],
    institutionName: "",
    /** Opcional: chave da API Google Drive (só leitura) para listar pastas com mais confiabilidade */
    driveApiKey: ""
  };

  function generateId(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  /**
   * Mantém entradas mesmo sem URL (rascunho da lista na UI).
   * Sync usa só as que tiverem url preenchida.
   */
  function normalizeSource(raw, index) {
    if (!raw || typeof raw !== "object") return null;
    const url = String(raw.url || "").trim();
    const label =
      String(raw.label || "").trim() || `Item ${index + 1}`;
    if (!url && !String(raw.label || "").trim() && !raw.id) return null;
    if (!url && !label) return null;

    let kind = raw.kind === "folder" || raw.kind === "file" ? raw.kind : "auto";
    if (kind === "auto" && url && root.SeiFluxoCatalog?.detectSourceKind) {
      kind = root.SeiFluxoCatalog.detectSourceKind(url);
    } else if (kind === "auto") {
      kind = /\/folders\//i.test(url) ? "folder" : "file";
    }

    return {
      id: String(raw.id || generateId("src")),
      label,
      url,
      kind
    };
  }

  /** Migra catalogUrl antigo → catalogSources[] */
  function normalizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
    delete s.useRemoteCatalog;

    let sources = Array.isArray(s.catalogSources)
      ? s.catalogSources
          .map((item, i) => normalizeSource(item, i))
          .filter(Boolean)
      : [];

    if (!sources.length && s.catalogUrl) {
      sources = [
        {
          id: generateId("src"),
          label: s.institutionName || "Instituição",
          url: String(s.catalogUrl).trim()
        }
      ];
    }

    s.catalogSources = sources;
    delete s.catalogUrl;
    return s;
  }

  async function ensureSeeded() {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.SEEDED,
      STORAGE_KEYS.FLOWS,
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.REMOTE_FLOWS
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
      updates[STORAGE_KEYS.SETTINGS] = normalizeSettings(data[STORAGE_KEYS.SETTINGS]);
    }

    if (Object.keys(updates).length) {
      await chrome.storage.local.set(updates);
    }
  }

  async function getLocalFlows() {
    await ensureSeeded();
    const { [STORAGE_KEYS.FLOWS]: flows } = await chrome.storage.local.get(
      STORAGE_KEYS.FLOWS
    );
    return Array.isArray(flows) ? flows : [];
  }

  async function getFlows() {
    return getLocalFlows();
  }

  async function saveFlows(flows) {
    await chrome.storage.local.set({ [STORAGE_KEYS.FLOWS]: flows });
    return flows;
  }

  async function getRemoteFlows() {
    await ensureSeeded();
    const { [STORAGE_KEYS.REMOTE_FLOWS]: flows } = await chrome.storage.local.get(
      STORAGE_KEYS.REMOTE_FLOWS
    );
    return Array.isArray(flows) ? flows : [];
  }

  async function getRemoteMeta() {
    const { [STORAGE_KEYS.REMOTE_META]: meta } = await chrome.storage.local.get(
      STORAGE_KEYS.REMOTE_META
    );
    return meta || null;
  }

  async function saveRemoteCatalog(flows, meta) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.REMOTE_FLOWS]: flows,
      [STORAGE_KEYS.REMOTE_META]: meta || null
    });
  }

  async function getSettings() {
    await ensureSeeded();
    const { [STORAGE_KEYS.SETTINGS]: settings } = await chrome.storage.local.get(
      STORAGE_KEYS.SETTINGS
    );
    return normalizeSettings(settings);
  }

  async function saveSettings(partial) {
    const current = await getSettings();
    let next = { ...current, ...partial };
    if (partial.catalogSources) {
      next.catalogSources = partial.catalogSources
        .map((item, i) => normalizeSource(item, i))
        .filter(Boolean);
    }
    next = normalizeSettings(next);
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
    return next;
  }

  async function getEffectiveFlows() {
    await ensureSeeded();
    return getRemoteFlows();
  }

  function normalize(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Chave de tipo = apenas o nome exato do processType (sem aliases).
   */
  function typeKeyOfFlow(flow) {
    return normalize(flow?.processType);
  }

  /**
   * Mescla fluxos de vários arquivos. Conflito = mesmo processType exato
   * em mais de um fluxo. No SEI o usuário escolhe qual exibir.
   */
  function mergeCatalogFlows(batches) {
    const all = [];
    const byTypeKey = new Map();

    batches.forEach((batch, sourcePriority) => {
      const label = batch.label || `Fonte ${sourcePriority + 1}`;
      const url = batch.url || "";
      (batch.flows || []).forEach((f) => {
        const flow = {
          ...f,
          aliases: undefined,
          _sourceLabel: label,
          _sourceUrl: url,
          _sourcePriority: sourcePriority
        };
        delete flow.aliases;
        if (flow.id) {
          flow.id = `${flow.id}__${sourcePriority}`;
        } else {
          flow.id = generateId("flow");
        }
        all.push(flow);
        const key = typeKeyOfFlow(flow);
        if (!key) return;
        if (!byTypeKey.has(key)) byTypeKey.set(key, []);
        byTypeKey.get(key).push({
          flow,
          sourcePriority,
          sourceLabel: label,
          processType: flow.processType
        });
      });
    });

    const conflicts = [];
    for (const [key, list] of byTypeKey.entries()) {
      const seen = new Set();
      const entries = [];
      for (const item of list) {
        if (seen.has(item.flow.id)) continue;
        seen.add(item.flow.id);
        entries.push({
          processType: item.processType,
          sourceLabel: item.sourceLabel,
          sourcePriority: item.sourcePriority,
          steps: (item.flow.steps || []).length,
          flowId: item.flow.id
        });
      }
      if (entries.length > 1) {
        entries.sort((a, b) => a.sourcePriority - b.sourcePriority);
        conflicts.push({
          typeKey: key,
          displayName: entries[0].processType,
          winnersRule:
            "No SEI o usuário escolhe e pode alternar entre os fluxos disponíveis.",
          entries
        });
      }
    }

    return { flows: all, conflicts };
  }

  /**
   * Match estrito: nome do tipo no SEI === processType do fluxo
   * (comparação normalizada: minúsculas, sem acento, espaços colapsados).
   */
  function isExactTypeMatch(flow, processType) {
    if (!processType || !flow || flow.active === false) return false;
    const a = normalize(processType);
    const b = normalize(flow.processType);
    return !!a && a === b;
  }

  /**
   * Lista todos os fluxos com o mesmo tipo exato; escolhe padrão por prioridade.
   * preferredFlowId: escolha salva do usuário (quando há conflito).
   * @returns {{ flow, candidates, alternatives, conflict }}
   */
  function resolveFlowForProcessType(flows, processType, preferredFlowId) {
    const active = (flows || []).filter((f) => f.active !== false);
    if (!processType || !active.length) {
      return {
        flow: null,
        candidates: [],
        alternatives: [],
        conflict: false
      };
    }

    const candidates = active
      .filter((f) => isExactTypeMatch(f, processType))
      .slice()
      .sort((a, b) => {
        const pa = typeof a._sourcePriority === "number" ? a._sourcePriority : 99;
        const pb = typeof b._sourcePriority === "number" ? b._sourcePriority : 99;
        if (pa !== pb) return pa - pb;
        const sa = (a.steps || []).length;
        const sb = (b.steps || []).length;
        if (sb !== sa) return sb - sa;
        return String(a.processType).localeCompare(String(b.processType), "pt-BR");
      });

    if (!candidates.length) {
      return {
        flow: null,
        candidates: [],
        alternatives: [],
        conflict: false
      };
    }

    let flow = candidates[0];
    if (preferredFlowId) {
      const chosen = candidates.find((c) => c.id === preferredFlowId);
      if (chosen) flow = chosen;
    }

    const alternatives = candidates.filter((c) => c.id !== flow.id);

    return {
      flow,
      candidates,
      alternatives,
      conflict: candidates.length > 1
    };
  }

  function findFlowForProcessType(flows, processType, preferredFlowId) {
    return resolveFlowForProcessType(flows, processType, preferredFlowId).flow;
  }

  const CHOICE_KEY = "seiFluxo_flowChoices";

  async function getFlowChoice(processType) {
    const key = normalize(processType);
    if (!key) return null;
    const data = await chrome.storage.local.get(CHOICE_KEY);
    const map = data[CHOICE_KEY] || {};
    return map[key] || null;
  }

  async function setFlowChoice(processType, flowId) {
    const key = normalize(processType);
    if (!key) return;
    const data = await chrome.storage.local.get(CHOICE_KEY);
    const map = { ...(data[CHOICE_KEY] || {}) };
    if (flowId) map[key] = flowId;
    else delete map[key];
    await chrome.storage.local.set({ [CHOICE_KEY]: map });
  }

  /**
   * Baixa todos os itens da lista (arquivos e/ou pastas) e mescla.
   */
  async function syncCatalog(optionalSources) {
    if (!root.SeiFluxoCatalog) {
      throw new Error("Módulo de catálogo não carregado.");
    }

    const settings = await getSettings();
    const rawList =
      optionalSources != null ? optionalSources : settings.catalogSources || [];
    const sources = rawList
      .map((item, i) => normalizeSource(item, i))
      .filter((s) => s && s.url);

    if (!sources.length) {
      throw new Error(
        "Informe o link do Google Drive em ao menos um item da lista (arquivo ou pasta)."
      );
    }

    const batches = [];
    const sourceResults = [];
    const errors = [];
    const apiKey = String(settings.driveApiKey || "").trim();

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const kind =
        src.kind === "folder" ||
        root.SeiFluxoCatalog.isDriveFolderUrl(src.url)
          ? "folder"
          : "file";

      if (kind === "folder") {
        try {
          const folderResult = await root.SeiFluxoCatalog.fetchCatalogsFromFolder(
            src.url,
            src.label || "",
            apiKey || null
          );
          for (const b of folderResult.batches) {
            batches.push(b);
          }
          for (const e of folderResult.errors || []) {
            errors.push({
              id: src.id,
              label: e.label || src.label,
              url: e.url || src.url,
              ok: false,
              error: e.error,
              kind: "folder-file"
            });
          }
          const flowCount = folderResult.batches.reduce(
            (n, b) => n + (b.flows || []).length,
            0
          );
          sourceResults.push({
            id: src.id,
            label: src.label || "Pasta",
            url: src.url,
            kind: "folder",
            ok: true,
            flowCount,
            filesLoaded: folderResult.batches.length,
            filesFound: folderResult.filesFound
          });
        } catch (err) {
          errors.push({
            id: src.id,
            label: src.label,
            url: src.url,
            kind: "folder",
            ok: false,
            error: err.message || String(err)
          });
          sourceResults.push({
            id: src.id,
            label: src.label,
            url: src.url,
            kind: "folder",
            ok: false,
            error: err.message || String(err),
            flowCount: 0
          });
        }
        continue;
      }

      // Arquivo único
      try {
        const result = await root.SeiFluxoCatalog.fetchCatalogFromUrl(src.url);
        const label =
          src.label ||
          result.catalog.institution ||
          `Departamento ${i + 1}`;
        batches.push({
          label,
          url: src.url,
          flows: result.catalog.flows
        });
        sourceResults.push({
          id: src.id,
          label,
          url: src.url,
          kind: "file",
          ok: true,
          flowCount: result.catalog.flows.length,
          institution: result.catalog.institution || ""
        });
      } catch (err) {
        errors.push({
          id: src.id,
          label: src.label,
          url: src.url,
          kind: "file",
          ok: false,
          error: err.message || String(err)
        });
        sourceResults.push({
          id: src.id,
          label: src.label,
          url: src.url,
          kind: "file",
          ok: false,
          error: err.message || String(err),
          flowCount: 0
        });
      }
    }

    if (!batches.length) {
      const msg = errors.map((e) => `${e.label}: ${e.error}`).join(" | ");
      throw new Error("Nenhum catálogo pôde ser carregado. " + msg);
    }

    const { flows, conflicts } = mergeCatalogFlows(batches);
    const meta = {
      fetchedAt: Date.now(),
      sourceCount: sources.length,
      loadedCount: batches.length,
      flowCount: flows.length,
      sources: sourceResults,
      conflicts,
      errors
    };

    await saveRemoteCatalog(flows, meta);
    await saveSettings({ catalogSources: sources });

    return { flows, meta, partial: errors.length > 0 };
  }

  root.SeiFluxoStorage = {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    ensureSeeded,
    getFlows,
    getLocalFlows,
    saveFlows,
    getRemoteFlows,
    getRemoteMeta,
    saveRemoteCatalog,
    getSettings,
    saveSettings,
    getEffectiveFlows,
    syncCatalog,
    mergeCatalogFlows,
    isExactTypeMatch,
    resolveFlowForProcessType,
    findFlowForProcessType,
    getFlowChoice,
    setFlowChoice,
    normalize,
    generateId
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
