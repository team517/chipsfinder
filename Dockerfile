# ── Etapa 1: compilar la web (Vite/React) ──
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Las variables VITE_* se leen de .env.production y quedan dentro del bundle.
# (Solo llevan la dirección de Supabase y la clave publicable, que son públicas.)
COPY . .
RUN npm run build

# ── Etapa 2: servir los archivos con nginx ──
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
