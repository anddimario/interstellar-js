'use strict';
/*
 * INUTERSTELLAR
 * set multiple maintenance mode
 * run: node scripts/maintenance type(vhost or command) string enable/disable
 * example: node scripts/maintenance vhost example.com enable
 */

// Requirements
require('dotenv').config();

const redis = require('redis');
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
const async = require('async');

if ((process.argv[2] === 'vhost') || (process.argv[2] === 'command')) {
  let iterate = true;
  let cursor = 0;
  const totalRoutes = [];
  let key = '';
  // Check if the key must have vhost
  if (process.argv[2] === 'vhost') {
    key = process.argv[3];
  }
  async.whilst(
    function () { return iterate !== false; },
    function (callback) {
      redisClient.scan(cursor, 'MATCH', `interstellar:vhost:${key}*`, (err, routes) => {
        if (err) {
          return callback(err);
        } else {
          if (routes[0] === '0') {
            // Stop when scan iteration is over
            iterate = false;
          } else {
            // Update cursor
            cursor = routes[0];
          }
          // Populate the totalTriggers
          for (let i = 0; i < routes[1].length; i++) {
            totalRoutes.push(routes[1][i]);
          }
          callback(null, 'done');
        }
      });
    },
    function (err) {
      if (err) {
        console.error(err);
        process.exit();
      } else {
        async.each(totalRoutes,
          function (route, callback) {
            // if it is passed a command, must do another Check
            if (process.argv[2] === 'command') {
              redisClient.hget(route, 'commands', (err, command) => {
                if (err) {
                  console.error(err);
                  process.exit();
                } else {
                  // check if contains
                  if (command.indexOf(process.argv[3]) !== -1) {
                    if (process.argv[4] === 'enable') {
                      // active maintenance
                      redisClient.hset(route, 'maintenance', true);
                    } else {
                      redisClient.hdel(route, 'maintenance');
                    }
                    callback(null, 'done');
                  } else {
                    callback(null, 'done');
                  }
                }
              });
            } else {
              if (process.argv[4] === 'enable') {
                // active maintenance
                redisClient.hset(route, 'maintenance', true);
              } else {
                redisClient.hdel(route, 'maintenance');
              }
              callback(null, 'done');
            }
          },
          function (err) {
            if (err) {
              console.error(err);
              process.exit();
            } else {
              console.log('done');
              process.exit();
            }
          });
      }
    }
  );
} else {
  process.exit();
}