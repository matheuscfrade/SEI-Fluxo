(async function () {
  const btnOptions = document.getElementById("btnOptions");
  const btnSync = document.getElementById("btnSync");
  const stCatalog = document.getElementById("stCatalog");
  const stFlows = document.getElementById("stFlows");

  async function refresh() {
    const settings = await SeiFluxoStorage.getSettings();
    const remote = await SeiFluxoStorage.getRemoteFlows();
    const meta = await SeiFluxoStorage.getRemoteMeta();
    const nSrc = (settings.catalogSources || []).filter((s) => s.url).length;

    stFlows.textContent = String(remote.length);

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
