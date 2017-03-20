'use strict'
/*
 * INUTERSTELLAR
 * http server
 */

// Requirements
require('dotenv').config()

const http = require('http')
const exec = require('child_process').exec
const port = process.env.PORT
const redis = require('redis')
const redisClient = redis.createClient({ url: process.env.REDIS_URL })
const async = require('async')
const url = require('url')
const os = require('os')

// Get instance hostname
const hostname = os.hostname()

// Docs: https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/
const requestHandler = (request, response) => {
  // Get the interstellar instance state and go forward only if state is READY
  redisClient.get(`interstellar:instances:${hostname}`, (errStatus, instanceStatus) => {
    if (errStatus) {
      response.statusCode = 500;
      if (process.env.CUSTOM_RESPONSE_TYPE) {
        response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
      }
      response.end(process.env.MESSAGES_REDIS_ERROR || 'redis error')
    } else {
      if (instanceStatus !== "ready") {
        response.statusCode = 500;
        if (process.env.CUSTOM_RESPONSE_TYPE) {
          response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
        }
        response.end(process.env.MESSAGES_NOT_READY_ERROR || 'not ready')
      } else {

        // Check if it's active the status health check
        if (process.env.HEALTH_CHECK && (request.headers[process.env.HEALTH_CHECK_TYPE] === process.env.HEALTH_CHECK_MATCH)) {
          if (process.env.CUSTOM_RESPONSE_TYPE) {
            response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
          }
          response.end(process.env.MESSAGES_HEALTH_OK || 'UP')
        } else if (process.env.HEALTH_CHECK && (process.env.HEALTH_CHECK_TYPE === 'path') && (request.url === process.env.HEALTH_CHECK_MATCH)) {
          if (process.env.CUSTOM_RESPONSE_TYPE) {
            response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
          }
          response.end(process.env.MESSAGES_HEALTH_OK || 'UP')
        } else { // normal request
          // Parse the url to get informations
          const parsedUrl = url.parse(request.url, true);
          // Get path info from redis
          redisClient.hgetall(`vhost:${request.headers.host}:${parsedUrl.pathname}`, (errRedis, resVhost) => {
            if (errRedis) {
              response.statusCode = 500;
              if (process.env.CUSTOM_RESPONSE_TYPE) {
                response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
              }
              response.end(process.env.MESSAGES_REDIS_ERROR || 'redis error')
            } else if ((!resVhost) || (resVhost.method !== request.method)) { // not found
              response.statusCode = 404;
              if (process.env.CUSTOM_RESPONSE_TYPE) {
                response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
              }
              response.end(process.env.MESSAGES_NOT_FOUND || 'not found')
            } else if (resVhost.maintenance) { // maintenance mode
              response.statusCode = 503;
              if (process.env.CUSTOM_RESPONSE_TYPE) {
                response.setHeader('Content-Type', process.env.CUSTOM_RESPONSE_TYPE);
              }
              response.end(process.env.MESSAGES_MAINTENANCE_ACTIVE || 'maintenance')
            } else {
              var body = [];
              request.on('error', function (err) {
                console.error(err);
              }).on('data', function (chunk) {
                body.push(chunk);
              }).on('end', function () {
                body = Buffer.concat(body).toString();
                // At this point, we have the headers, method, url and body, and can now
                // do whatever we need to in order to respond to this request.
                // Split the file value
                const commands = resVhost.commands.split(',')
                let tasks = []
                // Create task for waterfall, based on files
                for (let i = 0; i < commands.length; i++) {
                  let command
                  // Pass body or querystring to commands
                  if (body) {
                    command = `${commands[i]} ${body}`
                  } else if (Object.keys(parsedUrl.query).length > 0) {
                    command = `${commands[i]} ${JSON.stringify(parsedUrl.query)}`
                  } else {
                    command = `${commands[i]}`
                  }

                  // First task
                  if (i === 0) {
                    tasks.push((callback) => {
                      // Exec the command and response
                      exec(command, { encoding: 'utf8' }, (err, stdout, stderr) => {
                        // Check if stdout return is false, or there's an error, or stderr not empty return and block the waterfall
                        if (err || stderr || (stdout.indexOf('false') !== -1)) {
                          callback(stderr)
                        } else {
                          callback(null, stdout)
                        }

                      })
                    })
                  } else { // other tasks
                    tasks.push((previous, callback) => {
                      // Pass previous results
                      if (previous.indexOf("Middleware passed") === -1) {
                        command += ` '${previous}'`;
                      }
                      // Exec the command and response
                      exec(command, { encoding: 'utf8' }, (err, stdout, stderr) => {
                        // Check if stdout return is false, or there's an error, or stderr not empty return and block the waterfall
                        if (err || stderr || (stdout.indexOf('false') !== -1)) {
                          callback(stderr)
                        } else {
                          callback(null, stdout)
                        }

                      })
                    })
                  }
                }
                async.waterfall(tasks, (err, results) => {
                  // Check and set content type for response
                  if (resVhost.content_type) {
                    response.setHeader('Content-Type', resVhost.content_type);
                  }
                  if (err) {
                    response.statusCode = 500;
                    response.end(err)
                  } else {
                    response.end(results)
                  }
                })
              });
            }

          });

        }

      }
    }

  })
}

// Register instance on redis with initial state and set expire (for health check on redis)
redisClient.set(`interstellar:instances:${hostname}`, process.env.INITIAL_STATUS)
redisClient.expire(`interstellar:instances:${hostname}`, 60)
// Refresh expire
setInterval(() => {
  redisClient.expire(`interstellar:instances:${hostname}`, 60)
}, 50000)

const server = http.createServer(requestHandler)

server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }

  console.log(`server is listening on ${port}`)
})
