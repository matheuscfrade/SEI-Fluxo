/**
 * UI da barra lateral direita com fluxograma sequencial.
 */
(function (root) {
  const HOST_ID = "sei-fluxo-host";
  const ROOT_ID = "sei-fluxo-root";

  function el(tag, className, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else node.setAttribute(k, v);
      });
    }
    return node;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sameText(a, b) {
    const n = (s) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    return n(a) === n(b) && !!n(a);
  }

  class SeiFluxoSidebar {
    constructor() {
      this.open = true;
      this.width = 340;
      this.meta = null;
      this.flow = null;
      this.flowConflict = false;
      this.flowCandidates = [];
      this.flowAlternatives = [];
      this.host = null;
      this.root = null;
      this.onToggle = null;
      this.onRefresh = null;
      this.onSelectFlow = null;
    }

    mount() {
      if (document.getElementById(HOST_ID)) {
        this.host = document.getElementById(HOST_ID);
        this.root = this.host.shadowRoot?.getElementById(ROOT_ID);
        return;
      }

      this.host = el("div", null, { id: HOST_ID });
      // Shadow DOM isola estilos do SEI
      const shadow = this.host.attachShadow({ mode: "open" });
      const style = el("style");
      style.textContent = SIDEBAR_CSS;
      shadow.appendChild(style);

      this.root = el("div", "sf-root sf-open", { id: ROOT_ID });
      shadow.appendChild(this.root);
      document.documentElement.appendChild(this.host);

      this.render();
      this.applyOpenState();
    }

    unmount() {
      this.host?.remove();
      this.host = null;
      this.root = null;
    }

    setState({
      meta,
      flow,
      open,
      width,
      flowConflict,
      flowCandidates,
      flowAlternatives
    }) {
      const prevOpen = this.open;
      const contentChanged =
        (meta !== undefined && meta !== this.meta) ||
        (flow !== undefined && flow !== this.flow) ||
        (flowConflict !== undefined && flowConflict !== this.flowConflict) ||
        (flowCandidates !== undefined &&
          flowCandidates !== this.flowCandidates);

      if (meta !== undefined) this.meta = meta;
      if (flow !== undefined) this.flow = flow;
      if (width !== undefined) this.width = width;
      if (flowConflict !== undefined) this.flowConflict = flowConflict;
      if (flowCandidates !== undefined) this.flowCandidates = flowCandidates || [];
      if (flowAlternatives !== undefined) this.flowAlternatives = flowAlternatives;

      // open só muda quando o chamador passa explicitamente
      if (open !== undefined) this.open = !!open;

      // Atualiza conteúdo só se mudou (evita resetar UI a cada scan)
      if (!this.root || !this.root.querySelector(".sf-panel") || contentChanged) {
        this.render();
      } else if (open !== undefined && open !== prevOpen) {
        this.updateOpenChrome();
      } else {
        this.applyOpenState();
      }
    }

    /**
     * Abre/fecha sem reconstruir o painel inteiro (1 clique = 1 ação).
     */
    setOpen(open, { notify = true } = {}) {
      this.open = !!open;
      this.updateOpenChrome();
      if (notify) this.onToggle?.(this.open);
    }

    updateOpenChrome() {
      this.applyOpenState();
      this.updateFab();
    }

    applyOpenState() {
      if (!this.root) return;
      this.root.classList.toggle("sf-open", !!this.open);
      this.root.classList.toggle("sf-closed", !this.open);
      this.root.style.setProperty("--sf-width", `${this.width}px`);

      if (window === window.top) {
        document.documentElement.style.setProperty(
          "--sei-fluxo-pad",
          this.open ? `${this.width}px` : "0px"
        );
        document.documentElement.classList.add("sei-fluxo-pad-ready");
        document.documentElement.classList.toggle(
          "sei-fluxo-sidebar-open",
          !!this.open
        );
      }
    }

    updateFab() {
      if (!this.root) return;
      let fab = this.root.querySelector(".sf-fab");
      if (!fab) {
        fab = this.createFab();
        this.root.prepend(fab);
      }
      fab.title = this.open ? "Recolher SEI Fluxo" : "Abrir SEI Fluxo";
      fab.setAttribute(
        "aria-label",
        this.open ? "Recolher painel SEI Fluxo" : "Abrir painel SEI Fluxo"
      );
      fab.innerHTML = this.open
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18l6-6-6-6"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg><span class="sf-fab-label">Fluxo</span>`;
    }

    createFab() {
      const fab = el("button", "sf-fab", {
        type: "button",
        title: this.open ? "Recolher SEI Fluxo" : "Abrir SEI Fluxo",
        "aria-label": "Alternar painel SEI Fluxo"
      });
      fab.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setOpen(!this.open);
      });
      return fab;
    }

    render() {
      if (!this.root) return;
      this.root.innerHTML = "";

      const fab = this.createFab();
      this.root.appendChild(fab);
      this.updateFab();

      const panel = el("aside", "sf-panel", {
        role: "complementary",
        "aria-label": "Demonstrador de fluxo do processo SEI"
      });

      panel.appendChild(this.renderHeader());
      panel.appendChild(this.renderBody());
      panel.appendChild(this.renderFooter());
      this.root.appendChild(panel);
      this.applyOpenState();
    }

    renderHeader() {
      const header = el("header", "sf-header");
      const top = el("div", "sf-header-top");
      const brand = el("div", "sf-brand");
      brand.innerHTML = `
        <div class="sf-logo" aria-hidden="true">SF</div>
        <div>
          <div class="sf-title">SEI Fluxo</div>
          <div class="sf-subtitle">Demonstrador de etapas</div>
        </div>`;
      top.appendChild(brand);

      const actions = el("div", "sf-header-actions");
      const btnRefresh = el("button", "sf-icon-btn", {
        type: "button",
        title: "Reanalisar página",
        "aria-label": "Reanalisar página"
      });
      btnRefresh.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>`;
      btnRefresh.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onRefresh?.();
      });

      const btnClose = el("button", "sf-icon-btn", {
        type: "button",
        title: "Recolher",
        "aria-label": "Recolher painel"
      });
      btnClose.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
      btnClose.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Um único clique fecha e persiste — sem reabrir no próximo scan
        this.setOpen(false);
      });

      actions.appendChild(btnRefresh);
      actions.appendChild(btnClose);
      top.appendChild(actions);
      header.appendChild(top);
      return header;
    }

    /**
     * Card único com processo + fluxo (sem repetir tipo/origem/nome).
     */
    renderIdentityCard(meta, flow) {
      const info = el("section", "sf-card sf-identity");
      const num = meta?.processNumber || "—";
      const tipo = meta?.processType || "Não identificado";

      const parts = [];
      parts.push(`
        <div class="sf-id-block">
          <div class="sf-card-label">Processo</div>
          <div class="sf-process-number">${escapeHtml(num)}</div>
        </div>
      `);

      if (flow) {
        const title =
          flow._flowTitle ||
          String(flow.flowName || "").trim() ||
          flow.processType ||
          "Fluxo";
        const institution = String(flow._sourceInstitution || "").trim();
        const department = String(flow._sourceDepartment || "").trim();
        const origin = [institution, department].filter(Boolean).join(" · ");
        const showType =
          !!tipo &&
          tipo !== "Não identificado" &&
          !sameText(title, tipo);

        parts.push(`
          <div class="sf-id-block">
            <div class="sf-card-label">Fluxo</div>
            <div class="sf-flow-name">${escapeHtml(title)}</div>
            ${
              origin
                ? `<div class="sf-flow-origin">${escapeHtml(origin)}</div>`
                : ""
            }
          </div>
        `);

        if (showType) {
          parts.push(`
            <div class="sf-id-block">
              <div class="sf-card-label">Tipo no SEI</div>
              <div class="sf-process-type">${escapeHtml(tipo)}</div>
            </div>
          `);
        }

        if (flow.description) {
          parts.push(
            `<p class="sf-flow-desc">${escapeHtml(flow.description)}</p>`
          );
        }

        const n = (flow.steps || []).length;
        parts.push(
          `<div class="sf-badge">${n} etapa${n === 1 ? "" : "s"}</div>`
        );
      } else if (meta?.processType) {
        parts.push(`
          <div class="sf-id-block">
            <div class="sf-card-label">Tipo no SEI</div>
            <div class="sf-process-type">${escapeHtml(tipo)}</div>
          </div>
        `);
      }

      info.innerHTML = parts.join("");
      return info;
    }

    renderBody() {
      const body = el("div", "sf-body");
      const meta = this.meta;
      const flow = this.flow;
      const tipo = meta?.processType || "Não identificado";

      body.appendChild(this.renderIdentityCard(meta, flow));

      if (!meta?.isSei) {
        body.appendChild(this.renderEmpty(
          "Página SEI não detectada",
          "Abra um processo no SEI para visualizar o fluxograma correspondente."
        ));
        return body;
      }

      if (!meta?.processType) {
        body.appendChild(this.renderEmpty(
          "Tipo de processo não encontrado nesta tela",
          "Não foi possível ler o campo Tipo nesta tela. Abra “Alterar Processo” ou use ↻ após a árvore carregar."
        ));
        return body;
      }

      if (!flow) {
        body.appendChild(this.renderEmpty(
          "Fluxo não cadastrado",
          `Não há fluxo com o tipo “${tipo}”. Cadastre o processType com esse mesmo nome no JSON do departamento (Opções da extensão).`
        ));
        return body;
      }

      // Conflito: seletor sempre visível enquanto houver 2+ fluxos
      if ((this.flowCandidates || []).length > 1) {
        body.appendChild(this.renderConflictPicker());
      }

      body.appendChild(this.renderDisclaimer());
      body.appendChild(this.renderFlowchart(flow));
      return body;
    }

    renderDisclaimer() {
      const box = el("aside", "sf-disclaimer", {
        role: "note",
        "aria-label": "Aviso sobre o fluxo demonstrado"
      });
      box.innerHTML = `
        <div class="sf-disclaimer-title">Aviso</div>
        <p class="sf-disclaimer-text">
          O fluxo demonstrado <strong>não reflete a etapa atual</strong> nem as etapas
          pelas quais o processo já passou. Ele apresenta apenas o detalhamento das
          etapas do tipo de processo identificado, conforme os fluxos cadastrados
          na extensão.
        </p>
      `;
      return box;
    }

    renderConflictPicker() {
      const box = el("div", "sf-conflict");
      const title = el("div", "sf-conflict-title", {
        text: "ATENÇÃO: Há mais de um fluxo cadastrado para esse processo"
      });
      box.appendChild(title);
      const hint = el("div", "sf-conflict-hint", {
        text: "Selecione qual deseja ver. As opções continuam disponíveis — você pode alternar a qualquer momento."
      });
      box.appendChild(hint);

      const list = el("div", "sf-conflict-list");
      const candidates = this.flowCandidates || [];
      candidates.forEach((c) => {
        const id = `sf-flow-opt-${String(c.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const label = el("label", "sf-conflict-option");
        if (this.flow && this.flow.id === c.id) {
          label.classList.add("sf-conflict-option-active");
        }
        label.setAttribute("for", id);

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "sf-flow-choice";
        radio.id = id;
        radio.value = c.id;
        radio.checked = !!(this.flow && this.flow.id === c.id);
        // click em qualquer opção (mesmo a já marcada) permite trocar depois
        radio.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onSelectFlow?.(c.id);
        });
        radio.addEventListener("change", () => {
          if (radio.checked) this.onSelectFlow?.(c.id);
        });

        const text = el("span");
        const title =
          c._flowTitle ||
          String(c.flowName || "").trim() ||
          c.processType ||
          "Fluxo";
        const path =
          c._displayPath ||
          [c._sourceInstitution, c._sourceDepartment, title]
            .map((p) => String(p || "").trim())
            .filter(Boolean)
            .join(" | ") ||
          c._sourceLabel ||
          title;
        const steps = (c.steps || []).length;
        text.textContent = `${path} (${steps} etapa${steps === 1 ? "" : "s"})`;

        label.appendChild(radio);
        label.appendChild(text);
        label.addEventListener("click", (e) => {
          // garante troca ao clicar no label inteiro
          if (e.target === radio) return;
          radio.checked = true;
          this.onSelectFlow?.(c.id);
        });
        list.appendChild(label);
      });
      box.appendChild(list);
      return box;
    }

    renderFlowchart(flow) {
      const wrap = el("section", "sf-flowchart", {
        "aria-label": "Fluxograma sequencial das etapas"
      });
      const steps = [...(flow.steps || [])].sort(
        (a, b) => (a.order || 0) - (b.order || 0)
      );

      steps.forEach((step, index) => {
        const item = el("div", "sf-step");
        item.setAttribute("data-step-order", String(step.order || index + 1));

        const rail = el("div", "sf-step-rail");
        const bullet = el("div", "sf-step-bullet");
        bullet.textContent = String(step.order || index + 1);
        rail.appendChild(bullet);
        if (index < steps.length - 1) {
          rail.appendChild(el("div", "sf-step-line"));
        }

        const content = el("div", "sf-step-content");
        const title = el("div", "sf-step-title", {
          text: step.name || `Etapa ${index + 1}`
        });
        content.appendChild(title);

        if (step.unit) {
          content.appendChild(el("div", "sf-step-unit", { text: step.unit }));
        }
        if (step.description) {
          content.appendChild(
            el("div", "sf-step-desc", { text: step.description })
          );
        }

        item.appendChild(rail);
        item.appendChild(content);
        wrap.appendChild(item);
      });

      return wrap;
    }

    renderEmpty(title, message) {
      const box = el("div", "sf-empty");
      box.innerHTML = `
        <div class="sf-empty-icon" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 8v5"/>
            <circle cx="12" cy="16" r="0.8" fill="currentColor"/>
          </svg>
        </div>
        <div class="sf-empty-title">${escapeHtml(title)}</div>
        <p class="sf-empty-msg">${escapeHtml(message)}</p>
      `;
      return box;
    }

    renderFooter() {
      const footer = el("footer", "sf-footer");
      footer.innerHTML = `
        <div class="sf-credits">
          Desenvolvido por <strong>Matheus Costa Frade</strong>
        </div>
        <a class="sf-github"
           href="https://github.com/matheuscfrade/SEI-Fluxo"
           target="_blank"
           rel="noopener noreferrer">
          github.com/matheuscfrade/SEI-Fluxo
        </a>
      `;
      return footer;
    }
  }

  const SIDEBAR_CSS = `
    :host, .sf-root {
      all: initial;
      font-family: "Segoe UI", system-ui, -apple-system, Roboto, Ubuntu, sans-serif;
      color: #0f172a;
      line-height: 1.4;
      box-sizing: border-box;
    }
    *, *::before, *::after { box-sizing: border-box; }
    .sf-root {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      z-index: 2147483646;
      pointer-events: none;
      --sf-width: 340px;
      --sf-bg: #f8fafc;
      --sf-panel: #ffffff;
      --sf-border: #e2e8f0;
      --sf-primary: #0b5cab;
      --sf-primary-2: #0e7490;
      --sf-accent: #0369a1;
      --sf-muted: #64748b;
      --sf-success: #059669;
      --sf-shadow: 0 10px 40px rgba(15, 23, 42, 0.18);
    }
    .sf-fab {
      pointer-events: auto;
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      z-index: 2;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid rgba(11, 92, 171, 0.25);
      background: linear-gradient(135deg, #0b5cab, #0e7490);
      color: #fff;
      border-radius: 10px 0 0 10px;
      padding: 12px 10px;
      cursor: pointer;
      box-shadow: var(--sf-shadow);
      transition: right 0.25s ease, background 0.2s ease;
    }
    .sf-root.sf-open .sf-fab {
      right: var(--sf-width);
    }
    .sf-fab:hover { filter: brightness(1.06); }
    .sf-fab-label {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
    }
    .sf-panel {
      pointer-events: auto;
      position: fixed;
      top: 0;
      right: 0;
      width: var(--sf-width);
      height: 100vh;
      background: var(--sf-bg);
      border-left: 1px solid var(--sf-border);
      box-shadow: var(--sf-shadow);
      display: flex;
      flex-direction: column;
      transform: translateX(105%);
      transition: transform 0.28s cubic-bezier(.2,.8,.2,1);
    }
    .sf-root.sf-open .sf-panel {
      transform: translateX(0);
    }
    .sf-header {
      background: linear-gradient(135deg, #0b5cab 0%, #0e7490 100%);
      color: #fff;
      padding: 14px 14px 12px;
      flex-shrink: 0;
    }
    .sf-header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .sf-brand { display: flex; gap: 10px; align-items: center; }
    .sf-logo {
      width: 36px; height: 36px; border-radius: 10px;
      background: rgba(255,255,255,0.18);
      display: grid; place-items: center;
      font-weight: 800; font-size: 13px; letter-spacing: 0.04em;
      border: 1px solid rgba(255,255,255,0.25);
    }
    .sf-title { font-size: 15px; font-weight: 700; }
    .sf-subtitle { font-size: 11px; opacity: 0.85; margin-top: 1px; }
    .sf-header-actions { display: flex; gap: 4px; }
    .sf-icon-btn {
      border: 0; background: rgba(255,255,255,0.12);
      color: #fff; width: 30px; height: 30px; border-radius: 8px;
      cursor: pointer; display: grid; place-items: center;
    }
    .sf-icon-btn:hover { background: rgba(255,255,255,0.22); }
    .sf-body {
      flex: 1;
      overflow: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .sf-card {
      background: var(--sf-panel);
      border: 1px solid var(--sf-border);
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 1px 2px rgba(15,23,42,0.04);
    }
    .sf-card-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--sf-muted);
      font-weight: 700;
    }
    .sf-identity {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .sf-id-block {
      min-width: 0;
    }
    .sf-process-number {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 4px;
      font-variant-numeric: tabular-nums;
    }
    .sf-process-type {
      font-size: 13px;
      font-weight: 600;
      color: var(--sf-primary);
      margin-top: 4px;
      line-height: 1.35;
      word-break: break-word;
    }
    .sf-flow-name {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 4px;
      line-height: 1.35;
      word-break: break-word;
    }
    .sf-flow-origin {
      font-size: 12px;
      font-weight: 600;
      color: var(--sf-muted);
      margin-top: 4px;
      line-height: 1.3;
    }
    .sf-flow-desc {
      margin: 0;
      font-size: 12px;
      color: var(--sf-muted);
      line-height: 1.45;
    }
    .sf-badge {
      display: inline-flex;
      align-self: flex-start;
      font-size: 11px;
      font-weight: 700;
      color: #0369a1;
      background: #e0f2fe;
      border-radius: 999px;
      padding: 4px 10px;
    }
    .sf-conflict {
      margin-top: 4px;
      font-size: 12px;
      color: #92400e;
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 12px;
      padding: 10px 12px;
      line-height: 1.4;
    }
    .sf-conflict-title {
      font-weight: 800;
      font-size: 12px;
      color: #78350f;
      margin-bottom: 6px;
    }
    .sf-conflict-hint {
      font-size: 11px;
      margin-bottom: 8px;
      color: #92400e;
    }
    .sf-conflict-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .sf-conflict-option {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
      cursor: pointer;
      background: #fff;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 8px 10px;
    }
    .sf-conflict-option-active {
      border-color: #0b5cab;
      background: #f0f9ff;
      box-shadow: 0 0 0 1px rgba(11, 92, 171, 0.2);
    }
    .sf-conflict-option input {
      margin-top: 2px;
      accent-color: #0b5cab;
      flex-shrink: 0;
    }
    .sf-screen-hint {
      margin-top: 8px;
      font-size: 10px;
      color: var(--sf-muted);
      font-weight: 600;
    }
    .sf-disclaimer {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 3px solid #0b5cab;
      border-radius: 10px;
      padding: 10px 12px;
      line-height: 1.4;
    }
    .sf-disclaimer-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #0b5cab;
      margin-bottom: 4px;
    }
    .sf-disclaimer-text {
      margin: 0;
      font-size: 11px;
      color: #334155;
      line-height: 1.45;
    }
    .sf-disclaimer-text strong {
      color: #0f172a;
      font-weight: 700;
    }
    .sf-flowchart {
      display: flex;
      flex-direction: column;
      gap: 0;
      padding: 4px 0 8px;
    }
    .sf-step {
      display: grid;
      grid-template-columns: 36px 1fr;
      gap: 10px;
      min-height: 64px;
    }
    .sf-step-rail {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .sf-step-bullet {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #334155;
      font-size: 12px;
      font-weight: 800;
      display: grid;
      place-items: center;
      border: 2px solid #cbd5e1;
      flex-shrink: 0;
      z-index: 1;
    }
    .sf-step-line {
      width: 2px;
      flex: 1;
      min-height: 18px;
      background: linear-gradient(#cbd5e1, #cbd5e1);
      margin: 2px 0;
    }
    .sf-step-content {
      background: var(--sf-panel);
      border: 1px solid var(--sf-border);
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 10px;
      box-shadow: 0 1px 2px rgba(15,23,42,0.03);
    }
    .sf-step-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }
    .sf-step-unit {
      margin-top: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--sf-primary-2);
    }
    .sf-step-desc {
      margin-top: 6px;
      font-size: 12px;
      color: var(--sf-muted);
    }
    .sf-empty {
      background: var(--sf-panel);
      border: 1px dashed #cbd5e1;
      border-radius: 12px;
      padding: 18px 14px;
      text-align: center;
    }
    .sf-empty-icon { color: #94a3b8; margin-bottom: 8px; }
    .sf-empty-title { font-size: 13px; font-weight: 700; color: #0f172a; }
    .sf-empty-msg { margin: 8px 0 0; font-size: 12px; color: var(--sf-muted); }
    .sf-footer {
      flex-shrink: 0;
      padding: 10px 12px 12px;
      border-top: 1px solid var(--sf-border);
      background: #f8fafc;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;
      text-align: center;
    }
    .sf-credits {
      font-size: 10px;
      color: #64748b;
      line-height: 1.35;
    }
    .sf-credits strong {
      color: #334155;
      font-weight: 700;
    }
    .sf-github {
      font-size: 10px;
      font-weight: 600;
      color: #0b5cab;
      text-decoration: none;
      word-break: break-all;
    }
    .sf-github:hover {
      text-decoration: underline;
    }
  `;

  root.SeiFluxoSidebar = SeiFluxoSidebar;
})(typeof globalThis !== "undefined" ? globalThis : window);
