FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev=false
COPY tsconfig.json ./
COPY src ./src
COPY brands ./brands
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
