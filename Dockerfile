FROM node:25-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* はビルド時にバンドルへ焼き込まれるため ARG → ENV で渡す
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_ADMIN_EMAIL

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_ADMIN_EMAIL=$NEXT_PUBLIC_ADMIN_EMAIL

RUN npm run build

FROM base AS runner
# Node.js 2026-10-21 のセキュリティリリース（CVE-2026-111497 ほか）より前の版では作らない。
# ベースイメージの取り違えやキャッシュで古い Node が入ったら、ここでビルドを止める。
RUN node -e "const m={22:[23,4],24:[22,1],26:[12,1]};const [a,b,c]=process.versions.node.split('.').map(Number);const min=m[a];const ok=a>26||(min&&(b>min[0]||(b===min[0]&&c>=min[1])));if(!ok){console.error('Node '+process.version+' は 2026-10-21 のセキュリティ修正より前か、サポート外');process.exit(1)}"
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
