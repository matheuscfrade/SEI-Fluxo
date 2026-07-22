# Política de Privacidade — SEI Fluxo

**Última atualização:** 21 de julho de 2026 (v1.9.0 — hosts SEI sob demanda)  
**Desenvolvedor:** Matheus Costa Frade  
**Extensão:** SEI Fluxo (Chrome)  
**Repositório:** https://github.com/matheuscfrade/SEI-Fluxo  
**Contato:** use Issues no repositório GitHub ou o e-mail informado na ficha do desenvolvedor na Chrome Web Store.

## 1. Visão geral

O **SEI Fluxo** é uma extensão de navegador com propósito único: **exibir o detalhamento das etapas de fluxos de trabalho associados ao tipo de processo identificado em páginas do Sistema Eletrônico de Informações (SEI)**, com base em catálogos JSON configurados pelo usuário (em geral no Google Drive).

Esta extensão **não é um produto oficial** do SEI, do governo federal nem de qualquer órgão público. Não substitui o SEI e **não reflete a etapa atual** nem o histórico de tramitação de um processo.

## 2. Dados que a extensão processa

### 2.1 Dados lidos na página (localmente no navegador)

Quando você abre um processo no SEI, a extensão pode ler **no seu navegador**, a partir do DOM da página:

- indícios de que a página é do SEI;
- **número do processo** (quando visível na tela);
- **tipo de processo** (quando identificável na tela);
- metadados de tela necessários para decidir se a barra lateral deve ser exibida.

Esses dados **não são enviados** a servidores do desenvolvedor. São usados apenas para localizar o fluxo correspondente no catálogo já carregado e exibi-lo na barra lateral.

### 2.2 Dados que você configura

Nas **Opções** da extensão, você pode informar:

- **URL(s) raiz do SEI** da sua instituição (obrigatório para a extensão atuar nas páginas do SEI);
- links de **arquivos ou pastas do Google Drive** (catálogos JSON);
- nomes de **instituição** e **departamento**;
- rascunhos de fluxos no editor local (para baixar JSON);
- preferências de interface (ex.: barra aberta/fechada);
- escolha de fluxo quando há mais de um catálogo para o mesmo tipo.

Essas informações ficam em **`chrome.storage.local`** no seu navegador.

### 2.3 Dados obtidos de fontes remotas configuradas por você

Ao clicar em carregar/atualizar catálogos (ou em sincronização automática quando já há links), a extensão baixa **arquivos JSON de fluxos** a partir das URLs que **você configurou**, tipicamente:

- `drive.google.com`
- `docs.google.com`
- conteúdo hospedado no Google Drive / Googleusercontent

O conteúdo baixado (fluxos e etapas) é armazenado **localmente** no navegador para consulta offline da última cópia.

## 3. O que a extensão **não** faz

- Não cria conta de usuário no servidor do desenvolvedor.
- Não envia dados de processos, histórico de navegação ou catálogos para o desenvolvedor.
- Não vende, aluga ou comercializa dados de usuários.
- Não exibe anúncios e não usa rastreadores de publicidade.
- Não executa código remoto: apenas **dados** JSON de catálogo (etapas de fluxo).
- Não altera documentos do SEI nem envia ações em nome do usuário no SEI.

## 4. Como os dados são usados

| Dado | Uso |
|------|-----|
| Tipo / número do processo na página | Combinar com o catálogo e mostrar o fluxograma |
| Links do Drive e metadados de fonte | Baixar e organizar catálogos de fluxos |
| Fluxos baixados | Exibir etapas na barra lateral |
| Preferências e escolha de fluxo | Lembrar configuração da interface |

Uso limitado ao **propósito único** da extensão (Limited Use da Chrome Web Store User Data Policy).

## 5. Compartilhamento com terceiros

A extensão **não compartilha** dados com o desenvolvedor.

Comunicações de rede ocorrem **somente** com os serviços que **você** indicar para carregar catálogos (em geral **Google Drive**). Nesses casos, aplicam-se também as políticas de privacidade do Google:

- https://policies.google.com/privacy

O desenvolvedor **não opera** servidor próprio de coleta de telemetria para esta extensão.

## 6. Armazenamento e retenção

- Dados de configuração e catálogos ficam no armazenamento local do Chrome (`chrome.storage.local`).
- Você pode apagá-los a qualquer momento removendo a extensão ou limpando os dados do site/extensão no Chrome.
- Não há cópia centralizada sob controle do desenvolvedor.

## 7. Segurança

- Comunicação com o Google Drive usa HTTPS.
- Não há execução de scripts baixados remotamente (Manifest V3).
- O código da extensão é legível e não ofuscado.

## 8. Permissões (resumo)

- **`storage`**: salvar catálogos, preferências, URLs do SEI e escolhas do usuário no navegador.
- **`scripting`**: registrar e injetar a barra lateral **apenas** nos sites SEI que o usuário configurou e autorizou.
- **Permissão de host opcional (por site)**: solicitada em tempo de execução somente para a(s) URL(s) raiz do SEI informadas pelo usuário. A extensão **não** injeta scripts em todas as páginas da internet.
- **Host permissions do Google Drive / Googleusercontent / drive.usercontent.google.com**: baixar os JSON de catálogo que o usuário configurou (o Google redireciona downloads para esse host).

## 9. Crianças

A extensão não é direcionada a crianças e não coleta dados de menores de forma intencional.

## 10. Alterações nesta política

Alterações relevantes serão publicadas neste arquivo no repositório, com data de atualização revisada.

## 11. Contato

Dúvidas sobre privacidade: abra uma issue em  
https://github.com/matheuscfrade/SEI-Fluxo/issues  
ou use o e-mail de suporte cadastrado na Chrome Web Store.

---

**Declaração Limited Use:** O uso das informações processadas por esta extensão adere à [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), incluindo os requisitos de Limited Use.
