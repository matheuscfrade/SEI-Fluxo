/**
 * Catálogo multi-arquivo + editor para baixar JSON.
 */
(function () {
  const $ = (sel) => document.querySelector(sel);

  let flows = [];
  let selectedId = null;
  let draftSteps = [];
  /** @type {{ id: string, label: string, url: string }[]} */
  let catalogSources = [];

  const els = {
    list: $("#flowList"),
    search: $("#search"),
    empty: $("#emptyState"),
    editor: $("#editor"),
    editorTitle: $("#editorTitle"),
    fldActive: $("#fldActive"),
    fldProcessType: $("#fldProcessType"),
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
    sourcesList: $("#sourcesList"),
    btnAddSource: $("#btnAddSource"),
    btnAddFolder: $("#btnAddFolder"),
    btnSync: $("#btnSync"),
    fldDriveApiKey: $("#fldDriveApiKey"),
    stCatalog: $("#stCatalog"),
    stSourceCount: $("#stSourceCount"),
    stRemoteCount: $("#stRemoteCount"),
    stLastSync: $("#stLastSync"),
    stConflicts: $("#stConflicts"),
    remoteList: $("#remoteList"),
    conflictsCard: $("#conflictsCard"),
    conflictsList: $("#conflictsList")
  };

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

  /* ---------- Fontes (vários arquivos) ---------- */

  /** Lê os campos da tela (evita perder link digitado antes do save). */
  function placeholdersForKind(kind) {
    const isFolder = kind === "folder";
    return {
      label: isFolder
        ? "Nome da instituição/pasta (ex.: IFMG)"
        : "Nome do departamento (ex.: RH)",
      url: isFolder
        ? "https://drive.google.com/drive/folders/…"
        : "https://drive.google.com/file/d/…/view"
    };
  }

  function applyPlaceholders(row, kind) {
    const ph = placeholdersForKind(kind);
    const labelEl = row.querySelector('[data-k="label"]');
    const urlEl = row.querySelector('[data-k="url"]');
    if (labelEl) labelEl.placeholder = ph.label;
    if (urlEl) urlEl.placeholder = ph.url;
  }

  /** Resolve tipo: dropdown tem prioridade; link de pasta força "folder". */
  function resolveKind(kind, url) {
    if (/\/folders\//i.test(String(url || ""))) return "folder";
    return kind === "folder" ? "folder" : "file";
  }

  function collectSourcesFromDom() {
    const rows = els.sourcesList?.querySelectorAll(".source-row");
    if (!rows || !rows.length) {
      return (catalogSources || []).map((s, i) => ({
        id: s.id || SeiFluxoStorage.generateId("src"),
        label: String(s.label || `Item ${i + 1}`).trim(),
        url: String(s.url || "").trim(),
        kind: resolveKind(s.kind, s.url)
      }));
    }

    const list = [];
    rows.forEach((row, index) => {
      const labelInput = row.querySelector("[data-k='label']");
      const urlInput = row.querySelector("[data-k='url']");
      const kindSelect = row.querySelector("[data-k='kind']");
      const prev = catalogSources[index];
      const url = String(urlInput?.value || "").trim();
      const kind = resolveKind(kindSelect?.value || prev?.kind || "file", url);
      list.push({
        id: prev?.id || row.dataset.sourceId || SeiFluxoStorage.generateId("src"),
        label:
          String(labelInput?.value || "").trim() ||
          (kind === "folder" ? `Pasta ${index + 1}` : `Departamento ${index + 1}`),
        url,
        kind
      });
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
      const ph = placeholdersForKind(kind);
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
            <input type="text" data-k="label" placeholder="${ph.label}" autocomplete="off" />
          </div>
          <input type="text" data-k="url" placeholder="${ph.url}" autocomplete="off" spellcheck="false" />
        </div>
        <div class="source-actions">
          <button type="button" class="icon-btn" data-act="up" title="Mover para cima">↑</button>
          <button type="button" class="icon-btn" data-act="down" title="Mover para baixo">↓</button>
          <button type="button" class="icon-btn danger" data-act="del" title="Remover">✕</button>
        </div>
      `;
      const kindEl = row.querySelector('[data-k="kind"]');
      const labelEl = row.querySelector('[data-k="label"]');
      const urlEl = row.querySelector('[data-k="url"]');
      kindEl.value = kind;
      labelEl.value = src.label || "";
      urlEl.value = src.url || "";

      // Dropdown: grava na memória e atualiza placeholders SEM recriar a linha
      // (recriar no change cancelava a seleção do usuário)
      kindEl.addEventListener("change", () => {
        const newKind = kindEl.value === "folder" ? "folder" : "file";
        src.kind = newKind;
        src.label = labelEl.value;
        src.url = urlEl.value;
        // Se o link é de pasta, mantém pasta mesmo se tentarem forçar arquivo
        if (/\/folders\//i.test(src.url)) {
          src.kind = "folder";
          kindEl.value = "folder";
        }
        applyPlaceholders(row, src.kind);
        persistSources();
      });

      labelEl.addEventListener("input", () => {
        src.label = labelEl.value;
      });
      labelEl.addEventListener("change", () => {
        src.label = labelEl.value;
        persistSources();
      });

      urlEl.addEventListener("input", () => {
        src.url = urlEl.value;
        // Colou link de pasta → ajusta o tipo automaticamente
        if (/\/folders\//i.test(src.url) && kindEl.value !== "folder") {
          kindEl.value = "folder";
          src.kind = "folder";
          applyPlaceholders(row, "folder");
        }
      });
      urlEl.addEventListener("change", () => {
        src.url = urlEl.value;
        src.label = labelEl.value;
        if (/\/folders\//i.test(src.url)) {
          src.kind = "folder";
          kindEl.value = "folder";
          applyPlaceholders(row, "folder");
        } else {
          src.kind = kindEl.value === "folder" ? "folder" : "file";
        }
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
        label: String(s.label || `Item ${i + 1}`).trim(),
        url: String(s.url || "").trim(),
        kind: resolveKind(s.kind, s.url)
      }))
      .filter((s) => s.url || s.label);

    const apiKey = els.fldDriveApiKey?.value?.trim() || "";
    await SeiFluxoStorage.saveSettings({
      catalogSources,
      driveApiKey: apiKey
    });
    return catalogSources;
  }

  function addSource(kind) {
    collectSourcesFromDom();
    const isFolder = kind === "folder";
    catalogSources.push({
      id: SeiFluxoStorage.generateId("src"),
      label: isFolder
        ? `Pasta ${catalogSources.filter((s) => s.kind === "folder").length + 1}`
        : `Departamento ${catalogSources.filter((s) => s.kind !== "folder").length + 1}`,
      url: "",
      kind: isFolder ? "folder" : "file"
    });
    renderSources();
    persistSources();
    const rows = els.sourcesList.querySelectorAll(".source-row");
    const last = rows[rows.length - 1];
    last?.querySelector("[data-k='url']")?.focus();
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
      if (els.fldDriveApiKey) {
        els.fldDriveApiKey.value = settings.driveApiKey || "";
      }
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
          .map(
            (e) =>
              `• ${e.sourceLabel} — “${e.processType}” (${e.steps} etapa${
                e.steps === 1 ? "" : "s"
              })`
          )
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
        String(a.processType).localeCompare(String(b.processType), "pt-BR")
      )
      .forEach((f) => {
        const div = document.createElement("div");
        div.className = "remote-item";
        const n = (f.steps || []).length;
        const src = f._sourceLabel ? ` · ${f._sourceLabel}` : "";
        div.innerHTML = "<strong></strong><span></span>";
        div.querySelector("strong").textContent = f.processType;
        div.querySelector("span").textContent = `${n} etapa(s)${src}${
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
          "Cole o link do Google Drive no campo de cada arquivo (não só o nome do departamento).",
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
          [f.processType, f.description].join(" ")
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
      btn.innerHTML = `
        <span class="flow-item-title"></span>
        <span class="flow-item-meta"></span>
        <span class="pill ${flow.active === false ? "off" : "on"}"></span>
      `;
      btn.querySelector(".flow-item-title").textContent = flow.processType;
      btn.querySelector(".flow-item-meta").textContent = `${stepsCount} etapa(s)`;
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
    if (!confirm(`Excluir “${flow.processType}”?`)) return;
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
    els.btnAddSource?.addEventListener("click", () => addSource("file"));
    els.btnAddFolder?.addEventListener("click", () => addSource("folder"));
    els.btnSync?.addEventListener("click", syncCatalog);
    els.fldDriveApiKey?.addEventListener("change", persistSources);

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
  Promise.all([refreshCatalogStatus(), loadEditor()]).catch((e) => {
    console.error(e);
    toast("Erro ao carregar.", "err");
  });
})();
