# Garimpo

Minerador da Biblioteca de Anuncios do Facebook/Meta com painel. Roda no seu servidor, sem custo de ferramenta paga.

Voce cadastra palavras-chave, ele busca anuncios ativos por pais, abre a pagina de cada anunciante, conta quantos anuncios ativos ela tem e ha quantos dias o mais antigo roda. O painel mostra tudo ordenado e marca quem passa no seu criterio (padrao: 5 anuncios ativos e 5 dias).

## Como colocar no ar (EasyPanel, sem terminal)

1. Suba esta pasta para um repositorio no GitHub (pelo site: Add file > Upload files).
2. No EasyPanel, crie um **App** novo no projeto que preferir.
3. Em **Source**, escolha GitHub e selecione o repositorio. Em **Build**, escolha **Dockerfile** (o arquivo ja esta na raiz).
4. Em **Environment**, adicione:
   - `ADMIN_PASSWORD` : senha do administrador (minimo 8 caracteres). Sem ela o servidor nao sobe.
   - `ADMIN_USER` : opcional, nome do administrador. Padrao: `admin`.
   - `SESSION_SECRET` : opcional, uma frase longa qualquer.
   - `TZ` : opcional, padrao `America/Sao_Paulo`.
   - `PROXY_SERVER`, `PROXY_USER`, `PROXY_PASS` : opcionais, so se o Facebook bloquear o IP da VPS.
5. Em **Mounts**, crie um volume do tipo Volume com caminho `/data`. Ali ficam o banco, o login do navegador e os arquivos de diagnostico. Sem isso voce perde tudo a cada deploy.
6. Em **Domains**, aponte um dominio para a porta `3000` (ou use o dominio gerado pelo EasyPanel). Ative HTTPS.
7. Clique em **Deploy**. O primeiro build demora alguns minutos.
8. Abra o dominio, entre com a senha, va em **Palavras-chave**, cadastre algumas e toque em **Rodar agora**.

Reserve cerca de 1 GB de memoria livre para o navegador interno.

## Como usar

- **Paginas**: lista de anunciantes. Barra com risquinho mostra onde esta o seu criterio. Clique numa linha para ver os anuncios, anotar e mudar o status. Botao de CSV exporta a lista filtrada para Excel.
- **Rodadas**: historico, registro de cada rodada e arquivos de diagnostico.
- **Palavras-chave**: cole uma lista (uma por linha, `+` entre termos), escolha idioma, nicho e paises.
- **Ajustes**: criterio minimo, ritmo, paises padrao e agenda automatica.
- **Conta**: troca da propria senha. O administrador cria os acessos dos amigos aqui, bloqueia, redefine senha e apaga.

## Acessos

O administrador entra com `ADMIN_USER` (padrao `admin`) e `ADMIN_PASSWORD`. Os amigos entram com o usuario e a senha criados por ele. Os dados sao compartilhados. Amigos veem a lista, favoritam, anotam e exportam CSV. Rodar, palavras-chave, ajustes e acessos sao so do administrador. Bloquear ou apagar um amigo derruba a sessao dele na hora.

## Se der bloqueio

O Facebook pode pedir login ou limitar o acesso. Quando isso acontece a rodada para sozinha com status "bloqueada" e salva uma foto da tela e um trecho dos dados em **Rodadas > Arquivos de diagnostico**. Mande esses arquivos para ajustar o minerador. Rodadas menores, pausas maiores e um proxy residencial reduzem o risco.

## Aviso

O minerador le a parte publica da Biblioteca de Anuncios, que nao tem API oficial para anuncios comerciais na America Latina. A estrutura da pagina muda de tempo em tempo, entao a primeira rodada real costuma pedir um ajuste fino.

## Backup

Em **Ajustes** o administrador baixa o banco quando quiser (arquivo `.db.gz`). Para envio automatico ao Google Drive, defina no EasyPanel `BACKUP_WEBHOOK_URL` (endereco do Apps Script) e `BACKUP_KEY` (chave secreta, igual a do script). Um backup por dia sai depois das 04:30 e o script guarda os 14 mais recentes na pasta `Backups Garimpo` do Drive. O app tambem guarda os 7 mais recentes em `/data/backups`.
