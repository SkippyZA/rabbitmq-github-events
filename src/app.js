'use strict';

/**
 * Microservice to fix the repository created_at and pushed_at timestamps from the github push webhook and push them
 * to a RabbitMQ exchange
 */
const rx = require('rx');
const R = require('ramda');
const RxAmqplib = require('rx-amqplib');
const bodyParser = require('body-parser');
const moment = require('moment');
const Restify = require('restify');
const Bunyan = require('bunyan');
const config = require('./config');

// Create logger instance
const logger = Bunyan.createLogger({
  name: config.SERVICE_NAME,
  streams: [
    {
      stream: process.stdout,
      level: config.LOG_LEVEL
    }
  ],
  serializers: {
    err: Bunyan.stdSerializers.err,
    req: Bunyan.stdSerializers.req,
    res: Bunyan.stdSerializers.res
  }
});

// create Restify server
const app = Restify.createServer({
  name: config.SERVICE_NAME,
  log: logger
});

app.pre((request, response, next) => {
  request.log.info({ req: request }, 'Incoming HTTP request');
  return next();
});

app.use(bodyParser.json({ limit: '50mb' }));

// Init rabbitmq connection and channel
const amqpConnection$ = RxAmqplib.newConnection({
  protocol: config.RABBITMQ_PROTOCOL,
  hostname: config.RABBITMQ_HOST,
  port: config.RABBITMQ_PORT,
  username: config.RABBITMQ_USERNAME,
  password: config.RABBITMQ_PASSWORD,
  vhost: config.RABBITMQ_VHOST
});

const channel$ = amqpConnection$
  .flatMap(R.invoker(0, 'createChannel'))
  .doOnNext(() => logger.info('Created new rabbitmq channel'));

// Assert a direct routing exchange on rabbitmq
const exchange$ = channel$
  .flatMap(channel => channel
    .assertExchange(config.RABBITMQ_EXCHANGE, config.RABBITMQ_EXCHANGE_TYPE, { durable: false }))
  .doOnNext(() => logger
    .info({
      exchange: config.RABBITMQ_EXCHANGE,
      exchange_type: config.RABBITMQ_EXCHANGE_TYPE,
      vhost: config.RABBITMQ_VHOST
    }, 'Asserted exchange'))
  .shareReplay();

// time => ISO date string
const isoDate = t => moment(t).toISOString();
const githubEventType = R.prop('x-github-event');
// headers => github headers
const githubHeaders = R.pick(['x-github-event', 'x-github-delivery']);
// request obj => headers + body
const getShit = R.pick(['headers', 'body']);
// req => boolean
const isPushEvent = R.compose(R.propEq('x-github-event', 'push'), githubHeaders, R.prop('headers'));
// Fixes repository dates for repository
const evolveDatesToIso = R.evolve({
  repository: {
    created_at: isoDate,
    pushed_at: isoDate
  }
});

// Fixes request
const evolvePushRequest = R.evolve({
  headers: githubHeaders,
  body: evolveDatesToIso
});


/**
 * Endpoint for github to push webhook events to.
 *
 * Route: POST -> /github/events
 */
app.post('/github/events', function (req, res) {
  // Request stream
  const req$ = rx.Observable.just(req).map(R.pick(['headers', 'body']));

  // Event stream for all events excluding the push event
  const eventsWithoutPush$ = req$.filter(R.compose(R.not, isPushEvent));

  // Github push event stream.
  const pushEvent$ = req$
    .filter(isPushEvent)
    .map(R.compose(evolvePushRequest, getShit))
    .map(event => R.merge(event.headers, event.body));

  // All Github events
  const events$ = rx.Observable.merge(pushEvent$, eventsWithoutPush$)
    .doOnNext(event =>
      exchange$
        .doOnNext(reply => reply.channel
          .publish(config.RABBITMQ_EXCHANGE, githubEventType(event), new Buffer(JSON.stringify(event))))
        .subscribe(() => {}, error => logger.error({ error: error }, 'Error publishing message to exchange'))
    );

  // Send an OK response if all went well
  events$.subscribe(() => res.send('OK!'), err => {
    res.log.error({ err: err }, 'Error while processing Github webhook event');
    res.status(400).send(err.message)
  });
});

/**
 * Start the server
 */
app.listen(config.PORT, () => {
  logger.info(config, config.SERVICE_NAME + ' service started');
});

