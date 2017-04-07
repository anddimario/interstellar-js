'use strict';
/*
 * INUTERSTELLAR
 * ratelimit library
 */

// Requirements
const redisClient = require('./redis');
const crypto = require('crypto');
const Limiter = require('ratelimiter');

function check(request, response, resVhost, parsedUrl, cb) {
  const ratelimit = resVhost.ratelimit.split(','); // Get limit
  let reference;
  // Get reference based on limit type
  if (ratelimit[1] === 'ip') {
    reference = request.connection.remoteAddress;
  } else {
    reference = request.headers[ratelimit[1]];
  }
  // create md5 with crypto, best readable
  const md5 = crypto.createHash('md5').update(reference).digest("hex");
  const limit = new Limiter({
    id: md5,
    db: redisClient,
    duration: ratelimit[0] * 1000, // ms
    max: ratelimit[2]
  });
  limit.get(function (err, limit) {
    if (err) {
      return cb(err);
    }

    response.setHeader('X-RateLimit-Limit', limit.total);
    response.setHeader('X-RateLimit-Remaining', limit.remaining - 1);
    response.setHeader('X-RateLimit-Reset', limit.reset);

    // all good
    if (limit.remaining) {
      return cb(null, 'allowed');
    } else {
      // not good
      //const delta = (limit.reset * 1000) - Date.now() | 0;
      const after = limit.reset - (Date.now() / 1000) | 0;
      response.setHeader('Retry-After', after);
      response.statusCode = 429;
      return cb('Rate Limit reached');
    }
  });

}

module.exports = {
  check: check
};
