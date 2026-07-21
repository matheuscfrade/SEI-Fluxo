/**
 * Catálogo multi-arquivo + editor para baixar JSON.
 */
(function () {
  const $ = (sel) => document.querySelector(sel);

  let flows = [];
  let selectedId = null;
  let draftSteps = [];
  /** @type {{ id: string, kind?: string, institution?: string, department?: string, url: string }[]} */
  let catalogSources = [];

  const els = {
    list: $("#flowList"),
    search: $("#search"),
    empty: $("#emptyState"),
    editor: $("#editor"),
    editorTitle: $("#editorTitle"),
    fldActive: $("#fldActive"),
    fldProcessType: $("#fldProcessType"),
    fldFlowName: $("#fldFlowName"),
    fldDescription: $("#fldDescription"),
    stepsList: $("#stepsList"),
    btnNew: $("#btnNew"),
    btnAddStep: $("#btnAddStep"),
    btnDelete: $("#btnDelete"),
    btnCancel: $("#btnCancel"),
    btnExport: $("#btnExport"),
    fileImport: $("#fileImport"),
    version: $("#version"),
    toast: $("#toast"),
    fldSeiSites: $("#fldSeiSites"),
    btnSaveSeiSites: $("#btnSaveSeiSites"),
    stSeiSites: $("#stSeiSites"),
    stSeiPerm: $("#stSeiPerm"),
    stSeiActive: $("#stSeiActive"),
    sourcesList: $("#sourcesList"),
    btnAddSource: $("#btnAddSource"),
    btnAddFolder: $("#btnAddFolder"),
    btnSync: $("#btnSync"),
    stCatalog: $("#stCatalog"),
    stSourceCount: $("#stSourceCount"),
    stRemoteCount: $("#stRemoteCount"),
    stLastSync: $("#stLastSync"),
    stConflicts: $("#stConflicts"),
    remoteList: $("#remoteList"),
    conflictsCard: $("#conflictsCard"),
    conflictsList: $("#conflictsList")
  };

  const DRIVE_ORIGIN_RE =
    /drive\.google\.com|docs\.google\.com|googleusercontent\.com/i;

  function toast(msg, type = "ok") {
    els.toast.textContent = msg;
    els.toast.className = `toast ${type}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.add("hidden"), 3500);
  }

  function formatWhen(ts) {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString("pt-BR");
    } catch (_) {
      return "—";
    }
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.getAttribute("data-tab") === name);
    });
    ["catalog", "editor"].forEach((id) => {
      const panel = document.getElementById(`panel-${id}`);
      if (panel) panel.classList.toggle("hidden", id !== name);
    });
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.getAttribute("data-tab")));
  });

  /* ---------- Sites SEI (obrigatório) ---------- */

  function readSeiSitesFromDom() {
    const text = els.fldSeiSites?.value || "";
    return SeiFluxoSites.parseSeiSites(text);
  }

  async function refreshSeiSitesStatus(opts = {}) {
    const settings = await SeiFluxoStorage.getSettings();
    const sites = SeiFluxoSites.parseSeiSites(settings.seiSites || []);
    if (els.fldSeiSites && document.activeElement !== els.fldSeiSites) {
      els.fldSeiSites.value = sites.map((s) => s.baseUrl).join("\n");
    }

    let status = null;
    try {
      const res = await chrome.runtime.sendMessage({
        type: "SEI_FLUXO_SITES_STATUS"
      });
      status = res?.status || null;
    } catch (_) {
      status = null;
    }

    // Permissão ok, mas script ainda não registrado → tenta de novo em silêncio
    if (
      opts.autoRepair !== false &&
      status &&
      status.granted?.length &&
      !status.registered &&
      status.sites?.length
    ) {
      try {
        const fix = await chrome.runtime.sendMessage({
          type: "SEI_FLUXO_SYNC_CONTENT_SCRIPTS",
          injectOpenTabs: false
        });
        status = fix?.status || status;
        if (fix?.error && !fix?.registered) {
          status = { ...status, lastError: fix.error, registered: false };
        }
      } catch (_) {
        /* ignore */
      }
    }

    const list = status?.sites?.length
      ? status.sites
      : sites.map((s) => s.baseUrl);

    if (els.stSeiSites) {
      if (!list.length) {
        els.stSeiSites.textContent = "nenhum — informe a URL raiz";
        els.stSeiSites.className = "warn";
      } else {
        els.stSeiSites.textContent = list.join(" · ");
        els.stSeiSites.className = "ok";
      }
    }

    if (els.stSeiPerm) {
      if (!list.length) {
        els.stSeiPerm.textContent = "—";
        els.stSeiPerm.className = "";
      } else if (status?.missing?.length) {
        els.stSeiPerm.textContent = "pendente — clique em Salvar e autorizar";
        els.stSeiPerm.className = "warn";
      } else if (status?.granted?.length) {
        els.stSeiPerm.textContent = "concedida";
        els.stSeiPerm.className = "ok";
      } else {
        els.stSeiPerm.textContent = "desconhecida";
        els.stSeiPerm.className = "warn";
      }
    }

    if (els.stSeiActive) {
      if (status?.active) {
        els.stSeiActive.textContent = "ativa nestes sites";
        els.stSeiActive.className = "ok";
      } else if (!list.length) {
        els.stSeiActive.textContent = "inativa";
        els.stSeiActive.className = "warn";
      } else if (status?.missing?.length) {
        els.stSeiActive.textContent = "inativa — autorize o acesso no Chrome";
        els.stSeiActive.className = "warn";
      } else if (status?.granted?.length && !status?.registered) {
        const detail = status.lastError
          ? `inativa — falha ao registrar: ${status.lastError}`
          : "inativa — permissão ok, mas script não registrado (clique em Salvar de novo)";
        els.stSeiActive.textContent = detail;
        els.stSeiActive.className = "bad";
      } else {
        els.stSeiActive.textContent = "inativa";
        els.stSeiActive.className = "warn";
      }
    }

    return status;
  }

  /**
   * Revoga permissões de host SEI antigas que não estão mais na lista
   * (não mexe no Drive).
   */
  async function reconcileHostPermissions(newPatterns) {
    let all;
    try {
      all = await chrome.permissions.getAll();
    } catch (_) {
      return;
    }
    const current = (all.origins || []).filter((o) => !DRIVE_ORIGIN_RE.test(o));
    const keep = new Set(newPatterns);
    const toRemove = current.filter((o) => !keep.has(o));
    if (toRemove.length) {
      try {
        await chrome.permissions.remove({ origins: toRemove });
      } catch (_) {
        /* ignore */
      }
    }
  }

  async function saveAndActivateSeiSites() {
    const sites = readSeiSitesFromDom();
    if (!sites.length) {
      const raw = String(els.fldSeiSites?.value || "").trim();
      if (raw) {
        toast(
          "URL inválida. Use algo como https://sei.sua-instituicao.gov.br",
          "err"
        );
      } else {
        toast("Informe ao menos uma URL raiz do SEI.", "err");
      }
      // limpa sites e desativa scripts
      await SeiFluxoStorage.saveSettings({ seiSites: [] });
      await reconcileHostPermissions([]);
      await chrome.runtime.sendMessage({
        type: "SEI_FLUXO_SYNC_CONTENT_SCRIPTS",
        injectOpenTabs: false
      });
      await refreshSeiSitesStatus();
      return;
    }

    const baseUrls = sites.map((s) => s.baseUrl);
    const patterns = sites.map((s) => s.matchPattern);

    await SeiFluxoStorage.saveSettings({ seiSites: baseUrls });
    await reconcileHostPermissions(patterns);

    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: patterns });
    } catch (err) {
      toast("Falha ao solicitar permissão: " + (err.message || err), "err");
      await refreshSeiSitesStatus();
      return;
    }

    if (!granted) {
      toast(
        "Permissão negada. Sem ela a barra lateral não aparece no SEI.",
        "err"
      );
      await chrome.runtime.sendMessage({
        type: "SEI_FLUXO_SYNC_CONTENT_SCRIPTS",
        injectOpenTabs: false
      });
      await refreshSeiSitesStatus();
      return;
    }

    const res = await chrome.runtime.sendMessage({
      type: "SEI_FLUXO_SYNC_CONTENT_SCRIPTS",
      injectOpenTabs: true
    });

    await refreshSeiSitesStatus({ autoRepair: false });

    if (res?.registered || res?.status?.active) {
      const n = sites.length;
      const inj =
        res.injected > 0
          ? ` Abas SEI abertas atualizadas (${res.injected}).`
          : " Recarregue a aba do SEI (F5) se a barra não aparecer.";
      toast(
        `${n} site${n === 1 ? "" : "s"} ativo${n === 1 ? "" : "s"}. A extensão atuará apenas neles.${inj}`
      );
      return;
    }

    const detail =
      res?.error ||
      res?.status?.lastError ||
      "script não registrado (recarregue a extensão em chrome://extensions e tente de novo)";
    toast("Permissão ok, mas falhou ao ativar: " + detail, "err");
  }

  /* ---------- Fontes (arquivo / pasta) ---------- */
  // Exibição no SEI: Instituição | Departamento | Nome do Fluxo

  function resolveKind(kind, url) {
    if (/\/folders\//i.test(String(url || ""))) return "folder";
    return kind === "folder" ? "folder" : "file";
  }

  function applyKindUi(row, kind) {
    const isFolder = kind === "folder";
    const deptWrap = row.querySelector("[data-dept-wrap]");
    const instEl = row.querySelector('[data-k="institution"]');
    const deptEl = row.querySelector('[data-k="department"]');
    const urlEl = row.querySelector('[data-k="url"]');
    const hintEl = row.querySelector("[data-folder-hint]");
    if (deptWrap) deptWrap.classList.toggle("hidden", isFolder);
    if (hintEl) hintEl.classList.toggle("hidden", !isFolder);
    if (instEl) instEl.placeholder = "Instituição (ex.: IFMG)";
    if (deptEl) deptEl.placeholder = "Departamento (ex.: RE-DDI)";
    if (urlEl) {
      urlEl.placeholder = isFolder
        ? "https://drive.google.com/drive/folders/…"
        : "https://drive.google.com/file/d/…/view";
    }
  }

  function readSourceFromRow(row, index, prev) {
    const instInput = row.querySelector("[data-k='institution']");
    const deptInput = row.querySelector("[data-k='department']");
    const urlInput = row.querySelector("[data-k='url']");
    const kindSelect = row.querySelector("[data-k='kind']");
    const url = String(urlInput?.value || "").trim();
    const kind = resolveKind(kindSelect?.value || prev?.kind || "file", url);
    return {
      id: prev?.id || row.dataset.sourceId || SeiFluxoStorage.generateId("src"),
      institution: String(instInput?.value || "").trim(),
      department: kind === "folder" ? "" : String(deptInput?.value || "").trim(),
      url,
      kind
    };
  }

  function collectSourcesFromDom() {
    const rows = els.sourcesList?.querySelectorAll(".source-row");
    if (!rows || !rows.length) {
      return (catalogSources || []).map((s, i) => ({
        id: s.id || SeiFluxoStorage.generateId("src"),
        institution: String(s.institution || "").trim(),
        department: s.kind === "folder" ? "" : String(s.department || "").trim(),
        url: String(s.url || "").trim(),
        kind: resolveKind(s.kind, s.url)
      }));
    }

    const list = [];
    rows.forEach((row, index) => {
      list.push(readSourceFromRow(row, index, catalogSources[index]));
    });
    catalogSources = list;
    return list;
  }

  function renderSources() {
    if (!els.sourcesList) return;
    els.sourcesList.innerHTML = "";
    if (!catalogSources.length) {
      els.sourcesList.innerHTML =
        '<p class="muted">Nenhuma fonte. Use “+ Arquivo JSON” ou “+ Pasta do Drive”.</p>';
      return;
    }

    catalogSources.forEach((src, index) => {
      const kind = src.kind === "folder" ? "folder" : "file";
      const row = document.createElement("div");
      row.className = "source-row";
      row.dataset.sourceId = src.id || "";
      row.innerHTML = `
        <div class="source-priority" title="Ordem na lista">${index + 1}</div>
        <div class="source-fields">
          <div class="source-kind-row">
            <select data-k="kind" title="Tipo de link" aria-label="Tipo de link">
              <option value="file">Arquivo</option>
              <option value="folder">Pasta</option>
            </select>
            <input type="text" data-k="institution" placeholder="Instituição (ex.: IFMG)" autocomplete="organization" />
          </div>
          <div class="source-meta-row" data-dept-wrap>
            <input type="text" data-k="department" placeholder="Departamento (ex.: RE-DDI)" autocomplete="off" />
          </div>
          <p class="source-folder-hint hidden" data-folder-hint>
            Departamento = nome de cada <code>.json</code> na pasta (ex.: <code>RE-DDI.json</code> → RE-DDI)
          </p>
          <input type="text" data-k="url" placeholder="Link do Drive" autocomplete="off" spellcheck="false" />
        </div>
        <div class="source-actions">
          <button type="button" class="icon-btn" data-act="up" title="Mover para cima">↑</button>
          <button type="button" class="icon-btn" data-act="down" title="Mover para baixo">↓</button>
          <button type="button" class="icon-btn danger" data-act="del" title="Remover">✕</button>
        </div>
      `;
      const kindEl = row.querySelector('[data-k="kind"]');
      const instEl = row.querySelector('[data-k="institution"]');
      const deptEl = row.querySelector('[data-k="department"]');
      const urlEl = row.querySelector('[data-k="url"]');
      kindEl.value = kind;
      instEl.value = src.institution || "";
      deptEl.value = src.department || "";
      urlEl.value = src.url || "";
      applyKindUi(row, kind);

      const syncMemory = () => {
        const next = readSourceFromRow(row, index, src);
        Object.assign(src, next);
        applyKindUi(row, next.kind);
        if (kindEl.value !== next.kind) kindEl.value = next.kind;
      };

      kindEl.addEventListener("change", () => {
        syncMemory();
        if (/\/folders\//i.test(src.url)) {
          src.kind = "folder";
          kindEl.value = "folder";
          applyKindUi(row, "folder");
        }
        persistSources();
      });

      instEl.addEventListener("input", () => {
        src.institution = instEl.value;
      });
      instEl.addEventListener("change", () => {
        syncMemory();
        persistSources();
      });

      deptEl.addEventListener("input", () => {
        src.department = deptEl.value;
      });
      deptEl.addEventListener("change", () => {
        syncMemory();
        persistSources();
      });

      urlEl.addEventListener("input", () => {
        src.url = urlEl.value;
        if (/\/folders\//i.test(src.url) && kindEl.value !== "folder") {
          kindEl.value = "folder";
          src.kind = "folder";
          applyKindUi(row, "folder");
        }
      });
      urlEl.addEventListener("change", () => {
        syncMemory();
        persistSources();
      });

      row.querySelector('[data-act="up"]').addEventListener("click", () => {
        collectSourcesFromDom();
        if (index === 0) return;
        [catalogSources[index - 1], catalogSources[index]] = [
          catalogSources[index],
          catalogSources[index - 1]
        ];
        renderSources();
        persistSources();
      });
      row.querySelector('[data-act="down"]').addEventListener("click", () => {
        collectSourcesFromDom();
        if (index >= catalogSources.length - 1) return;
        [catalogSources[index + 1], catalogSources[index]] = [
          catalogSources[index],
          catalogSources[index + 1]
        ];
        renderSources();
        persistSources();
      });
      row.querySelector('[data-act="del"]').addEventListener("click", () => {
        collectSourcesFromDom();
        catalogSources.splice(index, 1);
        renderSources();
        persistSources();
      });

      els.sourcesList.appendChild(row);
    });
  }

  async function persistSources() {
    collectSourcesFromDom();
    catalogSources = catalogSources
      .map((s, i) => ({
        id: s.id || SeiFluxoStorage.generateId("src"),
        institution: String(s.institution || "").trim(),
        department:
          resolveKind(s.kind, s.url) === "folder"
            ? ""
            : String(s.department || "").trim(),
        url: String(s.url || "").trim(),
        kind: resolveKind(s.kind, s.url)
      }))
      .filter((s) => s.url || s.institution || s.department);

    await SeiFluxoStorage.saveSettings({
      catalogSources
    });
    return catalogSources;
  }

  function addSource(kind) {
    collectSourcesFromDom();
    const isFolder = kind === "folder";
    catalogSources.push({
      id: SeiFluxoStorage.generateId("src"),
      institution: "",
      department: isFolder ? "" : "",
      url: "",
      kind: isFolder ? "folder" : "file"
    });
    renderSources();
    persistSources();
    const rows = els.sourcesList.querySelectorAll(".source-row");
    const last = rows[rows.length - 1];
    last?.querySelector('[data-k="institution"]')?.focus();
  }

  async function refreshCatalogStatus(opts = {}) {
    const settings = await SeiFluxoStorage.getSettings();
    const remote = await SeiFluxoStorage.getRemoteFlows();
    const meta = await SeiFluxoStorage.getRemoteMeta();

    // Não sobrescreve o que o usuário está digitando na tela
    if (!opts.keepDom) {
      catalogSources = (settings.catalogSources || []).map((s) => ({ ...s }));
      if (!catalogSources.length) catalogSources = [];
      renderSources();
    }

    const nSrc = (settings.catalogSources || []).filter((s) => s.url).length;
    els.stSourceCount.textContent = String(nSrc);
    els.stRemoteCount.textContent = String(remote.length);
    els.stLastSync.textContent = formatWhen(meta?.fetchedAt);
    const confCount = (meta?.conflicts || []).length;
    els.stConflicts.textContent = String(confCount);
    els.stConflicts.className = confCount ? "warn" : "ok";

    if (!nSrc) {
      els.stCatalog.textContent = "Aguardando arquivos";
      els.stCatalog.className = "warn";
    } else if (!remote.length) {
      els.stCatalog.textContent = "Links salvos — clique em Carregar todos";
      els.stCatalog.className = "warn";
    } else if (meta?.partial || (meta?.errors || []).length) {
      els.stCatalog.textContent = "Carregado com avisos (alguns arquivos falharam)";
      els.stCatalog.className = "warn";
    } else {
      els.stCatalog.textContent = "Pronto para usar no SEI";
      els.stCatalog.className = "ok";
    }

    // Conflitos
    const conflicts = meta?.conflicts || [];
    if (conflicts.length) {
      els.conflictsCard.classList.remove("hidden");
      els.conflictsList.innerHTML = "";
      conflicts.forEach((c) => {
        const div = document.createElement("div");
        div.className = "conflict-item";
        const lines = (c.entries || [])
          .map((e) => {
            const path =
              e.displayPath ||
              [
                e.sourceLabel,
                e.flowTitle || e.flowName || e.processType
              ]
                .filter(Boolean)
                .join(" | ") ||
              e.processType;
            return `• ${path} (${e.steps} etapa${e.steps === 1 ? "" : "s"})`;
          })
          .join("<br>");
        div.innerHTML = `<strong></strong><div class="conflict-detail"></div>`;
        div.querySelector("strong").textContent =
          c.displayName || c.typeKey || "Tipo em conflito";
        div.querySelector(".conflict-detail").innerHTML =
          lines +
          '<br><span style="opacity:.85">No SEI o usuário escolhe qual exibir.</span>';
        els.conflictsList.appendChild(div);
      });
    } else {
      els.conflictsCard.classList.add("hidden");
      els.conflictsList.innerHTML = "";
    }

    // Lista de fluxos
    els.remoteList.innerHTML = "";
    if (!remote.length) {
      els.remoteList.innerHTML =
        '<p class="muted">Nenhum fluxo carregado ainda.</p>';
      return;
    }
    remote
      .slice()
      .sort((a, b) =>
        String(a._displayPath || a.processType).localeCompare(
          String(b._displayPath || b.processType),
          "pt-BR"
        )
      )
      .forEach((f) => {
        const div = document.createElement("div");
        div.className = "remote-item";
        const n = (f.steps || []).length;
        const path =
          f._displayPath ||
          [f._sourceLabel, f.processType].filter(Boolean).join(" | ") ||
          f.processType;
        div.innerHTML = "<strong></strong><span></span>";
        div.querySelector("strong").textContent = path;
        div.querySelector("span").textContent = `${n} etapa(s)${
          f.active === false ? " · inativo" : ""
        }`;
        els.remoteList.appendChild(div);
      });
  }

  async function syncCatalog() {
    try {
      // Sempre relê os inputs da tela antes de validar/salvar
      const sources = await persistSources();
      const valid = sources.filter((s) => String(s.url || "").trim());
      if (!valid.length) {
        toast(
          "Cole o link do Google Drive em cada fonte (além de instituição/departamento).",
          "err"
        );
        return;
      }
      els.btnSync.disabled = true;
      els.btnSync.textContent = "Carregando…";
      const { flows: remote, meta, partial } = await SeiFluxoStorage.syncCatalog(
        sources
      );
      const conf = (meta?.conflicts || []).length;
      let msg = `${remote.length} fluxo(s) de ${meta.loadedCount} catálogo(s).`;
      if (conf) msg += ` ${conf} conflito(s) de tipo.`;
      if (partial) msg += " Alguns itens falharam.";
      toast(msg, conf || partial ? "err" : "ok");
      await refreshCatalogStatus({ keepDom: false });
    } catch (err) {
      console.error(err);
      toast(err.message || String(err), "err");
      await refreshCatalogStatus({ keepDom: false });
    } finally {
      els.btnSync.disabled = false;
      els.btnSync.textContent = "Carregar todos os fluxos";
    }
  }

  /* ---------- Editor (igual, simplificado) ---------- */
  function normalizeSearch(s) {
    return SeiFluxoStorage.normalize(s);
  }

  async function loadEditor() {
    flows = await SeiFluxoStorage.getLocalFlows();
    renderList();
    if (selectedId) {
      const still = flows.find((f) => f.id === selectedId);
      if (still) openEditor(still);
      else closeEditor();
    }
  }

  function renderList() {
    if (!els.list) return;
    const q = normalizeSearch(els.search?.value || "");
    const filtered = flows
      .slice()
      .sort((a, b) =>
        String(a.processType).localeCompare(String(b.processType), "pt-BR")
      )
      .filter((f) => {
        if (!q) return true;
        return normalizeSearch(
          [f.processType, f.flowName, f.description].join(" ")
        ).includes(q);
      });

    els.list.innerHTML = "";
    if (!filtered.length) {
      els.list.innerHTML =
        '<div style="padding:16px;color:#64748b;font-size:0.875rem">Nenhum fluxo. Clique em + Novo fluxo.</div>';
      return;
    }

    for (const flow of filtered) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `flow-item ${flow.id === selectedId ? "active" : ""} ${
        flow.active === false ? "inactive" : ""
      }`;
      const stepsCount = (flow.steps || []).length;
      const title =
        (SeiFluxoCatalog.flowDisplayName &&
          SeiFluxoCatalog.flowDisplayName(flow)) ||
        flow.flowName ||
        flow.processType;
      const metaParts = [];
      if (flow.flowName && flow.flowName !== flow.processType) {
        metaParts.push(flow.processType);
      }
      metaParts.push(`${stepsCount} etapa(s)`);
      btn.innerHTML = `
        <span class="flow-item-title"></span>
        <span class="flow-item-meta"></span>
        <span class="pill ${flow.active === false ? "off" : "on"}"></span>
      `;
      btn.querySelector(".flow-item-title").textContent = title;
      btn.querySelector(".flow-item-meta").textContent = metaParts.join(" · ");
      btn.querySelector(".pill").textContent =
        flow.active === false ? "Inativo" : "Ativo";
      btn.addEventListener("click", () => openEditor(flow));
      els.list.appendChild(btn);
    }
  }

  function closeEditor() {
    selectedId = null;
    draftSteps = [];
    els.editor.classList.add("hidden");
    els.empty.classList.remove("hidden");
    renderList();
  }

  function openEditor(flow) {
    selectedId = flow.id;
    els.empty.classList.add("hidden");
    els.editor.classList.remove("hidden");
    els.editorTitle.textContent = flow._isNew ? "Novo fluxo" : "Editar fluxo";
    els.fldActive.checked = flow.active !== false;
    els.fldProcessType.value = flow.processType || "";
    if (els.fldFlowName) els.fldFlowName.value = flow.flowName || "";
    els.fldDescription.value = flow.description || "";
    draftSteps = (flow.steps || []).map((s, i) => ({
      id: s.id || SeiFluxoStorage.generateId("step"),
      order: s.order || i + 1,
      name: s.name || "",
      description: s.description || "",
      unit: s.unit || ""
    }));
    if (!draftSteps.length) addStep();
    renderSteps();
    renderList();
  }

  function addStep(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    draftSteps.push({
      id: SeiFluxoStorage.generateId("step"),
      order: draftSteps.length + 1,
      name: "",
      description: "",
      unit: ""
    });
    renumber();
    renderSteps({ focusLast: true });
  }

  function renumber() {
    draftSteps.forEach((s, i) => {
      s.order = i + 1;
    });
  }

  function renderSteps(opts = {}) {
    if (!els.stepsList) return;
    els.stepsList.innerHTML = "";
    draftSteps.forEach((step, index) => {
      const card = document.createElement("div");
      card.className = "step-card";
      card.innerHTML = `
        <div class="step-order">${step.order}</div>
        <div class="step-fields">
          <input type="text" data-k="name" placeholder="Nome da etapa *" autocomplete="off" />
          <input type="text" data-k="unit" placeholder="Unidade (opcional)" autocomplete="off" />
          <textarea data-k="description" rows="2" placeholder="Descrição (opcional)"></textarea>
        </div>
        <div class="step-actions">
          <button type="button" class="icon-btn" data-act="up" title="Subir">↑</button>
          <button type="button" class="icon-btn" data-act="down" title="Descer">↓</button>
          <button type="button" class="icon-btn danger" data-act="del" title="Remover">✕</button>
        </div>
      `;
      card.querySelector('[data-k="name"]').value = step.name;
      card.querySelector('[data-k="unit"]').value = step.unit;
      card.querySelector('[data-k="description"]').value = step.description;
      card.querySelectorAll("[data-k]").forEach((input) => {
        input.addEventListener("input", () => {
          step[input.getAttribute("data-k")] = input.value;
        });
      });
      card.querySelector('[data-act="up"]').addEventListener("click", (e) => {
        e.preventDefault();
        if (index === 0) return;
        [draftSteps[index - 1], draftSteps[index]] = [
          draftSteps[index],
          draftSteps[index - 1]
        ];
        renumber();
        renderSteps();
      });
      card.querySelector('[data-act="down"]').addEventListener("click", (e) => {
        e.preventDefault();
        if (index >= draftSteps.length - 1) return;
        [draftSteps[index + 1], draftSteps[index]] = [
          draftSteps[index],
          draftSteps[index + 1]
        ];
        renumber();
        renderSteps();
      });
      card.querySelector('[data-act="del"]').addEventListener("click", (e) => {
        e.preventDefault();
        if (draftSteps.length <= 1) {
          toast("Mantenha ao menos uma etapa.", "err");
          return;
        }
        draftSteps.splice(index, 1);
        renumber();
        renderSteps();
      });
      els.stepsList.appendChild(card);
    });

    if (opts.focusLast && draftSteps.length) {
      const last = els.stepsList.lastElementChild;
      last?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      last?.querySelector('[data-k="name"]')?.focus();
    }
  }

  function collectForm() {
    const processType = els.fldProcessType.value.trim();
    if (!processType) {
      toast("Informe o tipo do processo.", "err");
      return null;
    }
    const steps = draftSteps
      .map((s, i) => ({
        id: s.id || SeiFluxoStorage.generateId("step"),
        order: i + 1,
        name: String(s.name || "").trim(),
        description: String(s.description || "").trim(),
        unit: String(s.unit || "").trim()
      }))
      .filter((s) => s.name);
    if (!steps.length) {
      toast("Cadastre ao menos uma etapa com nome.", "err");
      return null;
    }
    return {
      id: selectedId || SeiFluxoStorage.generateId("flow"),
      processType,
      flowName: (els.fldFlowName?.value || "").trim(),
      description: els.fldDescription.value.trim(),
      active: els.fldActive.checked,
      steps
    };
  }

  async function saveFlow(e) {
    e.preventDefault();
    const data = collectForm();
    if (!data) return;
    const idx = flows.findIndex((f) => f.id === data.id);
    if (idx >= 0) flows[idx] = data;
    else flows.push(data);
    await SeiFluxoStorage.saveFlows(flows);
    selectedId = data.id;
    toast("Salvo. Baixe o JSON para publicar no Drive do departamento.");
    await loadEditor();
  }

  async function deleteFlow() {
    if (!selectedId) return;
    const flow = flows.find((f) => f.id === selectedId);
    if (!flow) return;
    const delTitle =
      (SeiFluxoCatalog.flowDisplayName &&
        SeiFluxoCatalog.flowDisplayName(flow)) ||
      flow.flowName ||
      flow.processType;
    if (!confirm(`Excluir “${delTitle}”?`)) return;
    flows = flows.filter((f) => f.id !== selectedId);
    await SeiFluxoStorage.saveFlows(flows);
    toast("Excluído.");
    closeEditor();
    await loadEditor();
  }

  function newFlow() {
    openEditor({
      id: SeiFluxoStorage.generateId("flow"),
      _isNew: true,
      processType: "",
      flowName: "",
      description: "",
      active: true,
      steps: [
        {
          id: SeiFluxoStorage.generateId("step"),
          order: 1,
          name: "",
          description: "",
          unit: ""
        }
      ]
    });
    els.fldProcessType.focus();
  }

  async function exportJson() {
    if (!flows.length) {
      toast("Crie ao menos um fluxo antes de baixar.", "err");
      return;
    }
    const doc = SeiFluxoCatalog.buildCatalogDocument(flows, {
      institution: "",
      updatedAt: new Date().toISOString()
    });
    const blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sei-fluxo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("JSON baixado. Publique no Drive e adicione o link no Catálogo.");
  }

  async function importJson(file) {
    try {
      const text = await file.text();
      const parsed = SeiFluxoCatalog.parseCatalogPayload(JSON.parse(text));
      const cleaned = SeiFluxoCatalog.normalizeFlows(parsed.flows);
      if (
        !confirm(
          `Abrir ${cleaned.length} fluxo(s) no editor? O conteúdo atual será substituído.`
        )
      ) {
        return;
      }
      flows = cleaned;
      await SeiFluxoStorage.saveFlows(flows);
      closeEditor();
      await loadEditor();
      toast("JSON aberto no editor.");
    } catch (err) {
      toast("Falha: " + err.message, "err");
    }
  }

  function bind() {
    els.btnSaveSeiSites?.addEventListener("click", () => {
      saveAndActivateSeiSites().catch((e) => {
        console.error(e);
        toast("Erro ao salvar sites SEI.", "err");
      });
    });
    els.btnAddSource?.addEventListener("click", () => addSource("file"));
    els.btnAddFolder?.addEventListener("click", () => addSource("folder"));
    els.btnSync?.addEventListener("click", syncCatalog);

    els.search?.addEventListener("input", renderList);
    els.btnNew?.addEventListener("click", newFlow);
    els.btnAddStep?.addEventListener("click", addStep);
    $("#btnAddStepBottom")?.addEventListener("click", addStep);
    els.btnDelete?.addEventListener("click", deleteFlow);
    els.btnCancel?.addEventListener("click", closeEditor);
    els.editor?.addEventListener("submit", saveFlow);
    els.btnExport?.addEventListener("click", exportJson);
    els.fileImport?.addEventListener("change", () => {
      const file = els.fileImport.files?.[0];
      if (file) importJson(file);
      els.fileImport.value = "";
    });

    try {
      els.version.textContent = chrome.runtime.getManifest().version;
    } catch (_) {
      /* ignore */
    }
  }

  bind();
  Promise.all([
    refreshSeiSitesStatus(),
    refreshCatalogStatus(),
    loadEditor()
  ]).catch((e) => {
    console.error(e);
    toast("Erro ao carregar.", "err");
  });
})();
