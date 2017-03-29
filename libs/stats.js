'use strict';
/*
 * INUTERSTELLAR
 * stats library
 */

// Requirements
require('dotenv').config();

const redis = require('redis');
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
const exec = require('child_process').exec;

function increment(status, instance, site, cb) {
  // Stats for instance by status
  redisClient.incr(`interstellar:stats:${instance}:${status}`);
  // Stats for instance and site by status
  redisClient.incr(`interstellar:stats:${instance}:${status}:${site}`);
  // General stats by status
  redisClient.incr(`interstellar:stats:${status}`);
  // General stats for instance and site by status
  redisClient.incr(`interstellar:stats:${status}:${site}`);
  trigger(status, instance, site, (err) => {
    if (err) {
      return cb(err);
    } else {
      return cb();
    }
  });
}

function trigger(status, instance, site, cb) {
  // Get triggers list from redis
  redisClient.keys('interstellar:triggers:*', (err, triggers) => {
    if (err) {
      return cb(err);
    } else {
      // scans triggers
      triggers.forEach(function (string) {
        // Get the key value and check thresold
        redisClient.get(string, (err, value) => {
          if (err) {
            return cb(err);
          } else {
            const trigger = JSON.parse(value);
            // Get the key and update it 
            redisClient.incr(trigger.key);
            if (trigger.global) { // global
              runTrigger(trigger, (err) => {
                return cb(err);
              });
            } else if (trigger.instance && (instance === trigger.instance)) {
              // run trigger if instance and if is actual instance that serve the request
              runTrigger(trigger, (err) => {
                return cb(err);
              });
            } else if (trigger.status && (status === trigger.status)) {
              // if trigger is set on status and status is the actual request status
              runTrigger(trigger, (err) => {
                return cb(err);
              });
            } else if (trigger.site && (site === trigger.site)) {
              // if trigger is set on site and site is the actual request site
              runTrigger(trigger, (err) => {
                return cb(err);
              });
            }
          }
        });
      });
    }
  });
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