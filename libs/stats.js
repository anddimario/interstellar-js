'use strict';
/*
 * INUTERSTELLAR
 * stats library
 */

// Requirements
const redisClient = require('./redis');
const exec = require('child_process').exec;
const promisify = require('util').promisify;

const hgetallAsync = promisify(redisClient.hgetall).bind(redisClient);

// Increment stats on redis
async function increment(status, instance, site) {
  try {
    // Stats for instance by status
    redisClient.incr(`interstellar:stats:${instance}:${status}`);
    // Stats for instance and site by status
    redisClient.incr(`interstellar:stats:${instance}:${status}:${site}`);
    // General stats by status
    redisClient.incr(`interstellar:stats:${status}`);
    // General stats for instance and site by status
    redisClient.incr(`interstellar:stats:${status}:${site}`);
    if (process.env.TRIGGERS) {
      const triggers = await hgetallAsync('interstellar:triggers');
      if (triggers) {

        for (const i in triggers) {
          const value = triggers[i];
          const trigger = JSON.parse(value);
          // Get the key and update it 
          redisClient.incr(trigger.key);
          const runTiggerAsync = promisify(runTrigger);

          if (trigger.global) { // globalglobal
            await runTrigger(trigger);
          } else if (trigger.instance && (instance === trigger.instance)) {
            // run trigger if instance and if is actual instance that serve the request
            await runTrigger(trigger);
          } else if (trigger.status && (status === trigger.status)) {
            // if trigger is set on status and status is the actual request status
            await runTrigger(trigger);
          } else if (trigger.site && (site === trigger.site)) {
            // if trigger is set on site and site is the actual request site
            await runTrigger(trigger);
          }
        }
      }
    }
  } catch (e) {
    console.log(`${Date.now()} ${e}`);
  }
}

function runTrigger(trigger, cb) {
  // Get the key value and check thresold
  redisClient.get(trigger.key, (err, value) => {
    if (err) {
      return cb(err);
    } else {
      // Check the thresold and start command
      if (value >= trigger.thresold) {
        // un command
        exec(trigger.command, { encoding: 'utf8' }, (err, stdout, stderr) => {
          if (err || stderr || (stdout.indexOf('false') !== -1)) {
            return cb(stderr);
          } else {
            // Call function for update time based on trigger.min
            updateLastUpdateTime(trigger, (err) => {
              if (err) {
                return cb(err);
              } else {
                return cb(null, 'done');
              }
            });
          }

        });
      } else {
        // Call function for update time based on trigger.min
        updateLastUpdateTime(trigger, (err) => {
          if (err) {
            return cb(err);
          } else {
            return cb(null, 'done');
          }
        });
      }
    }
  });

}

function updateLastUpdateTime(trigger, cb) {
  // Get variable timeout
  redisClient.ttl(trigger.key, (err, ttl) => {
    if (err) {
      return cb(err);
    } else {
      // if null (key expired), redefine ttl
      if (!ttl || (ttl === -1)) {
        redisClient.expire(trigger.key, trigger.min * 60);
        return cb(null);
      }
    }
  });

}

module.exports = {
  increment: increment
};
