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
      // Exec the command and response
      exec(`cd ${resVhost.path} && ${execCmd} ${resVhost.file}`, {encoding: 'utf8'}, (err, stdout, stderr) => {
        if (err) {
          response.statusCode = 500;
          response.end(stderr)
        } else {
          response.end(stdout)
        }

      });
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
