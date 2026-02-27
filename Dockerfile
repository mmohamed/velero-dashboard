FROM node:24

WORKDIR /usr/src/app

COPY package.json ./
RUN npm i && npm ci --omit=dev

COPY . .
RUN rm -rf build coverage doc kubernetes test certs tmp .git .circleci
RUN find -type f -name ".*" -delete

EXPOSE 3000

CMD [ "node", "app.js" ]