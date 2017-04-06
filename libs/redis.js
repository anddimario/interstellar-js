require('dotenv').config();
var redis = require('redis');

var redisClient = redis.createClient({url: process.env.REDIS_URL});

redisClient.on('error', function (err) {
  console.log('Error Redis ' + err);
});
/*
redisClient.on('connect', function () {
    console.log('Redis is ready');
});
*/

// export instance
module.exports = redisClient;
