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
const execCmd = process.env.EXEC_CMD
const redis = require('redis')
const redisClient = redis.createClient()
const async = require('async')

// Docs: https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/

const requestHandler = (request, response) => {
  // Get path info from redis
  redisClient.hgetall(`vhost:${request.headers.host}:${request.url}`, (errRedis, resVhost) => {
    if (errRedis) {
      response.statusCode = 500;
      response.end('redis error')
    } else if (!resVhost) {
      response.statusCode = 404;
      response.end('not found')
    } else {
      // Split the file value
      const files = resVhost.file.split(',')
      let tasks = []
      // Create task for waterfall, based on files
      for (let i = 0; i < files.length; i++) {
        // First task
        if (i === 0) {
          tasks.push((callback) => {
            // Exec the command and response
            exec(`cd ${resVhost.path} && ${execCmd} ${files[i]}`, { encoding: 'utf8' }, (err, stdout, stderr) => {
              if (err) {
                callback(stderr)
              } else {
                callback(null, stdout)
              }

            })
          })
        } else { // normal task
          tasks.push((previous, callback) => {
            // Check if previous return is false
            // Gravity note: return false give on stdout: RESULT: (BOOL) false
            if (previous.indexOf('false') !== -1) {
              callback('Middleware error')
            } else {
              // Exec the command and response
              exec(`cd ${resVhost.path} && ${execCmd} ${files[i]}`, { encoding: 'utf8' }, (err, stdout, stderr) => {
                if (err) {
                  callback(stderr)
                } else {
                  callback(null, stdout)
                }

              })
            }
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
}

const server = http.createServer(requestHandler)

server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }

  console.log(`server is listening on ${port}`)
})
