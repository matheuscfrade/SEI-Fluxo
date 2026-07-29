/**
 * Detector de páginas e metadados do SEI.
 *
 * Telas importantes:
 * - procedimento_trabalhar  → processo aberto (árvore + iframes); tipo costuma
 *   estar no cabeçalho da árvore/visualização, NÃO no form de alteração.
 * - procedimento_alterar    → formulário com campo "Tipo" explícito (fácil).
 * - procedimento_controlar  → lista (não usar tipos da grade).
 */
(function (root) {
  const PROCESS_NUMBER_RE =
    /\b\d{5}\.\d{6}\/\d{4}-\d{2}\b|\b\d{4}\.\d{6}\/\d{4}-\d{2}\b|\b\d{7}\.\d{6}\/\d{4}-\d{2}\b/;

  const TIPO_LABEL_EXACT = [
    "tipo",
    "tipo do processo",
    "tipo de processo",
    "tipo processo",
    "tipo do procedimento",
    "tipo de procedimento",
    "tipo de processo / especificacao",
    "tipo de processo/especificacao"
  ];

  /** Listas onde NÃO ler tipo (muitos processos). */
  const EXCLUDE_TYPE_CONTAINERS =
    "#tblProcessosRecebidos, #tblProcessosGerados, #tblProcessosAtribuido, " +
    "#tblProcessosDetalhado, #tblProcessosTrabalho, " +
    "#divInfraAreaTabelaPaginacao, " +
    "#divConsultarProcedimentoFiltro, #fldFiltrar, " +
    "#divInfraBarraComandos, #divInfraMenuSistema, #divInfraMenubar, " +
    "#divInfraAreaTelaE #divInfraAreaTabela";

  const SEI_MARKERS = [
    "#divInfraBarraSistema",
    "#divInfraBarraComandos",
    "#divInfraBarraSistemaPadrao",
    "#divArvore",
    "#divArvoreHtml",
    "#divArvoreDocumento",
    "#tblDocumentos",
    "form[name='frmProcedimento']",
    "form[action*='controlador.php']",
    "#lnkInfraUnidade",
    ".infraBarraSistema",
    "#divInfraAreaTela",
    "#divInfraAreaGlobal",
    "#divInfraAreaTelaD",
    "#ifrArvore",
    "#ifrVisualizacao",
    "#ifrConteudoVisualizacao",
    "frameset",
    ".infraArvore"
  ];

  /**
   * Corta o valor quando o texto concatenado inclui o próximo rótulo de campo do SEI
   * (ex.: "Tipo ... Interessados ... Situação").
   *
   * Não use palavras comuns em nomes de tipo (ex.: "acompanhamento" sozinho) —
   * isso truncava tipos como "Gestão de Contrato: Acompanhamento da Execução"
   * para "Gestão de Contrato:" (issue #1).
   */
  const VALUE_STOP_RE =
    /\s+(?:interessad\w*|situa[cç][aã]o|data\s+d[eo]|[oó]rg[aã]o|n[ií]vel\s+d[eo]|anota[cç][oõ]es|observa[cç][oõ]es|hip[oó]tese|credencial|marcador|prioridade|usu[aá]rio\s+gerador|unidade\s+geradora|acompanhamento\s+especial|andamentos?|protocolo|meios?\s+de\s+acesso|acesso\s+restrito|codigo\s+de\s+barras|c[oó]digo\s+de\s+barras)\b[\s\S]*$/i;

  function normalize(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanText(el) {
    if (!el) return "";
    if (el.tagName === "SELECT") {
      const opt = el.options[el.selectedIndex];
      return opt ? String(opt.textContent || "").replace(/\s+/g, " ").trim() : "";
    }
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function safeUrl(doc = document) {
    try {
      return (doc.location && doc.location.href) || "";
    } catch (_) {
      return "";
    }
  }

  function safeHost(doc = document) {
    try {
      return (doc.location && doc.location.hostname) || "";
    } catch (_) {
      return "";
    }
  }

  function getQueryParam(url, name) {
    try {
      const u = new URL(url, location.origin);
      return u.searchParams.get(name);
    } catch (_) {
      const m = String(url).match(new RegExp("[?&]" + name + "=([^&]*)"));
      return m ? decodeURIComponent(m[1]) : null;
    }
  }

  function getAcao(url) {
    return getQueryParam(url, "acao") || "";
  }

  function getIdProcedimento(url) {
    return (
      getQueryParam(url, "id_procedimento") ||
      getQueryParam(url, "id_procedimento_atual") ||
      null
    );
  }

  function isSeiUrl(url, host) {
    const u = String(url || "");
    const h = String(host || "");
    if (/controlador\.php|procedimento_controlador|controlador_ajax\.php/i.test(u)) {
      return true;
    }
    if (/\/sei(\/|$|\?)/i.test(u)) return true;
    if (/(^|\.)sei[.\-]/i.test(h)) return true;
    if (/sei/i.test(h) && /(\.gov|\.jus|\.mp|\.leg|\.def|\.mil|\.edu|\.org)/i.test(h)) {
      return true;
    }
    return false;
  }

  function isProcessWorkScreen(url) {
    const acao = getAcao(url);
    // Telas de trabalho DENTRO de um processo (não a lista inicial)
    return /procedimento_trabalhar|procedimento_exibir|arvore_visualizar|procedimento_consultar|documento_visualizar|procedimento_enviar|procedimento_sobrestar|procedimento_anexar|procedimento_relacionar|procedimento_duplicar|andamento_|documento_receber|documento_gerar|documento_editar/i.test(
      acao
    );
  }

  function isProcessAlterScreen(url) {
    const acao = getAcao(url);
    return /procedimento_alterar|procedimento_cadastrar/i.test(acao);
  }

  function isControlListScreen(url, doc) {
    const u = String(url || "");
    const acao = getAcao(u);

    // Nunca classificar telas de trabalho/alteração como lista
    if (isProcessWorkScreen(u) || isProcessAlterScreen(u)) return false;

    // Ações típicas: Controle de Processos (home do SEI)
    if (
      /^(procedimento_controlar|procedimento_controlar_unidade|procedimento_escolher|procedimento_pesquisar|principal|infra_login|montar_menu|infra_configurar)$/i.test(
        acao
      )
    ) {
      return true;
    }
    if (/procedimento_controlar|procedimento_escolher|procedimento_pesquisar|infra_login|montar_menu/i.test(acao)) {
      return true;
    }

    // DOM da tela Controle de Processos
    try {
      const d = doc || document;
      const title = (d.title || "").toLowerCase();
      if (/controle de processos/.test(title)) return true;
      if (
        d.querySelector(
          "#tblProcessosRecebidos, #tblProcessosGerados, #tblProcessosAtribuido"
        ) &&
        !getIdProcedimento(u)
      ) {
        return true;
      }
    } catch (_) {
      /* ignore */
    }

    return false;
  }

  /**
   * Barra lateral só deve aparecer dentro de um processo aberto,
   * nunca na home / lista de controle do SEI.
   */
  function isInsideProcess(url, idProcedimento, doc) {
    const u = String(url || "");
    const acao = getAcao(u);
    const id = idProcedimento || getIdProcedimento(u);

    // Controle de Processos / home: nunca
    if (isControlListScreen(u, doc)) return false;
    if (/infra_login|montar_menu|infra_configurar|procedimento_escolher|procedimento_pesquisar|procedimento_controlar/i.test(acao)) {
      return false;
    }

    // Trabalhar / alterar / documentos do processo
    if (isProcessWorkScreen(u) || isProcessAlterScreen(u)) return true;

    // Precisa de id_procedimento (processo aberto)
    if (id) {
      if (/controlar|escolher|pesquisar|login|principal|estatistica|montar_menu/i.test(acao)) {
        return false;
      }
      return true;
    }

    return false;
  }

  function isSeiPage(doc = document) {
    try {
      const url = safeUrl(doc);
      const host = safeHost(doc);
      if (isSeiUrl(url, host)) return true;

      const title = (doc.title || "").toLowerCase();
      if (
        /\bsei\b/.test(title) ||
        title.includes("sistema eletrônico de informações") ||
        title.includes("sistema eletronico de informacoes")
      ) {
        return true;
      }

      for (const sel of SEI_MARKERS) {
        try {
          if (doc.querySelector(sel)) return true;
        } catch (_) {
          /* ignore */
        }
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function isExcludedTypeContext(el) {
    if (!el || !el.closest) return false;
    try {
      if (el.closest(EXCLUDE_TYPE_CONTAINERS)) return true;
    } catch (_) {
      /* ignore */
    }
    const row = el.closest("tr");
    if (row) {
      const inputs = row.querySelectorAll(
        "input[type='checkbox'], input[type='radio']"
      );
      if (inputs.length > 0 && row.querySelectorAll("td").length >= 5) return true;
    }
    return false;
  }

  function sanitizeProcessType(raw) {
    if (!raw) return null;
    let v = String(raw).replace(/\s+/g, " ").trim();
    if (!v) return null;

    v = v
      .replace(
        /^tipo(\s+d[oe]\s+processo|\s+d[oe]\s+procedimento|\s+processo)?\s*[:\-–]?\s*/i,
        ""
      )
      .trim();

    // Remove NUP colado no início: "00000.000001/2026-01 - Tipo..."
    v = v.replace(PROCESS_NUMBER_RE, "").replace(/^[\s\-–—|:]+/, "").trim();

    v = v.replace(VALUE_STOP_RE, "").trim();
    v = v.split(/\s*\|\s*/)[0].trim();

    // Vários "Categoria: Nome" → primeiro
    const multiCategory = v.match(
      /^([\wÀ-ú0-9 ./\-()]+?:\s*[\wÀ-ú0-9 ./\-()]+?)(?=\s+[\wÀ-ú0-9 ./\-()]+?:)/i
    );
    if (multiCategory) v = multiCategory[1].trim();

    if (v.length < 2 || v.length > 160) return null;
    if (/^https?:/i.test(v)) return null;
    if (/selecione|escolha um|carregando/i.test(v)) return null;

    const colonCount = (v.match(/:/g) || []).length;
    if (colonCount >= 3) {
      const first = v.match(/^([\wÀ-ú0-9 ./\-()]+?:\s*[^:]+?)(?=\s+[\wÀ-ú])/i);
      if (first) v = first[1].trim();
      else return null;
    }

    if ((v.match(/;/g) || []).length >= 2) return null;
    if (v.split(/\s+/).length > 18 && colonCount === 0) return null;

    return v;
  }

  function isPlausibleProcessType(value) {
    const v = sanitizeProcessType(value);
    if (!v) return false;
    const n = normalize(v);
    if (TIPO_LABEL_EXACT.includes(n)) return false;
    if (PROCESS_NUMBER_RE.test(v) && v.length < 30) return false;
    // Evita pegar nomes de documentos da árvore
    if (/^(despacho|of[ií]cio|externo|anexo|email|e-mail|parecer|termo)\b/i.test(v)) {
      return false;
    }
    return true;
  }

  function scoreTypeCandidate(value, meta) {
    let score = 0;
    const v = sanitizeProcessType(value);
    if (!v) return -999;

    if (/^[\wà-ú0-9 ./\-()]+?:/i.test(v)) score += 30;
    if (/geral\s*:/i.test(v)) score += 12;
    if (v.length >= 8 && v.length <= 100) score += 15;
    if (v.length > 120) score -= 20;

    if (meta?.label === "tipo") score += 45;
    if (meta?.label && /tipo d[oe] processo/.test(meta.label)) score += 40;
    if (meta?.label && /procedimento/.test(meta.label)) score += 20;

    if (meta?.fromHeader) score += 25;
    if (meta?.fromTree) score += 35;
    if (meta?.fromAlterForm) score += 50;
    if (meta?.fromSelect) score += 8;
    if (meta?.fromTitle) score += 15;
    if (meta?.fromList) score -= 100;
    if (meta?.fromBodyRegex) score -= 10;
    if (meta?.fromCache) score += 20;

    if (meta?.url && isProcessWorkScreen(meta.url)) score += 15;
    if (meta?.url && isProcessAlterScreen(meta.url)) score += 25;
    if (meta?.url && isControlListScreen(meta.url)) score -= 40;

    if ((v.match(/:/g) || []).length >= 2) score -= 25;

    return score;
  }

  function findTypeFromTableRows(doc) {
    const candidates = [];
    const url = safeUrl(doc);
    let rows;
    try {
      rows = doc.querySelectorAll("tr");
    } catch (_) {
      return [];
    }

    for (const row of rows) {
      if (isExcludedTypeContext(row)) continue;
      const cells = Array.from(row.querySelectorAll(":scope > td, :scope > th"));
      if (cells.length < 2) continue;

      for (let i = 0; i < cells.length - 1; i++) {
        const labelCell = cells[i];
        const valueCell = cells[i + 1];
        if (isExcludedTypeContext(labelCell)) continue;

        const labelRaw = cleanText(labelCell);
        if (!labelRaw || labelRaw.length > 60) continue;
        const labelNorm = normalize(labelRaw).replace(/:$/, "");
        if (!TIPO_LABEL_EXACT.includes(labelNorm)) continue;

        let valueRaw = valueCell.querySelector("select")
          ? cleanText(valueCell.querySelector("select"))
          : cleanText(valueCell);

        const value = sanitizeProcessType(valueRaw);
        if (!isPlausibleProcessType(value)) continue;

        candidates.push({
          value,
          score: scoreTypeCandidate(value, {
            label: labelNorm,
            fromHeader: !!row.closest(
              "#divInfraAreaTelaD, #divInfraBarraLocalizacao, #divArvoreInformacao, #divInfraAreaTela, form[name='frmProcedimento'], #divInfraAreaDados"
            ),
            fromAlterForm: isProcessAlterScreen(url),
            url
          })
        });
      }
    }
    return candidates;
  }

  function findTypeFromLabelElements(doc) {
    const candidates = [];
    const url = safeUrl(doc);
    let nodes;
    try {
      nodes = doc.querySelectorAll("label, span, strong, b, th, td");
    } catch (_) {
      return [];
    }

    for (const node of nodes) {
      if (isExcludedTypeContext(node)) continue;
      const raw = cleanText(node);
      if (!raw || raw.length > 40) continue;
      const labelNorm = normalize(raw).replace(/:$/, "");
      if (!TIPO_LABEL_EXACT.includes(labelNorm)) continue;

      let valueRaw = "";
      const sib = node.nextElementSibling;
      if (sib && !isExcludedTypeContext(sib)) valueRaw = cleanText(sib);
      else if (node.parentElement) {
        const children = Array.from(node.parentElement.children);
        const idx = children.indexOf(node);
        if (idx >= 0 && idx < children.length - 1) {
          valueRaw = cleanText(children[idx + 1]);
        }
      }
      if (!valueRaw && raw.includes(":")) {
        valueRaw = raw.slice(raw.indexOf(":") + 1);
      }

      const value = sanitizeProcessType(valueRaw);
      if (!isPlausibleProcessType(value)) continue;

      candidates.push({
        value,
        score: scoreTypeCandidate(value, {
          label: labelNorm,
          fromHeader: !!node.closest(
            "#divInfraAreaTelaD, #divInfraBarraLocalizacao, #divArvoreInformacao, form[name='frmProcedimento']"
          ),
          fromAlterForm: isProcessAlterScreen(url),
          url
        })
      });
    }
    return candidates;
  }

  function findTypeFromSelects(doc) {
    const candidates = [];
    const url = safeUrl(doc);
    const selects = doc.querySelectorAll(
      "select[name*='Tipo'], select[id*='TipoProcedimento'], select[id*='TipoProcesso'], select[name*='SelTipo'], select[id*='selTipo']"
    );
    for (const sel of selects) {
      if (isExcludedTypeContext(sel)) continue;
      const opt = sel.options[sel.selectedIndex];
      if (!opt || !opt.value || /^0*$/.test(opt.value)) continue;
      const value = sanitizeProcessType(cleanText(opt));
      if (!isPlausibleProcessType(value)) continue;
      candidates.push({
        value,
        score: scoreTypeCandidate(value, {
          fromSelect: true,
          fromAlterForm: isProcessAlterScreen(url),
          label: "tipo",
          url
        })
      });
    }
    return candidates;
  }

  /**
   * Na árvore / tela de trabalho o tipo aparece com frequência em:
   * - título da janela / barra
   * - texto ao lado do NUP
   * - atributos title de nós
   * - cabeçalho da visualização
   */
  function findTypeFromTreeAndWorkHeader(doc) {
    const candidates = [];
    const url = safeUrl(doc);

    const scopes = [];
    const push = (sel) => {
      try {
        doc.querySelectorAll(sel).forEach((el) => scopes.push(el));
      } catch (_) {
        /* ignore */
      }
    };

    push("#divArvore");
    push("#divArvoreHtml");
    push("#divArvoreDocumento");
    push("#divArvoreInformacao");
    push("#divInfraBarraLocalizacao");
    push("#divInfraAreaTelaD");
    push("#divInfraBarraSistema");
    push("#divInformacao");
    push("#divProcedimento");
    push(".infraArvore");
    push("#ifrConteudoVisualizacao");

    // Título do documento: "SEI - 00000... - Geral: Pedidos..."
    try {
      const title = (doc.title || "").trim();
      if (title) {
        const m = title.match(
          /(\d{5}\.\d{6}\/\d{4}-\d{2}|\d{4}\.\d{6}\/\d{4}-\d{2})\s*[\-–—|]\s*(.+)$/
        );
        if (m && m[2]) {
          const value = sanitizeProcessType(
            m[2].replace(/\s*[-–—]\s*SEI.*$/i, "")
          );
          if (isPlausibleProcessType(value)) {
            candidates.push({
              value,
              score: scoreTypeCandidate(value, {
                fromTitle: true,
                fromTree: true,
                url
              })
            });
          }
        }
      }
    } catch (_) {
      /* ignore */
    }

    for (const el of scopes) {
      if (!el || isExcludedTypeContext(el)) continue;

      // title= em links da árvore (processo raiz)
      try {
        const links = el.querySelectorAll("a[title], span[title], img[title]");
        for (const a of links) {
          const t = (a.getAttribute("title") || "").replace(/\s+/g, " ").trim();
          if (!t || t.length > 160) continue;
          // Só considera se parece tipo (tem ":" ou palavras típicas) e não é só ação
          if (!/geral\s*:|pessoal\s*:|:/i.test(t) && t.split(/\s+/).length > 12) continue;
          if (/excluir|assinatura|anexar|mover|incluir/i.test(t)) continue;
          const cleaned = sanitizeProcessType(
            t.replace(PROCESS_NUMBER_RE, "").replace(/^[\s\-–—|:]+/, "")
          );
          if (!isPlausibleProcessType(cleaned)) continue;
          const near = cleanText(a).slice(0, 80);
          const looksRoot =
            PROCESS_NUMBER_RE.test(near) ||
            PROCESS_NUMBER_RE.test(t) ||
            /procedimento|processo/i.test(a.className + " " + (a.id || ""));
          candidates.push({
            value: cleaned,
            score: scoreTypeCandidate(cleaned, {
              fromTree: true,
              fromHeader: looksRoot,
              url
            })
          });
        }
      } catch (_) {
        /* ignore */
      }

      // Texto do cabeçalho: "Tipo: xxx" ou NUP + tipo na mesma linha
      const text = (el.innerText || el.textContent || "").slice(0, 3500);
      const linePatterns = [
        /(?:^|\n)\s*Tipo\s*[:\-–]\s*([^\n\r]+)/i,
        /(?:^|\n)\s*Tipo do Processo\s*[:\-–]\s*([^\n\r]+)/i,
        /(?:^|\n)\s*Tipo de Processo\s*[:\-–]\s*([^\n\r]+)/i,
        /(\d{5}\.\d{6}\/\d{4}-\d{2}|\d{4}\.\d{6}\/\d{4}-\d{2})\s*[\-–—|:]\s*([^\n\r]{4,120})/
      ];
      for (const re of linePatterns) {
        const m = text.match(re);
        if (!m) continue;
        const raw = m[2] || m[1];
        const value = sanitizeProcessType(raw);
        if (!isPlausibleProcessType(value)) continue;
        candidates.push({
          value,
          score: scoreTypeCandidate(value, {
            label: m[2] ? "tipo" : "tipo",
            fromTree: true,
            fromHeader: true,
            url
          })
        });
      }
    }

    // span / div com id/class relacionados a tipo
    try {
      const typed = doc.querySelectorAll(
        "[id*='TipoProcedimento'], [id*='TipoProcesso'], [id*='lblTipo'], " +
          "[id*='spnTipo'], [class*='TipoProcedimento'], #divTipoProcedimento"
      );
      for (const el of typed) {
        if (isExcludedTypeContext(el)) continue;
        if (el.tagName === "SELECT") continue;
        const value = sanitizeProcessType(cleanText(el));
        if (!isPlausibleProcessType(value)) continue;
        candidates.push({
          value,
          score: scoreTypeCandidate(value, {
            label: "tipo do processo",
            fromHeader: true,
            fromTree: isProcessWorkScreen(url),
            url
          })
        });
      }
    } catch (_) {
      /* ignore */
    }

    return candidates.filter((c) => c.value);
  }

  function findTypeFromHeaderText(doc) {
    const candidates = [];
    const url = safeUrl(doc);
    const scopes = doc.querySelectorAll(
      "#divInfraBarraLocalizacao, #divInfraAreaTelaD, #divArvoreInformacao, " +
        "#divInfraAreaTela, form[name='frmProcedimento'], #divProcedimento, " +
        "#divInfraAreaDados, #divDadosProcedimento"
    );
    for (const el of scopes) {
      if (isExcludedTypeContext(el)) continue;
      const chunk = (el.innerText || "").slice(0, 2500);
      const patterns = [
        /(?:^|\n)\s*Tipo\s*[:\-–]\s*([^\n\r]+)/i,
        /(?:^|\n)\s*Tipo do Processo\s*[:\-–]\s*([^\n\r]+)/i,
        /(?:^|\n)\s*Tipo de Processo\s*[:\-–]\s*([^\n\r]+)/i
      ];
      for (const re of patterns) {
        const m = chunk.match(re);
        if (!m || !m[1]) continue;
        const value = sanitizeProcessType(m[1]);
        if (!isPlausibleProcessType(value)) continue;
        candidates.push({
          value,
          score: scoreTypeCandidate(value, {
            label: "tipo",
            fromHeader: true,
            fromBodyRegex: true,
            fromAlterForm: isProcessAlterScreen(url),
            url
          })
        });
      }
    }
    return candidates;
  }

  function pickBestType(candidates) {
    if (!candidates.length) return null;
    const map = new Map();
    for (const c of candidates) {
      if (!c?.value) continue;
      const key = normalize(c.value);
      const prev = map.get(key);
      if (!prev || c.score > prev.score) map.set(key, c);
    }
    const list = Array.from(map.values()).sort((a, b) => b.score - a.score);
    const best = list[0];
    if (!best || best.score < 20) return null;
    return { value: best.value, score: best.score };
  }

  function findProcessTypeDetailed(doc = document) {
    const candidates = []
      .concat(findTypeFromTableRows(doc))
      .concat(findTypeFromLabelElements(doc))
      .concat(findTypeFromSelects(doc))
      .concat(findTypeFromTreeAndWorkHeader(doc))
      .concat(findTypeFromHeaderText(doc));
    return pickBestType(candidates);
  }

  function findProcessType(doc = document) {
    const r = findProcessTypeDetailed(doc);
    return r ? r.value : null;
  }

  function processTypeQuality(value) {
    if (!value) return -1;
    return scoreTypeCandidate(value, { label: "tipo", fromHeader: true });
  }

  function findProcessNumber(doc = document) {
    const candidates = [
      doc.querySelector("#txtProcedimentoFormatado"),
      doc.querySelector("[id*='ProcedimentoFormatado']"),
      doc.querySelector("[id*='ProtocoloFormatado']"),
      doc.querySelector(".infraArvoreNoSelecionado"),
      doc.querySelector("#spnProtocoloProcedimento")
    ];
    for (const el of candidates) {
      if (!el || isExcludedTypeContext(el)) continue;
      const t = cleanText(el);
      const m = t.match(PROCESS_NUMBER_RE);
      if (m) return m[0];
    }

    const titleMatch = (doc.title || "").match(PROCESS_NUMBER_RE);
    if (titleMatch) return titleMatch[0];

    try {
      const header = doc.querySelector(
        "#divInfraBarraLocalizacao, #divInfraAreaTelaD, #divArvoreInformacao, #divArvore"
      );
      if (header) {
        const m = cleanText(header).match(PROCESS_NUMBER_RE);
        if (m) return m[0];
      }
    } catch (_) {
      /* ignore */
    }

    const url = safeUrl(doc);
    if (
      isProcessWorkScreen(url) ||
      isProcessAlterScreen(url) ||
      getIdProcedimento(url)
    ) {
      const body = ((doc.body && doc.body.innerText) || "").slice(0, 5000);
      const m = body.match(PROCESS_NUMBER_RE);
      if (m) return m[0];
    }

    return null;
  }

  /**
   * Documentos same-origin, com iframes aninhados (ifrVisualizacao → conteúdo).
   */
  function scanDocuments(rootDoc = document, maxDepth = 4) {
    const docs = [];
    const seen = new Set();

    function walk(doc, depth) {
      if (!doc || depth > maxDepth) return;
      try {
        if (seen.has(doc)) return;
        seen.add(doc);
        docs.push(doc);
        const frames = doc.querySelectorAll("iframe, frame");
        for (const frame of frames) {
          try {
            const idoc = frame.contentDocument || frame.contentWindow?.document;
            if (idoc) walk(idoc, depth + 1);
          } catch (_) {
            /* cross-origin */
          }
        }
      } catch (_) {
        /* ignore */
      }
    }

    walk(rootDoc, 0);
    return docs;
  }

  function detectProcessMeta() {
    const pageUrl = safeUrl(document);
    const docs = scanDocuments(document, 4);
    let isSei = false;
    let processType = null;
    let processTypeScore = -1;
    let processNumber = null;
    let idProcedimento = getIdProcedimento(pageUrl);

    if (isSeiUrl(pageUrl, safeHost(document))) {
      isSei = true;
    }

    // URL do top (frames)
    try {
      if (!idProcedimento && window.top && window.top !== window) {
        idProcedimento = getIdProcedimento(window.top.location.href);
      }
    } catch (_) {
      /* ignore */
    }

    const controlList = isControlListScreen(pageUrl, document);
    const inside = isInsideProcess(pageUrl, idProcedimento, document);

    // Na lista de controle NÃO extrai tipo/NUP da grade (evita falso positivo)
    if (!controlList && inside) {
      for (const doc of docs) {
        const docUrl = safeUrl(doc);
        if (!idProcedimento) idProcedimento = getIdProcedimento(docUrl);

        if (isSeiPage(doc)) isSei = true;
        if (isControlListScreen(docUrl, doc)) continue;

        const detailed = findProcessTypeDetailed(doc);
        if (detailed && detailed.score > processTypeScore) {
          processType = detailed.value;
          processTypeScore = detailed.score;
        }

        if (!processNumber) processNumber = findProcessNumber(doc);
      }
    } else {
      for (const doc of docs) {
        if (isSeiPage(doc)) isSei = true;
      }
    }

    if (isProcessWorkScreen(pageUrl) || isProcessAlterScreen(pageUrl)) {
      isSei = true;
    }

    // Reavalia after possível id vindo de frames
    const insideFinal = isInsideProcess(pageUrl, idProcedimento, document);
    const controlFinal = isControlListScreen(pageUrl, document) || !insideFinal;

    return {
      isSei,
      processType: insideFinal ? processType : null,
      processTypeScore: insideFinal ? processTypeScore : -1,
      processNumber: insideFinal ? processNumber : null,
      idProcedimento: insideFinal ? idProcedimento : null,
      url: pageUrl,
      host: safeHost(document),
      acao: getAcao(pageUrl),
      isWorkScreen: isProcessWorkScreen(pageUrl),
      isAlterScreen: isProcessAlterScreen(pageUrl),
      isControlList: controlFinal,
      isInsideProcess: insideFinal && !controlFinal,
      detectedAt: Date.now()
    };
  }

  root.SeiFluxoDetector = {
    isSeiPage,
    isSeiUrl,
    isProcessWorkScreen,
    isProcessAlterScreen,
    isControlListScreen,
    isInsideProcess,
    detectProcessMeta,
    findProcessType,
    findProcessNumber,
    processTypeQuality,
    sanitizeProcessType,
    getIdProcedimento,
    getAcao,
    scanDocuments,
    PROCESS_NUMBER_RE
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
