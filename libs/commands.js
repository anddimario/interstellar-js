'use strict';
/*
 * INUTERSTELLAR
 * commands library
 */

// Requirements
require('dotenv').config();

const querystring = require('querystring');
const exec = require('child_process').exec;
const spawn = require('child_process').spawn;
const async = require('async');
const stats = require('./stats');
const redisClient = require('./redis');
const validation = require('./validation');
const zlib = require('zlib');
const request = require('request');

// Create the commands array based on defined informations
function createCommand(resVhost, body, parsedUrl, headers, response) {

  body = Buffer.concat(body).toString();
  // At this point, we have the headers, method, url and body, and can now
  // do whatever we need to in order to respond to this request.
  // Split the file value
  const commands = resVhost.commands.split(',');
  const tasks = [];
  const argument = {};
  // Populate arguments
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
  // Check validation
  const validationCheck = validation.check(argument.body, argument.querystring, resVhost);
  if (validationCheck.status === false) {
    response.statusCode = 500;
    response.end(`Validation errors: ${JSON.stringify(validationCheck.reasons)}`);
  }
  // Create task for waterfall, based on files
  for (let i = 0; i < commands.length; i++) {
    let command = `${commands[i]}`;
    const codeReference = `code${i}`;
    // Check if the code is stored in redis and try to replace
    if (resVhost[codeReference]) {
      command = command.replace('CUSTOM_CODE', `"${resVhost[codeReference]}"`);
    } else { // Execute code from commands in filesystem
      command += ` '${JSON.stringify(argument)}'`;
    }
    // First task
    if (i === 0) {
      if (resVhost[codeReference]) {
        // replace variables in code
        command = command.replace(/INTERSTELLAR.VARIABLES/g, `${encodeURIComponent(JSON.stringify(argument).toString())}`);
      }
      if (resVhost.type === 'job') {
        // Need split because spawn required it
        const splittedCommand = command.split(' ');
        tasks.push((callback) => {
          const child = spawn(splittedCommand[0], [splittedCommand[1], splittedCommand[2]], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
          callback(null, 'done');
        });
      } else if (resVhost.type === 'http') {
        tasks.push((callback) => {
          const options = {
            method: resVhost.method,
            url: resVhost.commands
          };
          console.log(body);
          if (body) {
            options.form = body;
            options.json = true;
          }
          if (querystring) {
            options.qs = body;
          }
          request(options, (err, httpResponse, resBody) => {
            if (err) {
              callback(err);
            } else {
              callback(null, resBody);
            }
          });
        });
      } else {
        tasks.push((callback) => {
          // Exec the command and response
          exec(command, { encoding: 'utf8' }, (err, stdout, stderr) => {
            // Check if stdout return is false, or there's an error, or stderr not empty return and block the waterfall
            if (err || stderr) {
              callback(stderr || err);
            } else if (stdout.indexOf(process.env.MIDDLEWARE_OUTPUT_FAILED) !== -1) {
              const message = stdout.replace(process.env.MIDDLEWARE_OUTPUT_FAILED, '');
              callback(message);
            } else {
              callback(null, stdout);
            }

          });
        });
      }
    } else { // other tasks
      tasks.push((previous, callback) => {
        // Store previous Middleware result in the argument field
        // if result is different from the defined skip keyword
        if (previous.indexOf(process.env.MIDDLEWARE_OUTPUT_SKIP) === -1) {
          // Check if the code is stored in redis and try to replace
          if (resVhost[codeReference]) {
            const actualArgument = argument;
            if (JSON.stringify(actualArgument.middlewares) === undefined) {
              // add this response
              actualArgument.middlewares = {};
            }
            actualArgument.middlewares[i.toString()] = previous;
            // replace variables in code
            command = command.replace(/INTERSTELLAR.VARIABLES/g, `${JSON.stringify(actualArgument)}`);
          } else {
            let splittedCommand = command.split(' ');
            let actualArgument = splittedCommand[splittedCommand.length - 1];
            actualArgument = JSON.parse(actualArgument.replace(/\'/g, ''));
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

        }
        // Exec the command and response
        exec(command, { encoding: 'utf8' }, (err, stdout, stderr) => {
          // Check if stdout return is false, or there's an error, or stderr not empty return and block the waterfall
          if (err || stderr) {
            callback(stderr || err);
          } else if (stdout.indexOf(process.env.MIDDLEWARE_OUTPUT_FAILED) !== -1) {
            const message = stdout.replace(process.env.MIDDLEWARE_OUTPUT_FAILED, '');
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
    const date = Date.now;
    redisClient.set(`interstellar:logs:${hostname}:${date}`, err);
  }).on('data', function (chunk) {
    body.push(chunk);
  }).on('end', function () {
    const tasks = createCommand(resVhost, body, parsedUrl, request.headers, response);
    async.waterfall(tasks, (err, results) => {
      // Check and set content type for response
      if (resVhost.content_type) {
        response.setHeader('Content-Type', resVhost.content_type);
      }
      if (err) {
        if (process.env.STATS) {
          stats.increment(500, hostname, request.headers.host, (err) => {
            if (err) {
              const date = Date.now;
              return redisClient.set(`interstellar:logs:${hostname}:${date}`, err);
            }
          });
        }
        response.statusCode = 500;
        response.end(err);
      } else {
        if (process.env.STATS) {
          stats.increment(200, hostname, request.headers.host, (err) => {
            if (err) {
              const date = Date.now;
              return redisClient.set(`interstellar:logs:${hostname}:${date}`, err);
            }
          });
        }
        if (process.env.GZIP) {
          response.setHeader('Content-Encoding', 'gzip');
          zlib.gzip(results, (err, res) => {
            if (err) {
              const date = Date.now;
              return redisClient.set(`interstellar:logs:${hostname}:${date}`, err);
            } else {
              response.end(res);
            }
          });
        } else {
          response.end(results);
        }
      }
    });
  });
}

module.exports = {
  makeExecution: makeExecution
};
