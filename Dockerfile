FROM node:5.11

ENV NODE_ENV=production

npm install --only=prod

EXPOSE 8080
CMD [ "npm", "start" ]