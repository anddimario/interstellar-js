'use strict';
/*
 * INUTERSTELLAR
 * commands library
 */

// Requirements
require('dotenv').config();

const querystring = require('querystring');
const exec = require('child_process').exec;
const async = require('async');
const stats = require('./stats');
const redis = require('redis');
const redisClient = redis.createClient({ url: process.env.REDIS_URL });

// Create the commands array based on defined informations
function createCommand(resVhost, body, parsedUrl, headers) {

  body = Buffer.concat(body).toString();
  // At this point, we have the headers, method, url and body, and can now
  // do whatever we need to in order to respond to this request.
  // Split the file value
  const commands = resVhost.commands.split(',');
  const tasks = [];
  const argument = {};
  // Populate arguments
  if (!resVhost.code) {
    // set headers from config
    const argumentHeaders = process.env.ARGUMENT_HEADERS.split(',');
    for (let i = 0; i < argumentHeaders.length; i++) {
      if (i === 0) {
        argument.headers = {};
      }
      // Middleware should exists
      if (headers[argumentHeaders[i]]) {
        argument.headers[argumentHeaders[i]] = headers[argumentHeaders[i]];
      }
    }
    // Pass body or querystring to commands
    if (body) {
      body = querystring.parse(body);
      argument.body = body;
    }
    if (Object.keys(parsedUrl.query).length > 0) {
      argument.querystring = parsedUrl.query;
    }
  }
  // Create task for waterfall, based on files
  for (let i = 0; i < commands.length; i++) {
    let command = `${commands[i]}`;
    // Check if the code is stored in redis and try to replace
    if (resVhost.code) {
      command = command.replace('CUSTOM_CODE', `"${resVhost.code}"`);
      // replace hostname
      command = command.replace('HOSTNAME', `${headers.host}`);
    } else { // Execute code from commands in filesystem
      command += ` '${JSON.stringify(argument)}'`;
    }
    // First task
    if (i === 0) {
      tasks.push((callback) => {
        // Exec the command and response
        exec(command, { encoding: 'utf8' }, (err, stdout, stderr) => {
          // Check if stdout return is false, or there's an error, or stderr not empty return and block the waterfall
          if (err || stderr) {
            callback(stderr || err);
          } else if (stdout.indexOf(process.env.MIDDLEWARE_OUTPUT_FAILED) !== -1) {
            const message = stdout.replace(process.env.MIDDLEWARE_OUTPUT_FAILED, '')
            callback(message);
          } else {
            callback(null, stdout);
          }

        });
      });
    } else { // other tasks
      tasks.push((previous, callback) => {
        // Store previeous Middleware result in the argument field
        // if result is different from the defined skip keyword
        if (previous.indexOf(process.env.MIDDLEWARE_OUTPUT_SKIP) === -1) {
          let splittedCommand = command.split(' ');
          let actualArgument = splittedCommand[splittedCommand.length - 1];
          actualArgument = JSON.parse(actualArgument.replace(/\'/g, '').replace('\'', ''));
          if (JSON.stringify(actualArgument.middlewares) === undefined) {
            // add this response
            actualArgument.middlewares = {};
          }
          actualArgument.middlewares[i.toString()] = previous;
          // Recreate the command
          splittedCommand.pop();
          splittedCommand = splittedCommand.toString();
          command = splittedCommand.replace(/,/g, ' ');
          command += ` '${JSON.stringify(actualArgument)}'`;

        }
        // Exec the command and response
        exec(command, { encoding: 'utf8' }, (err, stdout, stderr) => {
          // Check if stdout return is false, or there's an error, or stderr not empty return and block the waterfall
          if (err || stderr) {
            callback(stderr || err);
          } else if (stdout.indexOf(process.env.MIDDLEWARE_OUTPUT_FAILED) !== -1) {
            const message = stdout.replace(process.env.MIDDLEWARE_OUTPUT_FAILED, '')
            callback(message);
          } else {
            callback(null, stdout);
          }

        });
      });
    }
  }
  return tasks;
}

function makeExecution(request, response, hostname, parsedUrl, resVhost) {
  const body = [];
  request.on('error', function (err) {
    redisClient.set(`interstellar:logs:${hostname}:${Date.now}`, err);
  }).on('data', function (chunk) {
    body.push(chunk);
  }).on('end', function () {
    const tasks = createCommand(resVhost, body, parsedUrl, request.headers);
    async.waterfall(tasks, (err, results) => {
      // Check and set content type for response
      if (resVhost.content_type) {
        response.setHeader('Content-Type', resVhost.content_type);
      }
      if (err) {
        response.statusCode = 500;
        response.end(err);
        stats.increment(500, hostname, request.headers.host, (err) => {
          if (err) {
            return redisClient.set(`interstellar:logs:${hostname}:${Date.now}`, err);
          }
        });
      } else {
        response.end(results);
        stats.increment(500, hostname, request.headers.host, (err) => {
          if (err) {
            return redisClient.set(`interstellar:logs:${hostname}:${Date.now}`, err);
          }
        });
      }
    });
  });
}

module.exports = {
  makeExecution: makeExecution
};