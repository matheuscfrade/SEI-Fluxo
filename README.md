# SEI Fluxo

Extensão Chrome que mostra o **fluxo de etapas** de um tipo de processo no SEI.

## Identificação do fluxo

No SEI o usuário vê:

**Instituição | Departamento | Nome do Fluxo**

Exemplo: `IFMG | RE-DDI | Alteração de Objetivo Estratégico do PDI`

| Parte | Origem |
|--------|--------|
| **Instituição** | Campo no Catálogo (arquivo ou pasta) |
| **Departamento** | Arquivo: campo no Catálogo · Pasta: nome do `.json` |
| **Nome do Fluxo** | `flowName` no JSON (se vazio, usa `processType`) |

### Tipo SEI vs nome do fluxo

O mesmo **Tipo** no SEI pode ter **vários fluxos de trabalho**.

| Campo JSON | Função |
|------------|--------|
| **`processType`** | Chave de match — nome **exato** do Tipo no SEI |
| **`flowName`** | Nome específico deste fluxo (ex.: “Plano de Oferta de Cursos e Vagas”) |

Exemplo: dois fluxos com o mesmo tipo  
`Geral: Revisão do PDI do IFMG`, um para **Objetivo Estratégico** e outro para **POCV**.  
No SEI o usuário escolhe qual ver.

## Uso simples

### Quem usa no SEI
1. Instala a extensão  
2. Em **Opções**, informa a **URL raiz do SEI** da instituição (obrigatório) e clica em **Salvar e autorizar acesso ao SEI**  
   - Ex.: `https://sei.sua-instituicao.gov.br`  
   - A extensão **só atua nesses sites** (o Chrome pede permissão só para eles)  
3. Em **Catálogo**, adiciona:
   - **Arquivo JSON** — instituição + departamento + link, e/ou  
   - **Pasta do Drive** — instituição + link (vários `.json` = vários departamentos)  
4. Clica em **Carregar todos os fluxos**  
5. Abre um processo no SEI — a barra lateral exibe o fluxo  
   (se o mesmo tipo existir em mais de um fluxo, o usuário escolhe qual ver)

### Quem monta os JSON
1. Aba **Criar fluxos (JSON)** → preenche tipo SEI, nome do fluxo (se necessário) e etapas → **Baixar JSON**  
2. Envia ao **Google Drive** (arquivo avulso ou pasta da instituição)  
3. Compartilha pasta/arquivos como **Qualquer pessoa com o link → Leitor**  
4. No Catálogo: preenche instituição/departamento e o link  

**Pasta:** cada `.json` vira um departamento (ex.: `RE-DDI.json` → departamento `RE-DDI`).

O editor **não grava no Drive**. Ele só gera o arquivo.

### Listagem de pasta
- Pasta e arquivos precisam estar **públicos via link**  
- Link: `https://drive.google.com/drive/folders/…`  
- Se a listagem falhar, adicione os JSON um a um com **+ Arquivo JSON**

## Nome do tipo

O `processType` no JSON deve ser o **nome exato** do Tipo no SEI.

## Conflitos (mesmo tipo em mais de um fluxo)

- No SEI: aviso *ATENÇÃO…* com **todas as opções sempre visíveis** para **escolher e alternar**  
- Cada opção mostra Instituição | Departamento | Nome do Fluxo (`flowName`)  
- A última escolha no navegador só define **qual opção vem marcada** na próxima visita  

## Instalação

`chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → pasta `SEI-Fluxo`

## Google Drive

- Arquivo: `https://drive.google.com/file/d/…/view?usp=sharing`  
- Pasta: `https://drive.google.com/drive/folders/…`  
- Exemplo de JSON: [`docs/catalogo-exemplo.json`](docs/catalogo-exemplo.json)

## Autor

Desenvolvido por **Matheus Costa Frade**  
Repositório: [github.com/matheuscfrade/SEI-Fluxo](https://github.com/matheuscfrade/SEI-Fluxo)

## Versão

**1.9.0** — URL raiz do SEI obrigatória nas opções; content scripts só nos hosts autorizados.

## Privacidade

Política de privacidade: [`PRIVACY.md`](PRIVACY.md)