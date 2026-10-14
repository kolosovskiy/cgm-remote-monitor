FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install && npx prisma generate
COPY . .
RUN npm run build
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
