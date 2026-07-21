(async function () {
  const btnOptions = document.getElementById("btnOptions");
  const btnSync = document.getElementById("btnSync");
  const stCatalog = document.getElementById("stCatalog");
  const stFlows = document.getElementById("stFlows");
  const stSei = document.getElementById("stSei");
  const lead = document.getElementById("lead");

  async function refresh() {
    const settings = await SeiFluxoStorage.getSettings();
    const remote = await SeiFluxoStorage.getRemoteFlows();
    const meta = await SeiFluxoStorage.getRemoteMeta();
    const nSrc = (settings.catalogSources || []).filter((s) => s.url).length;
    const sites = SeiFluxoSites.parseSeiSites(settings.seiSites || []);

    stFlows.textContent = String(remote.length);

    let sitesStatus = null;
    try {
      const res = await chrome.runtime.sendMessage({
        type: "SEI_FLUXO_SITES_STATUS"
      });
      sitesStatus = res?.status || null;
    } catch (_) {
      /* ignore */
    }

    if (!sites.length) {
      stSei.textContent = "não configurado";
      stSei.className = "bad";
      if (lead) {
        lead.textContent =
          "Obrigatório: abra as opções e informe a URL raiz do SEI da sua instituição. A extensão só atua nesse site.";
      }
    } else if (sitesStatus?.active) {
      stSei.textContent =
        sites.length === 1
          ? sites[0].baseUrl || sitesStatus.sites[0]
          : `${sites.length} sites ativos`;
      stSei.className = "ok";
      if (lead) {
        lead.textContent =
          "Catálogo do Drive nas opções. A barra no SEI usa apenas esse catálogo, só nos sites autorizados.";
      }
    } else {
      stSei.textContent = "sem permissão";
      stSei.className = "warn";
      if (lead) {
        lead.textContent =
          "URL do SEI salva, mas a permissão ainda não foi concedida. Abra as opções e clique em “Salvar e autorizar acesso ao SEI”.";
      }
    }

    if (!nSrc) {
      stCatalog.textContent = "sem arquivos";
      stCatalog.className = "warn";
    } else if (!meta?.fetchedAt || !remote.length) {
      stCatalog.textContent = `${nSrc} arquivo(s) · carregar`;
      stCatalog.className = "warn";
    } else {
      const conf = (meta.conflicts || []).length;
      stCatalog.textContent = conf
        ? `ok · ${conf} conflito(s)`
        : `ok · ${nSrc} arquivo(s)`;
      stCatalog.className = conf ? "warn" : "ok";
    }
  }

  btnOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());

  btnSync.addEventListener("click", async () => {
    const settings = await SeiFluxoStorage.getSettings();
    if (!(settings.catalogSources || []).some((s) => s.url)) {
      chrome.runtime.openOptionsPage();
      return;
    }
    btnSync.disabled = true;
    btnSync.textContent = "Carregando…";
    try {
      const { flows, meta } = await SeiFluxoStorage.syncCatalog();
      stFlows.textContent = String(flows.length);
      const conf = (meta.conflicts || []).length;
      stCatalog.textContent = conf ? `ok · ${conf} conflito(s)` : "ok";
      stCatalog.className = conf ? "warn" : "ok";
      btnSync.textContent = "Atualizado";
    } catch (err) {
      stCatalog.textContent = "erro";
      stCatalog.className = "bad";
      btnSync.textContent = "Falhou";
      console.error(err);
    }
    setTimeout(() => {
      btnSync.textContent = "Carregar / atualizar fluxos";
      btnSync.disabled = false;
    }, 1500);
  });

  await refresh();
})();
