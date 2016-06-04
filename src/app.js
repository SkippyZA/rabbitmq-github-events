'use strict';

/**
 * Microservice to fix the repository created_at and pushed_at timestamps from the github push webhook
 */
const rx = require('rx');
const R = require('ramda');
const bodyParser = require('body-parser');
const moment = require('moment');
const restify = require('restify');
const config = require('./config');

const app = restify.createServer();
app.use(bodyParser.json({limit: '50mb'}));

// time => ISO date string
let isoDate = t => moment(t).toISOString();
// headers => github headers
let githubHeaders = R.pick(['x-github-event', 'x-github-delivery']);
// request obj => headers + body
let getShit = R.pick(['headers', 'body']);
// req => boolean
let isPushEvent = R.compose(R.propEq('x-github-event', 'push'), githubHeaders, R.prop('headers'));
// Fixes repository dates for repository
let evolveDatesToIso = R.evolve({
    repository: {
        created_at: isoDate,
        pushed_at: isoDate
    }
});

// 
let evolvePushRequest = R.evolve({
    headers: githubHeaders,
    body: evolveDatesToIso
});

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
    const events$ = rx.Observable.merge(pushEvent$, eventsWithoutPush$);

    // Send an OK response if all went well
    events$.subscribe(() => res.send('OK!'), err => res.status(400).send(err.message));
});

/**
 * Start the server
 */
app.listen(config.PORT, () => {
    console.log('Express server listening on port ' + config.PORT);
});

