# AdHunter

Minerador da Biblioteca de Anuncios do Facebook/Meta com painel. Roda no seu servidor, sem custo de ferramenta paga.

Voce cadastra palavras-chave, ele busca anuncios ativos por pais, abre a pagina de cada anunciante, conta quantos anuncios ativos ela tem e ha quantos dias o mais antigo roda. O painel mostra tudo ordenado e marca quem passa no seu criterio (padrao: 5 anuncios ativos e 5 dias).

## Como colocar no ar (EasyPanel, sem terminal)

1. Suba esta pasta para um repositorio no GitHub (pelo site: Add file > Upload files).
2. No EasyPanel, crie um **App** novo no projeto que preferir.
3. Em **Source**, escolha GitHub e selecione o repositorio. Em **Build**, escolha **Dockerfile** (o arquivo ja esta na raiz).
4. Em **Environment**, adicione:
   - `EXTRA_USERS` (opcional) : amigos fixos, no formato `usuario:senha`, separados por virgula (ex: `joao:senha1234,maria:outra5678`). Sao recriados a cada deploy, entao nunca somem.
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

O administrador entra com `ADMIN_USER` (padrao `admin`) e `ADMIN_PASSWORD`. Os amigos entram com o usuario e a senha criados por ele. Os dados sao compartilhados. Amigos veem a lista, favoritam, anotam, exportam CSV e iniciam, param e retomam buscas e cadastram palavras-chave. Ajustes, relatorio manual, backup e acessos sao so do administrador. Bloquear ou apagar um amigo derruba a sessao dele na hora.

## Se der bloqueio

O Facebook pode pedir login ou limitar o acesso. Quando isso acontece a rodada para sozinha com status "bloqueada" e salva uma foto da tela e um trecho dos dados em **Rodadas > Arquivos de diagnostico**. Mande esses arquivos para ajustar o minerador. Rodadas menores, pausas maiores e um proxy residencial reduzem o risco.

## Aviso

O minerador le a parte publica da Biblioteca de Anuncios, que nao tem API oficial para anuncios comerciais na America Latina. A estrutura da pagina muda de tempo em tempo, entao a primeira rodada real costuma pedir um ajuste fino.

## Backup

Em **Ajustes** o administrador baixa o banco quando quiser (arquivo `.db.gz`). Para envio automatico ao Google Drive, defina no EasyPanel `BACKUP_WEBHOOK_URL` (endereco do Apps Script) e `BACKUP_KEY` (chave secreta, igual a do script). Um backup por dia sai depois das 04:30 e o script guarda os 14 mais recentes na pasta `Backups Garimpo` do Drive. O app tambem guarda os 7 mais recentes em `/data/backups`.

## Recursos de busca e triagem

- **Busca larga (padrão):** palavra com 3 ou mais termos (`bajar de peso + truco + gelatina`) busca pelos 2 primeiros e usa os demais como filtro no texto do anúncio. Em Ajustes dá para voltar para a busca exata.
- **Tipo de oferta:** classificado pelo link de destino e pelo texto do anúncio (checkout direto, VSL, quiz, página de vendas, loja, WhatsApp, app). É heurística, serve para triar.
- **Placar (0 a 100):** anúncios ativos, dias rodando, criativos distintos, anúncios novos em 7 dias, tipo de oferta e site identificado.
- **Escalando:** página que ganhou 3 ou mais anúncios desde a leitura anterior ou lançou 5 ou mais em 7 dias.
- **Prioridade:** quando as buscas não cabem na rodada, vão primeiro as palavras nunca rodadas e as que mais trouxeram páginas boas.
- **Retomar rodada:** em Rodadas, o botão retoma uma rodada interrompida, cancelada ou com erro do ponto em que parou.
- **Bloqueio:** aviso no topo do painel e pausa de 6 horas nas rodadas automáticas.
- **Etiquetas, nichos e ofertas:** filtros na aba Páginas. Miniaturas dos criativos ficam guardadas em `/data/thumbs`.
- **Relatório diário em PDF:** gerado ao fim de cada rodada concluída (`/data/reports`), ou sob demanda pelo botão Relatório PDF.
- **Navegador:** se o Chromium não estiver na máquina, o app instala sozinho na primeira rodada. No EasyPanel, use o método de construção Dockerfile.

## Telas

Início (resumo e atalhos), Páginas (lista e filtros), Busca (escolhe as palavras e inicia), Rodadas (histórico, retomar, relatórios), Palavras-chave, Ajustes e Conta. Na primeira subida o app carrega sozinho a lista pronta de palavras-chave (uma única vez).
