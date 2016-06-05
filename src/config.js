module.exports = {
  SERVICE_NAME: process.env.SERVICE_NAME || 'rabbitmq-github-events',
  PORT: process.env.PORT || 8080,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  RABBITMQ_EXCHANGE_TYPE: 'direct',
  RABBITMQ_EXCHANGE: process.env.RABBITMQ_EXCHANGE || 'github-events',
  RABBITMQ_QUEUE: process.env.RABBITMQ_QUEUE || 'github-events',

  RABBITMQ_PROTOCOL: process.env.RABBITMQ_PROTOCOL || 'amqp',
  RABBITMQ_HOST: process.env.RABBITMQ_HOST || 'amqp://localhost',
  RABBITMQ_PORT: process.env.RABBITMQ_PORT || 5672,
  RABBITMQ_VHOST: process.env.RABBITMQ_VHOST || '/',
  RABBITMQ_USERNAME: process.env.RABBITMQ_USERNAME || 'guest',
  RABBITMQ_PASSWORD: process.env.RABBITMQ_PASSWORD || 'guest'
};