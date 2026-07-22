/**
 * Catálogo de fluxos: arquivo JSON, pasta do Google Drive ou URL HTTPS.
 */
(function (root) {
  /**
   * Converte links do Google Drive (arquivo) em URL de download direto.
   */
  function normalizeCatalogUrl(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;

    if (isDriveFolderUrl(raw)) {
      return null; // pastas não têm um único download
    }

    // URL canônica de download (Google redireciona uc? para drive.usercontent.google.com)
    const toDirectDownload = (id) =>
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`;

    if (/drive\.usercontent\.google\.com\/download/i.test(raw) && /[?&]id=/i.test(raw)) {
      return raw;
    }

    if (/drive\.google\.com\/uc\?/i.test(raw) && /[?&]id=/i.test(raw)) {
      const idM = raw.match(/[?&]id=([^&]+)/i);
      if (idM) return toDirectDownload(decodeURIComponent(idM[1]));
      return raw;
    }

    let m = raw.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (m) {
      return toDirectDownload(m[1]);
    }

    m = raw.match(/drive\.google\.com\/open\?[^#]*id=([^&]+)/i);
    if (m) {
      return toDirectDownload(decodeURIComponent(m[1]));
    }

    m = raw.match(/(?:docs|drive)\.google\.com\/uc\?[^#]*id=([^&]+)/i);
    if (m) {
      return toDirectDownload(decodeURIComponent(m[1]));
    }

    m = raw.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    if (/drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com/i.test(raw) && m) {
      return toDirectDownload(m[1]);
    }

    try {
      const u = new URL(raw);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function extractDriveFileId(input) {
    const raw = String(input || "");
    let m = raw.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (m) return m[1];
    m = raw.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    return m ? m[1] : null;
  }

  function isDriveFolderUrl(input) {
    return /drive\.google\.com\/(?:drive\/)?folders\//i.test(String(input || ""));
  }

  function extractDriveFolderId(input) {
    const raw = String(input || "");
    let m = raw.match(/drive\.google\.com\/(?:drive\/)?folders\/([a-zA-Z0-9_-]+)/i);
    if (m) return m[1];
    // Alguns links usam id= em open
    if (/folders/i.test(raw) || /usp=drive_link/i.test(raw)) {
      m = raw.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
      if (m) return m[1];
    }
    return null;
  }

  function detectSourceKind(url) {
    if (isDriveFolderUrl(url)) return "folder";
    return "file";
  }

  function parseCatalogPayload(data) {
    if (Array.isArray(data)) {
      return {
        version: 1,
        institution: "",
        updatedAt: null,
        flows: data
      };
    }
    if (data && typeof data === "object" && Array.isArray(data.flows)) {
      return {
        version: data.version || 1,
        institution: String(data.institution || ""),
        updatedAt: data.updatedAt || null,
        flows: data.flows
      };
    }
    throw new Error(
      "JSON inválido. Use um array de fluxos ou um objeto { \"flows\": [ ... ] }."
    );
  }

  /**
   * Título exibido do fluxo: nome específico (flowName) ou, se vazio, o tipo SEI.
   */
  function flowDisplayName(flow) {
    const specific = String(flow?.flowName || "").trim();
    if (specific) return specific;
    return String(flow?.processType || "").trim() || "Fluxo";
  }

  function cleanFlow(f, i) {
    const gen =
      (root.SeiFluxoStorage && root.SeiFluxoStorage.generateId) ||
      ((p) => `${p}-${i}-${Date.now()}`);
    const processType = String(f.processType || `Fluxo ${i + 1}`).trim();
    const flowName = String(f.flowName || "").trim();
    return {
      id: f.id || gen("flow"),
      processType,
      /** Nome específico do fluxo de trabalho (quando o mesmo tipo SEI tem vários fluxos) */
      flowName,
      description: String(f.description || ""),
      active: f.active !== false,
      steps: Array.isArray(f.steps)
        ? f.steps.map((s, j) => ({
            id: s.id || gen("step"),
            order: s.order || j + 1,
            name: String(s.name || `Etapa ${j + 1}`),
            description: String(s.description || ""),
            unit: String(s.unit || "")
          }))
        : []
    };
  }

  function normalizeFlows(flows) {
    if (!Array.isArray(flows)) return [];
    return flows.map(cleanFlow);
  }

  function buildCatalogDocument(flows, meta = {}) {
    return {
      version: 1,
      institution: meta.institution || "",
      updatedAt: meta.updatedAt || new Date().toISOString(),
      flows: normalizeFlows(flows)
    };
  }

  function labelFromFileName(name) {
    return String(name || "")
      .replace(/\.json$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Departamento";
  }

  /**
   * Lista arquivos .json em pasta pública do Drive
   * (embeddedfolderview + página da pasta com link de compartilhamento).
   */
  async function listJsonFilesInDriveFolder(folderId) {
    const files = [];
    const seen = new Set();

    const add = (id, name) => {
      if (!id || seen.has(id)) return;
      const n = String(name || "").trim();
      if (n && !/\.json$/i.test(n)) return;
      seen.add(id);
      files.push({
        id,
        name: n || `${id}.json`
      });
    };

    const pages = [
      `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`,
      `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}?usp=sharing`
    ];

    for (const pageUrl of pages) {
      try {
        const res = await fetch(pageUrl, {
          credentials: "omit",
          cache: "no-cache"
        });
        if (!res.ok) continue;
        const html = await res.text();
        parseDriveFolderHtml(html, add);
        if (files.length) return files;
      } catch (err) {
        console.warn("[SEI Fluxo] listagem HTML falhou:", pageUrl, err);
      }
    }

    return files;
  }

  /**
   * Extrai pares id/nome de HTML do Drive (best-effort).
   */
  function parseDriveFolderHtml(html, add) {
    if (!html) return;

    // flip-entry (embeddedfolderview clássico)
    const reFlip =
      /id=["']entry-([a-zA-Z0-9_-]+)["'][\s\S]{0,800}?flip-entry-title[^>]*>([^<]*\.json)/gi;
    let m;
    while ((m = reFlip.exec(html)) !== null) {
      add(m[1], m[2].trim());
    }

    // data-id + .json próximo
    const reData =
      /data-id=["']([a-zA-Z0-9_-]{20,})["'][\s\S]{0,400}?([a-zA-Z0-9_\- .]+\.json)/gi;
    while ((m = reData.exec(html)) !== null) {
      add(m[1], m[2].trim());
    }

    // /file/d/ID/ com .json em contexto
    const reFile =
      /\/file\/d\/([a-zA-Z0-9_-]+)\/[^"']{0,200}?([a-zA-Z0-9_\- .]+\.json)/gi;
    while ((m = reFile.exec(html)) !== null) {
      add(m[1], m[2].trim());
    }

    // Blocos embutidos do Drive: "nome.json" ... "FILE_ID"
    const reEmbed =
      /"([^"]+\.json)"[\s\S]{0,120}?"([a-zA-Z0-9_-]{25,})"/gi;
    while ((m = reEmbed.exec(html)) !== null) {
      add(m[2], m[1]);
    }

    // Ordem invertida id depois nome
    const reEmbed2 =
      /"([a-zA-Z0-9_-]{25,})"[\s\S]{0,80}?"([^"]+\.json)"/gi;
    while ((m = reEmbed2.exec(html)) !== null) {
      add(m[1], m[2]);
    }

    // Último recurso: todos os file/d/ID se a página for claramente lista de json
    // (só se já achamos algum .json no HTML)
    if (/\.json/i.test(html)) {
      const reIds = /\/file\/d\/([a-zA-Z0-9_-]+)/g;
      const ids = new Set();
      while ((m = reIds.exec(html)) !== null) ids.add(m[1]);
      // sem nome confiável — só adiciona se ainda não houver arquivos
      // (evita pegar ícones/lixo se já temos entradas nomeadas)
    }
  }

  async function fetchCatalogFromUrl(userUrl) {
    if (isDriveFolderUrl(userUrl)) {
      throw new Error(
        "Este link é de pasta. Use a listagem de pasta (tipo Pasta) em vez de arquivo único."
      );
    }

    const url = normalizeCatalogUrl(userUrl);
    if (!url) {
      throw new Error(
        "URL inválida. Cole o link de compartilhamento do Google Drive ou uma URL HTTPS do JSON."
      );
    }

    let res;
    try {
      res = await fetch(url, {
        method: "GET",
        credentials: "omit",
        cache: "no-cache"
      });
    } catch (err) {
      const detail = err && err.message ? err.message : String(err);
      throw new Error(
        `Falha de rede ao baixar o JSON (${detail}). Confira o link, se o arquivo está como “Qualquer pessoa com o link — Leitor” e se a extensão tem permissão para o Google Drive.`
      );
    }

    if (!res.ok) {
      throw new Error(
        `Falha ao baixar catálogo (HTTP ${res.status}). Confira se o arquivo no Drive está como “Qualquer pessoa com o link” e se o link está correto.`
      );
    }

    const text = await res.text();
    if (/^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text)) {
      throw new Error(
        "O Drive devolveu uma página HTML em vez do JSON (comum em arquivos grandes ou sem permissão pública). Use “Qualquer pessoa com o link — Leitor”."
      );
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      throw new Error("O conteúdo baixado não é um JSON válido.");
    }

    const catalog = parseCatalogPayload(json);
    catalog.flows = normalizeFlows(catalog.flows);
    return {
      catalog,
      sourceUrl: url,
      originalUrl: userUrl,
      fetchedAt: Date.now()
    };
  }

  /**
   * Expande uma pasta do Drive em vários catálogos (um por .json).
   * Instituição vem da fonte; departamento = nome do arquivo (sem .json).
   * @returns {{ batches, errors, filesFound }}
   */
  async function fetchCatalogsFromFolder(folderUrl, institution) {
    const folderId = extractDriveFolderId(folderUrl);
    if (!folderId) {
      throw new Error(
        "Link de pasta inválido. Use algo como https://drive.google.com/drive/folders/ID"
      );
    }

    const files = await listJsonFilesInDriveFolder(folderId);
    if (!files.length) {
      throw new Error(
        "Nenhum arquivo .json encontrado na pasta. " +
          "Confira se a pasta (e os arquivos) estão como “Qualquer pessoa com o link — Leitor”. " +
          "Se a listagem falhar, use “+ Arquivo JSON” para cada JSON individualmente."
      );
    }

    const inst = String(institution || "").trim();
    const batches = [];
    const errors = [];

    for (const f of files) {
      const fileUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(f.id)}&export=download`;
      const department = labelFromFileName(f.name);
      const label = [inst, department].filter(Boolean).join(" | ") || department;
      try {
        const result = await fetchCatalogFromUrl(fileUrl);
        batches.push({
          institution: inst,
          department,
          label,
          url: fileUrl,
          flows: result.catalog.flows,
          fileName: f.name,
          fromFolder: true,
          folderUrl
        });
      } catch (err) {
        errors.push({
          label,
          institution: inst,
          department,
          url: fileUrl,
          fileName: f.name,
          error: err.message || String(err)
        });
      }
    }

    if (!batches.length) {
      const msg = errors.map((e) => `${e.fileName}: ${e.error}`).join(" | ");
      throw new Error(
        "A pasta foi listada, mas nenhum JSON válido pôde ser lido. " + msg
      );
    }

    return {
      batches,
      errors,
      filesFound: files.length,
      folderId
    };
  }

  root.SeiFluxoCatalog = {
    normalizeCatalogUrl,
    extractDriveFileId,
    extractDriveFolderId,
    isDriveFolderUrl,
    detectSourceKind,
    parseCatalogPayload,
    normalizeFlows,
    buildCatalogDocument,
    fetchCatalogFromUrl,
    listJsonFilesInDriveFolder,
    fetchCatalogsFromFolder,
    labelFromFileName,
    flowDisplayName
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
