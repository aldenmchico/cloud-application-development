FROM node:16
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install
COPY . .
ENV PORT=8080
ENV GOOGLE_APPLICATION_CREDENTIALS='./hw8-chicoa-credentials.json'
EXPOSE ${PORT}
CMD ["npm", "start"]