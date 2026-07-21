# Checklist de publicação — Chrome Web Store (SEI Fluxo)

## Veredito da auditoria (código atual)

| Área | Status | Notas |
|------|--------|--------|
| Manifest V3 | OK | `manifest_version: 3` |
| Propósito único | OK | Demonstrar etapas de fluxo por tipo de processo no SEI |
| Código legível / sem ofuscação | OK | JS plain |
| Sem remote code (MV3) | OK | Só JSON de dados do Drive |
| Ícones 16/48/128 | OK | Presentes e com tamanho correto |
| Permissões mínimas | Ajustado em 1.8.4 | Removidos `tabs`, `scripting`, `activeTab` (não usados) |
| Host permissions | Ajustado em 1.8.4+ | Drive fixo; SEI via optional_host_permissions sob demanda |
| Content scripts amplos | Resolvido em 1.9.0 | Usuário informa URL raiz do SEI; scripts só nesses hosts |
| Política de privacidade | Preparada | `PRIVACY.md` — publicar no GitHub e colar URL |
| Screenshots 1280×800 | Pendente (você) | Capturar UI real (SEI + opções) |
| Small promo 440×280 | Pendente (você) | Criar arte / use gerador |
| Conta dev + US$5 + 2FA | Pendente (você) | Dashboard Google |
| Disclaimer de não-oficial | OK | Textos da ficha + aviso na sidebar |

**Conclusão:** o projeto está **quase apto**. Com o pacote 1.8.4, privacidade e justificativas, a parte de **código/políticas** está em boa forma. A publicação **não completa** só no código: falta conta de desenvolvedor, imagens da loja e envio no dashboard.

### Risco principal de rejeição (mitigado em 1.9.0)

**Antes:** content scripts em todas as páginas.  
**Agora:** o usuário informa a URL raiz do SEI nas Opções; a extensão solicita permissão só para esse host e registra content scripts dinamicamente.  
Justificativa pronta em `docs/chrome-web-store-listing.md` (optional_host_permissions + scripting).

### Risco secundário

Nome contendo **“SEI”** — deixe explícito que **não é produto oficial** (já nos textos). Não use brasões oficiais em screenshots/promo sem autorização.

---

## O que já foi preparado neste repositório

- [x] `manifest.json` com permissões mínimas e `homepage_url`
- [x] `PRIVACY.md` (política de privacidade)
- [x] `docs/chrome-web-store-listing.md` (textos + justificativas)
- [x] Este checklist
- [x] Script `scripts/build-store-zip.ps1` → ZIP limpo para upload
- [x] Pasta de saída `dist/` (gerada no build; não versionar se preferir)

---

## Passo a passo (você no Dashboard)

### 1. Conta de desenvolvedor

1. Acesse https://chrome.google.com/webstore/devconsole  
2. Pague a taxa única de registro (US$ 5), se ainda não for dev.  
3. Ative **verificação em duas etapas** na conta Google.  
4. Preencha perfil de desenvolvedor (nome, e-mail de contato).

### 2. Publicar privacidade no GitHub

1. Faça push de `PRIVACY.md` (e docs) para `main`.  
2. Confirme URL pública:  
   `https://github.com/matheuscfrade/SEI-Fluxo/blob/main/PRIVACY.md`

### 3. Gerar o ZIP

No PowerShell, na raiz do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-store-zip.ps1
```

Saída esperada: `dist/sei-fluxo-1.8.4-chrome.zip`  
O ZIP **não** inclui `.git`, `demo/`, `docs/`, `scripts/`, `PRIVACY.md`, `README.md` (só o runtime da extensão).

### 4. Criar o item na loja

1. **Novo item** → enviar o ZIP.  
2. Preencher **Store listing** com textos de `docs/chrome-web-store-listing.md`.  
3. Enviar **1–5 screenshots** 1280×800.  
4. Enviar **small promotional image** 440×280.  
5. Aba **Privacy**:
   - single purpose  
   - justificativa de cada permissão  
   - remote code = **No**  
   - URL da privacy policy  
   - certificação de dados  
6. **Distribution**: países, visibilidade.  
7. **Submit for review**.

### 5. Após aprovação

- Testar instalação a partir da loja.  
- Para atualizar: subir versão **maior** no `manifest.json`, novo ZIP, resubmit.

---

## Pacote mínimo no ZIP (esperado)

```
manifest.json
background/service-worker.js
content/*
icons/*
options/*
popup/*
shared/*
```

---

## Testes manuais antes do envio

1. Carregar ZIP descompactado ou pasta em `chrome://extensions` (modo desenvolvedor).  
2. Opções: adicionar catálogo de exemplo / Drive de teste → carregar fluxos.  
3. Abrir processo no SEI (ou `demo/sei-simulado.html` se aplicável) → sidebar + disclaimer.  
4. Confirmar que em site aleatório (ex.: google.com) **não** aparece a barra.  
5. Popup: status e botão de atualizar.  
6. Remover/reinstalar: dados locais somem (comportamento esperado).
