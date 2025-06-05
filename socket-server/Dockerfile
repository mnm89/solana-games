FROM node:22-alpine

WORKDIR /app

COPY socket-server/package*.json ./
RUN npm install

COPY socket-server ./
RUN npm run build

EXPOSE 3001
CMD ["node", "dist/main"]
