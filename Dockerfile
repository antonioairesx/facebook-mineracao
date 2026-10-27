FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    TZ=America/Sao_Paulo

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# falha cedo se o Node da imagem nao tiver SQLite embutido
RUN node -e "require('node:sqlite')"

# falha no build se o Chromium nao estiver onde o Playwright procura
RUN node -e "const {chromium}=require('playwright');const fs=require('fs');const p=chromium.executablePath();if(!fs.existsSync(p)){console.error('Chromium ausente em '+p);process.exit(1)}"

COPY src ./src
COPY public ./public

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
