'use strict';
/*
 * INUTERSTELLAR
 * http server
 */

// Requirements
require('dotenv').config();

const http = require('http');
const redisClient = require('./libs/redis');
const url = require('url');
const os = require('os');
const commands = require('./libs/commands');
const auth = require('basic-auth');
const cluster = require('cluster');
const ratelimit = require('./libs/ratelimit');
const restricted = require('./libs/restricted');

// Get instance hostname
const hostname = os.hostname();

// Docs: https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/
const requestHandler = (request, response) => {
  // Get the interstellar instance state and go forward only if state is READY
  redisClient.get(`interstellar:instances:${hostname}`, (errStatus, instanceStatus) => {
    if (errStatus) {
      response.statusCode = 500;
      if (process.env.CUSTOM_RESPONSE_TYPE) {
        response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
      }
      response.end(process.env.MESSAGES_REDIS_ERROR || 'redis error');
    } else {
      if (instanceStatus !== 'ready') {
        response.statusCode = 500;
        if (process.env.CUSTOM_RESPONSE_TYPE) {
          response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
        }
        response.end(process.env.MESSAGES_NOT_READY_ERROR || 'not ready');
      } else {

        // Check if it's active the status health check
        if (process.env.HEALTH_CHECK && (request.headers[process.env.HEALTH_CHECK_TYPE] === process.env.HEALTH_CHECK_MATCH)) {
          if (process.env.CUSTOM_RESPONSE_TYPE) {
            response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
          }
          response.end(process.env.MESSAGES_HEALTH_OK || 'UP');
        } else if (process.env.HEALTH_CHECK && (process.env.HEALTH_CHECK_TYPE === 'path') && (request.url === process.env.HEALTH_CHECK_MATCH)) {
          if (process.env.CUSTOM_RESPONSE_TYPE) {
            response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
          }
          response.end(process.env.MESSAGES_HEALTH_OK || 'UP');
        } else { // normal request
          // Parse the url to get informations
          const parsedUrl = url.parse(request.url, true);
          // Get path info from redis
          redisClient.hgetall(`interstellar:vhost:${request.headers.host}:${parsedUrl.pathname}`, (errRedis, resVhost) => {
            if (errRedis) {
              response.statusCode = 500;
              if (process.env.CUSTOM_RESPONSE_TYPE) {
                response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
              }
              response.end(process.env.MESSAGES_REDIS_ERROR || 'redis error');
            } else if ((!resVhost) || (resVhost.method !== request.method)) { // not found
              response.statusCode = 404;
              if (process.env.CUSTOM_RESPONSE_TYPE) {
                response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
              }
              response.end(process.env.MESSAGES_NOT_FOUND || 'not found');
            } else if (resVhost.maintenance) { // maintenance mode
              response.statusCode = 503;
              if (process.env.CUSTOM_RESPONSE_TYPE) {
                response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
              }
              response.end(process.env.MESSAGES_MAINTENANCE_ACTIVE || 'maintenance');
            } else {
              // Check, is it's setted the basic auth
              if (resVhost.basicAuth) {
                const credentials = auth(request);
                // Check credentials
                if (!credentials) {
                  response.statusCode = 401;
                  response.setHeader('WWW-Authenticate', `Basic realm="${request.headers.host}"`);
                  response.end('Access denied');
                } else {
                  // Get password from redis for given user
                  redisClient.get(`interstellar:basic:auth:${request.headers.host}:${credentials.name}`, (err, userPassword) => {
                    if (err || !userPassword || (userPassword !== credentials.pass)) {
                      response.statusCode = 401;
                      response.setHeader('WWW-Authenticate', `Basic realm="${request.headers.host}"`);
                      response.end('Access denied');
                    } else { //go ahead
                      commands.makeExecution(request, response, hostname, parsedUrl, resVhost);
                    }
                  });
                }
              } else if (resVhost.ratelimit) {
                // Check if it's added ratelimit
                ratelimit.check(request, response, resVhost, parsedUrl, (err, allowed) => {
                  if (err) {
                    response.end(err);
                  } else {
                    // execute command
                    commands.makeExecution(request, response, hostname, parsedUrl, resVhost);
                  }
                });
              } else if (resVhost.restricted) {
                // Check if it's added restricted
                // return true if it's in
                if (restricted.check(request, resVhost.restricted)) {
                  commands.makeExecution(request, response, hostname, parsedUrl, resVhost);
                } else {
                  response.statusCode = 401;
                  response.end('Access denied');
                }
              } else { // execute normal request
                commands.makeExecution(request, response, hostname, parsedUrl, resVhost);
              }
            }

          });

        }

      }
    }

  });
};

// Register instance on redis with initial state and set expire (for health check on redis)
redisClient.set(`interstellar:instances:${hostname}`, process.env.INITIAL_STATUS);
redisClient.expire(`interstellar:instances:${hostname}`, 60);
// Refresh expire
setInterval(() => {
  redisClient.expire(`interstellar:instances:${hostname}`, 60);
}, 50000);

// Cluster mode
const numCPUs = os.cpus().length;
if (cluster.isMaster) {
  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', function (worker /*, code, signal*/) {
    const date = Date.now;
    return redisClient.set(`interstellar:logs:${hostname}:${date}`, `worker ${worker.process.pid} died`);
  });
} else {
  const server = http.createServer(requestHandler);

  server.listen(process.env.PORT, (err) => {
    if (err) {
      const date = Date.now;
      return redisClient.set(`interstellar:logs:${hostname}:${date}`, err);
    }
  });
}
