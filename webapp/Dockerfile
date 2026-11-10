FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8090
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --chown=node:node package.json server.js pairing.js stremio.js stremio-media.js ./
COPY --chown=node:node public ./public
USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8090/health').then(async r=>{const d=await r.json();process.exit(r.ok&&d.service==='plezy-web'&&d.relay===true?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
