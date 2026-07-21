# Textos para a ficha da Chrome Web Store — SEI Fluxo

Copie e cole no [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## Idioma da ficha

Português (Brasil) — recomendado como principal.  
Opcional: inglês (resumo).

---

## Nome do item

```
SEI Fluxo — Demonstrador de Fluxos por Tipo de Processo
```

(Deve coincidir com o `name` do `manifest.json`.)

---

## Resumo curto (manifest `description` — máx. 132 caracteres)

Já no manifest:

```
Mostra o fluxo de etapas do tipo de processo no SEI a partir de JSON no Google Drive (arquivos e/ou pastas com vários departamentos).
```

---

## Descrição detalhada (Store listing)

```
SEI Fluxo ajuda servidores e gestores a visualizar, em uma barra lateral, o detalhamento das etapas de um fluxo de trabalho associado ao tipo de processo aberto no SEI.

IMPORTANTE
• Esta extensão NÃO é oficial do SEI nem de nenhum órgão público.
• O fluxograma NÃO reflete a etapa atual nem o histórico de tramitação do processo.
• Ele mostra apenas o detalhamento das etapas do tipo de processo identificado, conforme os fluxos JSON cadastrados na extensão (em geral no Google Drive).

COMO FUNCIONA
1. Nas Opções, informe a URL raiz do SEI da sua instituição (ex.: https://sei.sua-instituicao.gov.br) e autorize o acesso — a extensão só atua nesse site.
2. Adicione o link de um arquivo JSON ou de uma pasta do Google Drive com catálogos de fluxos (compartilhados como “qualquer pessoa com o link”).
3. Clique em “Carregar todos os fluxos”.
4. Abra um processo no SEI — a barra lateral exibe o fluxo correspondente ao tipo de processo.
5. Se houver mais de um fluxo para o mesmo tipo, você escolhe qual visualizar.

RECURSOS
• Identificação do tipo de processo na tela do SEI
• Catálogo unificado de vários departamentos/instituições
• Editor local para montar e baixar JSON de fluxos (não grava no Drive)
• Aviso claro de que o demonstrativo não é a tramitação real

PRIVACIDADE
• Dados de processo e preferências ficam no seu navegador
• Não enviamos telemetria ao desenvolvedor
• Acessamos o Google Drive apenas para baixar os catálogos que você configurou

Desenvolvido por Matheus Costa Frade.
Código aberto: https://github.com/matheuscfrade/SEI-Fluxo
```

---

## Categoria

**Produtividade** (Productivity)  
Alternativa: Ferramentas (se disponível no painel).

---

## Idioma do item

Português (Brasil)

---

## Site oficial / homepage

```
https://github.com/matheuscfrade/SEI-Fluxo
```

---

## E-mail de suporte

Use um e-mail que você monitore (o do Developer Dashboard).  
Ex.: o mesmo cadastrado na conta Google do desenvolvedor.

---

## Single purpose (campo Privacy — propósito único)

```
Exibir na barra lateral o detalhamento das etapas de fluxos de trabalho associados ao tipo de processo identificado em páginas do SEI, com base em catálogos JSON configurados pelo usuário (Google Drive).
```

---

## Justificativa de permissões

### storage

```
Armazena localmente no navegador: URLs raiz do SEI configuradas pelo usuário, links de catálogo, fluxos baixados, preferências da barra lateral e a escolha do usuário quando há mais de um fluxo para o mesmo tipo de processo. Não envia esses dados a servidores do desenvolvedor.
```

### scripting

```
Usado para registrar e injetar content scripts somente nos hosts do SEI que o usuário informou e autorizou nas Opções (chrome.scripting.registerContentScripts / executeScript). Sem URL de SEI configurada e sem permissão concedida, nenhum script de página é injetado.
```

### Host permission — drive.google.com / docs.google.com / *.googleusercontent.com

```
Necessário para baixar os arquivos JSON de fluxos a partir de links do Google Drive (arquivo ou pasta) configurados pelo usuário nas Opções. A extensão não acessa o Drive por conta própria além das URLs informadas pelo usuário.
```

### optional_host_permissions (http/https) — solicitadas sob demanda

```
O SEI é instalado em domínios diferentes por órgão/instituição. Em vez de acessar todos os sites, a extensão pede permissão em tempo de execução apenas para a(s) URL(s) raiz do SEI que o usuário cadastra nas Opções (ex.: https://sei.instituicao.gov.br/*). Content scripts são registrados dinamicamente só nesses padrões. Em qualquer outro site a extensão não injeta código de página.
```

### Remote code

```
Não. A extensão não executa código remoto. Apenas baixa dados JSON (lista de etapas de fluxo) configurados pelo usuário.
```

---

## Certificação de dados (checkboxes típicos)

Marque de forma **honesta** conforme o painel atual. Em geral para este produto:

**Dados coletados / usados (com nuances):**

- Pode marcar algo como **Website content** / conteúdo da página web **somente** se o painel exigir (a extensão lê DOM do SEI localmente).
- **Não** marca: localização precisa, histórico financeiro, saúde, autenticação, contatos, etc., se não houver coleta.

**Práticas:**

- [x] Não vendo dados de usuários
- [x] Não uso dados para crédito
- [x] Cumpro Limited Use
- [x] Transferência a terceiros só quando necessário ao propósito (aqui: apenas download do Drive configurado pelo usuário — não “venda” de dados)

Ajuste se o formulário do painel mudar as opções.

---

## Política de privacidade (URL)

Após publicar o repositório com `PRIVACY.md`:

```
https://github.com/matheuscfrade/SEI-Fluxo/blob/main/PRIVACY.md
```

Se a revisão exigir HTML “estático” sem interface do GitHub, publique o mesmo texto em GitHub Pages (`docs/` ou branch `gh-pages`) e use essa URL.

---

## Imagens obrigatórias

| Artefato | Tamanho | Obrigatório |
|----------|---------|-------------|
| Ícone da loja | 128×128 (já em `icons/icon128.png`) | Sim (via zip) |
| Screenshots | **1280×800** (preferível) ou 640×400 · 1 a 5 | Sim |
| Small promo tile | **440×280** | Sim — arquivo pronto: `store-assets/promo-small-440x280.png` |
| Marquee | 1400×560 | Opcional |

### Roteiro de screenshots (capturar no Chrome)

1. **Opções → Catálogo** com fontes configuradas e lista de fluxos carregados.  
2. **Opções → Criar fluxos (JSON)** com um fluxo de exemplo.  
3. **SEI com processo aberto** + barra lateral SEI Fluxo visível (com o aviso/disclaimer).  
4. (Opcional) Popup da extensão com status “ok”.  
5. (Opcional) Tela de conflito com 2+ fluxos para o mesmo tipo.

Dica: redimensione a janela ou use ferramenta de captura para **exatamente 1280×800**. Texto legível; sem dados sensíveis reais (use processo de teste / mascare números se necessário).

---

## Distribuição

- **Visibilidade:** Pública (ou Não listada, se quiser teste restrito).  
- **Países:** Todos, ou Brasil apenas.  
- **Taxa de desenvolvedor:** US$ 5 (uma vez) na conta Google do Chrome Web Store.  
- **2FA:** obrigatória na conta Google do desenvolvedor.
