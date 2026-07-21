# SEI Fluxo

Extensão Chrome que mostra o **fluxo de etapas** de um tipo de processo no SEI.

## Uso simples

### Quem usa no SEI
1. Instala a extensão  
2. Em **Opções → Catálogo**, adiciona:
   - **Arquivo JSON** (um departamento), e/ou  
   - **Pasta do Drive** com vários `.json` (instituição)  
3. Clica em **Carregar todos os fluxos**  
4. Abre um processo no SEI — a barra lateral exibe o fluxo  
   (se o mesmo tipo existir em mais de um JSON, o usuário escolhe qual ver)

### Quem monta os JSON
1. Aba **Criar fluxos (JSON)** → monta → **Baixar JSON**  
2. Envia ao **Google Drive** (arquivo avulso ou pasta da instituição)  
3. Compartilha pasta/arquivos como **Qualquer pessoa com o link → Leitor**  
4. No Catálogo: link do **arquivo** ou da **pasta**  

**Pasta:** cada `.json` vira um catálogo; o nome do arquivo vira o rótulo (ex.: `RH.json` → “RH”, ou “IFMG / RH” se a pasta tiver nome).

O editor **não grava no Drive**. Ele só gera o arquivo.

### Listagem de pasta
- Pasta e arquivos precisam estar **públicos via link**  
- Link: `https://drive.google.com/drive/folders/…`  
- Se a listagem falhar, use a opção avançada **chave da API Google Drive** (somente leitura) ou adicione os JSON um a um  

## Nome do tipo

O `processType` no JSON deve ser o **nome exato** do Tipo no SEI.

## Conflitos (mesmo tipo em mais de um arquivo)

- No SEI: aviso *ATENÇÃO…* com **todas as opções sempre visíveis** para **escolher e alternar**  
- A última escolha no navegador só define **qual opção vem marcada** na próxima visita  

## Instalação

`chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → pasta `SEI-Fluxo`

## Google Drive

- Arquivo: `https://drive.google.com/file/d/…/view?usp=sharing`  
- Pasta: `https://drive.google.com/drive/folders/…`  
- Exemplo de JSON: [`docs/catalogo-exemplo.json`](docs/catalogo-exemplo.json)

## Versão

**1.6.0** — arquivos e pastas do Drive; escolha de fluxo em conflito.
