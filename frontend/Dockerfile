FROM node:20-alpine AS build

WORKDIR /app/backend

# Excel import templates (build-time only; frontend/public/templates/ is gitignored)
COPY backend/scripts/generateImportTemplates.js ./scripts/generateImportTemplates.js
RUN npm install --no-save xlsx@^0.18.5

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .

RUN node /app/backend/scripts/generateImportTemplates.js

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
