'use strict'
/*
 * INUTILE
 * http server
 */

// Requirements
require('dotenv').config()

const http = require('http')
const exec = require('child_process').exec
const port = process.env.PORT
const redis = require('redis')
const redisClient = redis.createClient()
const async = require('async')
const url = require('url')

// Docs: https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/
const requestHandler = (request, response) => {

  var body = [];
  request.on('error', function (err) {
    console.error(err);
  }).on('data', function (chunk) {
    body.push(chunk);
  }).on('end', function () {
    body = Buffer.concat(body).toString();
    // At this point, we have the headers, method, url and body, and can now
    // do whatever we need to in order to respond to this request.
    const parsedUrl = url.parse(request.url, true);
    // Get path info from redis
    redisClient.hgetall(`vhost:${request.headers.host}:${parsedUrl.pathname}`, (errRedis, resVhost) => {
      if (errRedis) {
        response.statusCode = 500;
        response.end('redis error')
      } else if ((!resVhost) || (resVhost.method !== request.method)) {
        response.statusCode = 404;
        response.end('not found')
      } else {
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
          if (err) {
            response.statusCode = 500;
            response.end(err)
          } else {
            response.end(results)
          }
        })
      }

    });
  });
}

const server = http.createServer(requestHandler)

server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }

  console.log(`server is listening on ${port}`)
})
