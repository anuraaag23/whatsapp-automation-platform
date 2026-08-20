FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package*.json ./
RUN npm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN test -f dist/main.js && echo "Build OK: dist/main.js exists" || (echo "BUILD FAILED: dist/main.js was not created. Contents of dist/:" && ls -laR dist 2>&1 && exit 1)

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./
RUN chown -R app:app /app
USER app
EXPOSE 3001
# prisma migrate deploy applies whatever migrations in prisma/migrations/
# haven't been applied yet to DATABASE_URL, in order, non-interactively.
# Unlike `prisma db push --accept-data-loss` (the previous command here),
# it never resets, drops, or infers schema changes from a live diff — it
# only ever runs the exact, reviewed SQL files already committed to the
# repo. If it fails (e.g. a migration conflicts with the live database),
# the container fails to start rather than silently mutating data, which
# is the correct failure mode for a production boot step.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
