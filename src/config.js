module.exports = {
  SERVICE_NAME: process.env.SERVICE_NAME || 'rabbitmq-github-events',
  PORT: process.env.PORT || 8080,

  RABBITMQ_EXCHANGE_TYPE: 'direct',
  RABBITMQ_EXCHANGE: process.env.RABBITMQ_EXCHANGE || 'github-events',
  RABBITMQ_QUEUE: process.env.RABBITMQ_QUEUE || 'github-events',
  RABBITMQ_HOST: process.env.RABBITMQ_HOST || 'amqp://localhost',
  RABBITMQ_VHOST: process.env.RABBITMQ_VHOST || '/'
};