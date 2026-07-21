/**
 * Armazenamento:
 * - FLOWS: rascunho do editor (montar e baixar JSON)
 * - REMOTE_FLOWS: união dos catálogos carregados (vários departamentos)
 * - SETTINGS.catalogSources: { id, kind, institution, department, url }
 *
 * Exibição no SEI: Instituição | Departamento | Nome do Fluxo
 * - Arquivo: instituição + departamento informados na fonte
 * - Pasta: instituição informada; departamento = nome do arquivo .json
 * - Nome do fluxo = flowName do JSON (ou processType, se flowName vazio)
 * - Match no SEI = processType (nome exato do Tipo)
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
    onlyOnSeiPages: true,
    /**
     * URLs raiz do SEI onde a extensão pode atuar (obrigatório).
     * Ex.: ["https://sei.instituicao.edu.br"]
     * @type {string[]}
     */
    seiSites: [],
    /**
     * @type {{
     *   id: string,
     *   kind?: 'file'|'folder'|'auto',
     *   institution?: string,
     *   department?: string,
     *   url: string
     * }[]}
     */
    catalogSources: [],
    institutionName: ""
  };

  function generateId(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  /** Junta partes não vazias com " | " → IFMG | RE-DDI | Nome do fluxo */
  function joinPathParts(...parts) {
    return parts
      .map((p) => String(p || "").trim())
      .filter(Boolean)
      .join(" | ");
  }

  function formatOriginLabel(institution, department) {
    return joinPathParts(institution, department);
  }

  function formatFlowPath(institution, department, flowTitle) {
    return joinPathParts(institution, department, flowTitle);
  }

  /** Título do fluxo na UI: nome específico ou tipo SEI */
  function flowDisplayName(flow) {
    if (root.SeiFluxoCatalog?.flowDisplayName) {
      return root.SeiFluxoCatalog.flowDisplayName(flow);
    }
    const specific = String(flow?.flowName || "").trim();
    if (specific) return specific;
    return String(flow?.processType || "").trim() || "Fluxo";
  }

  /**
   * Mantém entradas mesmo sem URL (rascunho da lista na UI).
   * Sync usa só as que tiverem url preenchida.
   *
   * Migração: campo antigo `label` vira
   * - pasta → institution
   * - arquivo → department
   */
  function normalizeSource(raw, index) {
    if (!raw || typeof raw !== "object") return null;
    const url = String(raw.url || "").trim();

    let kind = raw.kind === "folder" || raw.kind === "file" ? raw.kind : "auto";
    if (kind === "auto" && url && root.SeiFluxoCatalog?.detectSourceKind) {
      kind = root.SeiFluxoCatalog.detectSourceKind(url);
    } else if (kind === "auto") {
      kind = /\/folders\//i.test(url) ? "folder" : "file";
    }

    let institution = String(raw.institution || "").trim();
    let department = String(raw.department || "").trim();
    const legacyLabel = String(raw.label || "").trim();

    if (legacyLabel) {
      if (kind === "folder") {
        if (!institution) institution = legacyLabel;
      } else if (!department) {
        department = legacyLabel;
      }
    }

    const hasIdentity = !!(institution || department || legacyLabel || raw.id);
    if (!url && !hasIdentity) return null;

    if (!institution && kind === "folder") {
      institution = `Instituição ${index + 1}`;
    }
    if (!department && kind !== "folder") {
      department = `Departamento ${index + 1}`;
    }

    return {
      id: String(raw.id || generateId("src")),
      institution,
      department: kind === "folder" ? "" : department,
      url,
      kind
    };
  }

  /** Migra catalogUrl antigo → catalogSources[] e normaliza seiSites */
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
        normalizeSource(
          {
            id: generateId("src"),
            institution: s.institutionName || "Instituição",
            department: s.institutionName ? "" : "Departamento",
            url: String(s.catalogUrl).trim(),
            kind: "file"
          },
          0
        )
      ].filter(Boolean);
    }

    s.catalogSources = sources;
    delete s.catalogUrl;

    // URLs raiz do SEI (obrigatórias para content scripts)
    if (root.SeiFluxoSites?.baseUrlsFromSites) {
      s.seiSites = root.SeiFluxoSites.baseUrlsFromSites(s.seiSites || []);
    } else {
      s.seiSites = Array.isArray(s.seiSites)
        ? s.seiSites.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
    }

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
      const institution = String(batch.institution || "").trim();
      const department = String(batch.department || "").trim();
      const origin =
        formatOriginLabel(institution, department) ||
        batch.label ||
        `Fonte ${sourcePriority + 1}`;
      const url = batch.url || "";
      (batch.flows || []).forEach((f) => {
        const title = flowDisplayName(f);
        const flow = {
          ...f,
          aliases: undefined,
          _sourceInstitution: institution,
          _sourceDepartment: department,
          _sourceLabel: origin,
          _flowTitle: title,
          _displayPath: formatFlowPath(institution, department, title),
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
          sourceLabel: origin,
          displayPath: flow._displayPath,
          flowTitle: title,
          processType: flow.processType,
          flowName: flow.flowName || ""
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
          flowName: item.flowName,
          flowTitle: item.flowTitle,
          sourceLabel: item.sourceLabel,
          displayPath: item.displayPath,
          sourcePriority: item.sourcePriority,
          steps: (item.flow.steps || []).length,
          flowId: item.flow.id
        });
      }
      if (entries.length > 1) {
        entries.sort((a, b) => {
          if (a.sourcePriority !== b.sourcePriority) {
            return a.sourcePriority - b.sourcePriority;
          }
          return String(a.flowTitle || "").localeCompare(
            String(b.flowTitle || ""),
            "pt-BR"
          );
        });
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
        const ta = flowDisplayName(a);
        const tb = flowDisplayName(b);
        const byName = String(ta).localeCompare(String(tb), "pt-BR");
        if (byName) return byName;
        const sa = (a.steps || []).length;
        const sb = (b.steps || []).length;
        return sb - sa;
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

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const kind =
        src.kind === "folder" ||
        root.SeiFluxoCatalog.isDriveFolderUrl(src.url)
          ? "folder"
          : "file";

      if (kind === "folder") {
        const institution = src.institution || `Instituição ${i + 1}`;
        try {
          const folderResult = await root.SeiFluxoCatalog.fetchCatalogsFromFolder(
            src.url,
            institution
          );
          for (const b of folderResult.batches) {
            batches.push(b);
          }
          for (const e of folderResult.errors || []) {
            errors.push({
              id: src.id,
              label: e.label || formatOriginLabel(institution, e.department),
              institution,
              department: e.department || "",
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
            label: institution,
            institution,
            department: "",
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
            label: institution,
            institution,
            url: src.url,
            kind: "folder",
            ok: false,
            error: err.message || String(err)
          });
          sourceResults.push({
            id: src.id,
            label: institution,
            institution,
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
      const institution = src.institution || "";
      const department =
        src.department ||
        `Departamento ${i + 1}`;
      const origin = formatOriginLabel(institution, department) || department;
      try {
        const result = await root.SeiFluxoCatalog.fetchCatalogFromUrl(src.url);
        batches.push({
          institution,
          department,
          label: origin,
          url: src.url,
          flows: result.catalog.flows
        });
        sourceResults.push({
          id: src.id,
          label: origin,
          institution,
          department,
          url: src.url,
          kind: "file",
          ok: true,
          flowCount: result.catalog.flows.length
        });
      } catch (err) {
        errors.push({
          id: src.id,
          label: origin,
          institution,
          department,
          url: src.url,
          kind: "file",
          ok: false,
          error: err.message || String(err)
        });
        sourceResults.push({
          id: src.id,
          label: origin,
          institution,
          department,
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
    joinPathParts,
    formatOriginLabel,
    formatFlowPath,
    flowDisplayName,
    normalize,
    generateId
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
