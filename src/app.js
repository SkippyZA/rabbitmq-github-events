'use strict';

/**
 * Microservice to fix the repository created_at and pushed_at timestamps from the github push webhook and push them
 * to a RabbitMQ exchange
 */
const rx = require('rx');
const R = require('ramda');
const os = require('os');
const RxAmqplib = require('rx-amqplib');
const bodyParser = require('body-parser');
const moment = require('moment');
const restify = require('restify');
const bunyan = require('bunyan');
const config = require('./config');

// Create logger instance
const logger = bunyan.createLogger({
  name: config.SERVICE_NAME,
  streams: [
    {
      stream: process.stdout,
      level: 'debug'
    }
  ]
});

// create restify server
const app = restify.createServer({
  name: config.SERVICE_NAME,
  log: logger
});

app.use(bodyParser.json({ limit: '50mb' }));

// Init rabbitmq connection and channel
const amqpConnection$ = RxAmqplib.newConnection(config.RABBITMQ_HOST);
const channel$ = amqpConnection$
  .flatMap(R.invoker(0, 'createChannel'))
  .doOnNext(() => logger.info('Created new rabbitmq channel'));

// Assert a direct routing exchange on rabbitmq
const exchange$ = channel$
  .flatMap(channel => channel
    .assertExchange(config.RABBITMQ_EXCHANGE, config.RABBITMQ_EXCHANGE_TYPE, { durable: false }))
  .doOnNext(() => logger
    .info({ exchange: config.RABBITMQ_EXCHANGE, exchange_type: config.RABBITMQ_EXCHANGE_TYPE }, 'Asserted exchange'))
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
        .subscribe()
    );

  // Send an OK response if all went well
  events$.subscribe(() => res.send('OK!'), err => res.status(400).send(err.message));
});

/**
 * Start the server
 */
app.listen(config.PORT, () => {
  logger.info(config, config.SERVICE_NAME + ' service started');
});

