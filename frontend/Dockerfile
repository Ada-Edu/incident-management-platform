# Multi-stage build: compile the Vite SPA, then serve the static bundle with nginx.
# VITE_* values are baked into the bundle at BUILD time (they ship to the browser),
# so they are passed as build args, not runtime env.

# ---- Build stage ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Build args -> env for `vite build`.
ARG VITE_SUPABASE_URL=http://localhost:54321
ARG VITE_SUPABASE_ANON_KEY=dev-anon-key
ARG VITE_FUNCTIONS_URL=http://localhost:54321/functions/v1
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_FUNCTIONS_URL=$VITE_FUNCTIONS_URL

COPY . .
RUN npm run build

# ---- Serve stage ----------------------------------------------------------
FROM nginx:alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
