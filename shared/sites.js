/**
 * Normalização de URL raiz do SEI → padrões de match / permissão.
 * Usado em opções, popup e service worker.
 */
(function (root) {
  /**
   * @typedef {{
   *   baseUrl: string,
   *   origin: string,
   *   matchPattern: string,
   *   display: string
   * }} SeiSite
   */

  /**
   * Converte entrada do usuário em site SEI válido.
   * Aceita com ou sem protocolo; usa https se omitido.
   * @param {string} input
   * @returns {SeiSite|null}
   */
  function normalizeSeiSiteInput(input) {
    let raw = String(input || "").trim();
    if (!raw) return null;

    // remove espaços e aspas acidentais
    raw = raw.replace(/^["']|["']$/g, "").trim();
    if (!/^https?:\/\//i.test(raw)) {
      raw = "https://" + raw;
    }

    let u;
    try {
      u = new URL(raw);
    } catch (_) {
      return null;
    }

    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;

    // match patterns do Chrome não aceitam userinfo / porta estranha de forma flexível
    // Mantemos host (+ porta se houver)
    const origin = u.origin; // inclui porta se não-padrão

    let path = u.pathname || "/";
    // normaliza trailing slash (exceto raiz)
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    // base canônica sem query/hash
    const baseUrl = path === "/" ? origin : `${origin}${path}`;

    // padrão de content script / host permission
    // raiz do host → origin/*
    // com path (ex.: /sei) → origin/sei/*
    const matchPattern =
      path === "/" || path === ""
        ? `${origin}/*`
        : `${origin}${path}/*`;

    return {
      baseUrl,
      origin,
      matchPattern,
      display: baseUrl
    };
  }

  /**
   * Aceita array de strings ou texto com uma URL por linha.
   * @param {string|string[]} value
   * @returns {SeiSite[]}
   */
  function parseSeiSites(value) {
    const lines = Array.isArray(value)
      ? value
      : String(value || "")
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);

    const seen = new Set();
    const out = [];
    for (const line of lines) {
      const site = normalizeSeiSiteInput(line);
      if (!site) continue;
      const key = site.matchPattern.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(site);
    }
    return out;
  }

  /**
   * @param {SeiSite[]|string[]} sites
   * @returns {string[]}
   */
  function matchPatternsFromSites(sites) {
    return parseSeiSites(
      (sites || []).map((s) =>
        typeof s === "string" ? s : s.baseUrl || s.matchPattern || ""
      )
    ).map((s) => s.matchPattern);
  }

  /**
   * @param {SeiSite[]|string[]} sites
   * @returns {string[]}
   */
  function baseUrlsFromSites(sites) {
    return parseSeiSites(
      (sites || []).map((s) =>
        typeof s === "string" ? s : s.baseUrl || s.display || ""
      )
    ).map((s) => s.baseUrl);
  }

  root.SeiFluxoSites = {
    normalizeSeiSiteInput,
    parseSeiSites,
    matchPatternsFromSites,
    baseUrlsFromSites
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
