/**
 * Content script — monta sidebar no top frame apenas DENTRO de um processo.
 * Não exibe em Controle de Processos / home do SEI.
 */
(function () {
  const IS_TOP = window === window.top;
  const MSG_META = "SEI_FLUXO_META_FROM_FRAME";
  const MSG_REQUEST = "SEI_FLUXO_REQUEST_SCAN";

  let sidebar = null;
  let settings = null;
  let flows = [];
  let lastMeta = null;
  let observer = null;
  let scanTimer = null;
  let forceShow = false;
  let iframeListenersBound = false;
  /** Preferência local de aberto/fechado (evita reabrir no scan antes do storage gravar). */
  let userSidebarOpen = null;

  function log(...args) {
    try {
      console.info("[SEI Fluxo]", ...args);
    } catch (_) {
      /* ignore */
    }
  }

  function shouldMountSidebarHere() {
    return IS_TOP;
  }

  async function loadData() {
    if (!globalThis.SeiFluxoStorage) {
      console.warn("[SEI Fluxo] Storage helper indisponível.");
      return;
    }
    await SeiFluxoStorage.ensureSeeded();
    settings = await SeiFluxoStorage.getSettings();
    // Barra usa catálogo remoto (Drive) ou rascunho local, conforme configuração
    flows = await SeiFluxoStorage.getEffectiveFlows();
    try {
      await chrome.storage.local.remove("seiFluxo_typeCache");
    } catch (_) {
      /* ignore */
    }

    // Atualiza catálogos em background se já houver links
    const hasSources = (settings.catalogSources || []).some((s) => s.url);
    if (hasSources && globalThis.SeiFluxoCatalog) {
      SeiFluxoStorage.syncCatalog()
        .then(async (r) => {
          flows = r.flows;
          if (lastMeta) applyToSidebar(lastMeta);
        })
        .catch(() => {
          /* offline — mantém última cópia baixada */
        });
    }
  }

  function betterProcessType(a, b) {
    const qa = a?.processType
      ? typeof a.processTypeScore === "number"
        ? a.processTypeScore
        : SeiFluxoDetector.processTypeQuality?.(a.processType) ?? 0
      : -1;
    const qb = b?.processType
      ? typeof b.processTypeScore === "number"
        ? b.processTypeScore
        : SeiFluxoDetector.processTypeQuality?.(b.processType) ?? 0
      : -1;
    if (qb > qa) return { type: b.processType, score: qb };
    if (qa > qb) return { type: a.processType, score: qa };
    const ta = a?.processType || null;
    const tb = b?.processType || null;
    if (ta && tb) {
      return ta.length <= tb.length
        ? { type: ta, score: qa }
        : { type: tb, score: qb };
    }
    return { type: ta || tb, score: Math.max(qa, qb) };
  }

  function mergeMeta(a, b) {
    if (!a) return b;
    if (!b) return a;

    // Se a página atual é lista de controle, descarta metadados antigos do processo
    if (b.isControlList || b.isInsideProcess === false) {
      return { ...b };
    }
    if (a.isControlList && b.isInsideProcess) {
      return { ...b };
    }

    const picked = betterProcessType(a, b);
    return {
      isSei: !!(a.isSei || b.isSei),
      processType: picked.type,
      processTypeScore: picked.score,
      processNumber: b.processNumber || a.processNumber || null,
      idProcedimento: b.idProcedimento || a.idProcedimento || null,
      hints: [...(b.hints || []), ...(a.hints || [])].slice(0, 50),
      url: b.url || a.url,
      host: b.host || a.host,
      acao: b.acao || a.acao,
      isWorkScreen: !!(b.isWorkScreen || a.isWorkScreen),
      isAlterScreen: !!(b.isAlterScreen || a.isAlterScreen),
      isControlList: !!(b.isControlList || a.isControlList),
      isInsideProcess: !!(b.isInsideProcess || a.isInsideProcess),
      detectedAt: Math.max(a.detectedAt || 0, b.detectedAt || 0)
    };
  }

  let preferredFlowId = null;
  let preferredForType = null;

  async function buildViewModel(meta) {
    let resolved = {
      flow: null,
      candidates: [],
      alternatives: [],
      conflict: false
    };

    if (meta?.processType) {
      // Lembra só a última seleção deste tipo (qual rádio vem marcado).
      // Sempre devolve TODOS os candidatos para o seletor continuar na tela.
      if (preferredForType !== meta.processType) {
        preferredForType = meta.processType;
        preferredFlowId = null;
        try {
          preferredFlowId = await SeiFluxoStorage.getFlowChoice(meta.processType);
        } catch (_) {
          preferredFlowId = null;
        }
      }
      resolved = SeiFluxoStorage.resolveFlowForProcessType(
        flows,
        meta.processType,
        preferredFlowId
      );
      // Garante que conflito continue true sempre que houver 2+ opções
      if ((resolved.candidates || []).length > 1) {
        resolved.conflict = true;
      }
    }

    const flow = resolved.flow;
    const steps = flow?.steps || [];
    const currentStepIndex =
      settings?.highlightKeywords && flow
        ? SeiFluxoDetector.guessCurrentStepIndex(steps, meta?.hints || [])
        : -1;
    return {
      meta,
      flow,
      currentStepIndex,
      flowConflict: !!resolved.conflict,
      flowCandidates: resolved.candidates || [],
      flowAlternatives: resolved.alternatives || []
    };
  }

  function preferredOpen() {
    if (forceShow) return true;
    if (userSidebarOpen !== null) return userSidebarOpen;
    return settings?.sidebarOpen !== false;
  }

  /**
   * Regra principal: só mostra a barra DENTRO de um processo.
   * Controle de Processos / home → nunca.
   */
  function shouldShowSidebar(meta) {
    const url = location.href;
    const Det = globalThis.SeiFluxoDetector;
    if (!Det) return false;

    // Bloqueio explícito da lista
    if (Det.isControlListScreen?.(url, document)) return false;
    if (meta?.isControlList) return false;

    // forceShow do popup só vale se estiver em processo
    const inside =
      meta?.isInsideProcess === true ||
      Det.isInsideProcess?.(url, meta?.idProcedimento, document) === true;

    if (!inside) return false;
    return true;
  }

  function ensureSidebar() {
    if (!shouldMountSidebarHere()) return null;
    if (!sidebar) {
      sidebar = new SeiFluxoSidebar();
      sidebar.onToggle = async (open) => {
        userSidebarOpen = open;
        settings = {
          ...(settings || SeiFluxoStorage.DEFAULT_SETTINGS),
          sidebarOpen: open
        };
        try {
          settings = await SeiFluxoStorage.saveSettings({ sidebarOpen: open });
        } catch (e) {
          log("Falha ao salvar preferência da barra", e);
        }
      };
      sidebar.onRefresh = () => scheduleScan(0);
      sidebar.onOpenAdmin = openAdmin;
      sidebar.onSelectFlow = async (flowId) => {
        const tipo = lastMeta?.processType;
        if (!tipo || !flowId) return;
        // Apenas define qual está exibido agora — as opções de conflito
        // continuam sempre na barra para o usuário alternar de novo.
        preferredFlowId = flowId;
        preferredForType = tipo;
        try {
          await SeiFluxoStorage.setFlowChoice(tipo, flowId);
        } catch (_) {
          /* ignore */
        }
        // Reaplica sem esconder o seletor (candidates permanecem)
        applyToSidebar(lastMeta);
      };
      sidebar.mount();
      sidebar.setOpen(preferredOpen(), { notify: false });
      log("Sidebar montada", location.href);
    }
    return sidebar;
  }

  function hideSidebar() {
    if (!sidebar) return;
    sidebar.unmount();
    sidebar = null;
    try {
      document.documentElement.classList.remove("sei-fluxo-sidebar-open");
      document.documentElement.style.removeProperty("--sei-fluxo-pad");
    } catch (_) {
      /* ignore */
    }
  }

  function applyToSidebar(meta) {
    if (!shouldMountSidebarHere()) return;
    lastMeta = meta;

    if (!shouldShowSidebar(meta)) {
      hideSidebar();
      log("Barra oculta (fora de processo)", meta?.acao || location.href);
      return;
    }

    const sb = ensureSidebar();
    if (!sb) return;

    buildViewModel(meta).then((vm) => {
      sb.setState({
        meta: vm.meta,
        flow: vm.flow,
        currentStepIndex: vm.currentStepIndex,
        flowConflict: vm.flowConflict,
        flowCandidates: vm.flowCandidates,
        flowAlternatives: vm.flowAlternatives,
        open: preferredOpen(),
        width: settings?.sidebarWidth || 340
      });

      log("Meta:", {
        acao: meta?.acao,
        inside: meta?.isInsideProcess,
        control: meta?.isControlList,
        type: meta?.processType,
        nup: meta?.processNumber,
        id: meta?.idProcedimento,
        flow: vm.flow?.processType || null,
        conflict: vm.flowConflict,
        open: preferredOpen()
      });
    });
  }

  function scanLocal() {
    if (!globalThis.SeiFluxoDetector) return null;
    return SeiFluxoDetector.detectProcessMeta();
  }

  function scheduleScan(delay = 250) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      runScan().catch((e) => log("scan error", e));
    }, delay);
  }

  function broadcastToFrames() {
    try {
      const frames = document.querySelectorAll("iframe, frame");
      frames.forEach((f) => {
        try {
          f.contentWindow?.postMessage(
            { source: "sei-fluxo", type: MSG_REQUEST },
            "*"
          );
        } catch (_) {
          /* ignore */
        }
      });
    } catch (_) {
      /* ignore */
    }
  }

  function bindIframeLoadListeners() {
    if (!IS_TOP || iframeListenersBound) return;
    iframeListenersBound = true;

    const onFrameLoad = () => scheduleScan(200);

    const attach = (frame) => {
      try {
        frame.addEventListener("load", onFrameLoad);
      } catch (_) {
        /* ignore */
      }
    };

    document.querySelectorAll("iframe, frame").forEach(attach);

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeName === "IFRAME" || node.nodeName === "FRAME") {
            attach(node);
            scheduleScan(400);
          } else if (node.querySelectorAll) {
            node.querySelectorAll("iframe, frame").forEach(attach);
          }
        });
      }
    });
    const root = document.body || document.documentElement;
    if (root) {
      mo.observe(root, { childList: true, subtree: true });
    }
  }

  async function runScan() {
    const local = scanLocal();

    if (!IS_TOP) {
      // Frames só reportam se estiverem em contexto de processo
      if (
        local &&
        local.isInsideProcess &&
        (local.processType || local.processNumber || local.idProcedimento)
      ) {
        try {
          window.top.postMessage(
            { source: "sei-fluxo", type: MSG_META, meta: local },
            "*"
          );
        } catch (_) {
          /* ignore */
        }
      }
      return;
    }

    // Controle de Processos: limpa estado e esconde (não mescla com processo anterior)
    if (
      local?.isControlList ||
      local?.isInsideProcess === false ||
      SeiFluxoDetector.isControlListScreen?.(location.href, document)
    ) {
      lastMeta = local;
      hideSidebar();
      log("Controle de Processos — barra removida");
      return;
    }

    let meta = local;
    // Só mescla frames se ainda estamos dentro do processo
    if (local?.isInsideProcess && lastMeta?.isInsideProcess) {
      meta = mergeMeta(lastMeta, local);
    }

    broadcastToFrames();
    applyToSidebar(meta);
  }

  function onWindowMessage(event) {
    const data = event.data;
    if (!data || data.source !== "sei-fluxo") return;

    if (!IS_TOP && data.type === MSG_REQUEST) {
      scheduleScan(50);
      return;
    }

    if (IS_TOP && data.type === MSG_META && data.meta) {
      // Ignora meta de frame se a página top for lista
      if (
        SeiFluxoDetector.isControlListScreen?.(location.href, document) ||
        lastMeta?.isControlList
      ) {
        return;
      }
      const local = scanLocal();
      if (!local?.isInsideProcess && !data.meta.isInsideProcess) {
        hideSidebar();
        return;
      }
      const merged = mergeMeta(lastMeta || local, data.meta);
      applyToSidebar(merged);
    }
  }

  function setupObserver() {
    const root = document.body || document.documentElement;
    if (!root) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => scheduleScan(900));
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: false
    });
  }

  function openAdmin() {
    try {
      chrome.runtime.sendMessage({ type: "SEI_FLUXO_OPEN_OPTIONS" });
    } catch (e) {
      log("Falha ao abrir opções", e);
    }
  }

  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SEI_FLUXO_GET_STATUS") {
        const meta = lastMeta || scanLocal();
        buildViewModel(meta).then((vm) => {
          sendResponse({
            ok: true,
            url: location.href,
            isTop: IS_TOP,
            meta,
            flowMatched: vm.flow?.processType || null,
            flowConflict: !!vm.flowConflict,
            sidebarMounted: !!sidebar,
            shouldShow: shouldShowSidebar(meta)
          });
        });
        return true;
      }
      if (message?.type === "SEI_FLUXO_FORCE_SHOW") {
        // Só força se estiver dentro de processo
        const meta = scanLocal();
        if (shouldShowSidebar(meta)) {
          forceShow = true;
          userSidebarOpen = true;
          if (sidebar) sidebar.setOpen(true, { notify: false });
          scheduleScan(0);
          sendResponse({ ok: true, shown: true });
        } else {
          forceShow = false;
          hideSidebar();
          sendResponse({
            ok: true,
            shown: false,
            reason: "Fora de processo (Controle de Processos)"
          });
        }
        return true;
      }
      if (message?.type === "SEI_FLUXO_RESCAN") {
        scheduleScan(0);
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });
  } catch (_) {
    /* ignore */
  }

  async function initTop() {
    await loadData();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const reloadFlows = async () => {
        flows = await SeiFluxoStorage.getEffectiveFlows();
        if (lastMeta && shouldShowSidebar(lastMeta)) {
          applyToSidebar(lastMeta);
        }
      };
      if (
        changes.seiFluxo_flows ||
        changes.seiFluxo_remoteFlows ||
        changes.seiFluxo_settings
      ) {
        if (changes.seiFluxo_settings) {
          settings = {
            ...SeiFluxoStorage.DEFAULT_SETTINGS,
            ...(changes.seiFluxo_settings.newValue || {})
          };
        }
        reloadFlows();
      }
    });

    window.addEventListener("message", onWindowMessage);
    setupObserver();
    bindIframeLoadListeners();
    scheduleScan(100);

    [800, 2000, 4000, 7000].forEach((ms) => {
      setTimeout(() => scheduleScan(0), ms);
    });

    window.addEventListener("popstate", () => scheduleScan(200));
    window.addEventListener("load", () => scheduleScan(200));
    window.addEventListener("focus", () => scheduleScan(400));
    const pushState = history.pushState;
    history.pushState = function (...args) {
      const r = pushState.apply(this, args);
      scheduleScan(300);
      return r;
    };

    log("Content script ativo (top)", location.href);
  }

  async function initFrame() {
    await loadData();
    window.addEventListener("message", onWindowMessage);
    setupObserver();
    scheduleScan(150);
    [600, 2000, 5000].forEach((ms) => setTimeout(() => scheduleScan(0), ms));
  }

  function boot() {
    if (IS_TOP) {
      initTop().catch((e) => console.error("[SEI Fluxo]", e));
    } else {
      initFrame().catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
