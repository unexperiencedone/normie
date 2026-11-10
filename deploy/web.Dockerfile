# Normie website: the Next.js front end (landing page + app screens), built as a standalone server.
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
# Where the /api proxy points. Behind Caddy, /api never reaches this server (Caddy sends it straight
# to the API container), but server-side code and local runs still use it.
ARG NORMIE_API_URL=http://api:8000
ARG NEXT_PUBLIC_SITE_URL=http://localhost
ENV NORMIE_API_URL=$NORMIE_API_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
