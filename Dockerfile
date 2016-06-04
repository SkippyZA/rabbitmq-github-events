FROM node:5.11

ENV NODE_ENV production

WORKDIR /app

ADD ./src/* /app/src/
ADD package.json /app/

RUN \
  npm install --only=prod

EXPOSE 8080
CMD [ "npm", "start" ]
