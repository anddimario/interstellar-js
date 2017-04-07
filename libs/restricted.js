'use strict';
/*
 * INUTERSTELLAR
 * ratelimit library
 */

// Requirements

function check(request, restricted) {
  const restrictedSplitted = restricted.split(':');
  const list = restrictedSplitted[1].split(',');
  if (restrictedSplitted[0] === 'ip') {
    // Check if it's in
    if (list.indexOf(request.connection.remoteAddress) !== -1) {
      return true;
    }
  } else {
    // Check based on header (name stored in restrictedSplitted[0])
    // Check if it's in
    if (list.indexOf(request.headers[restrictedSplitted[0]]) !== -1) {
      return true;
    }
  }
  return false;
}

module.exports = {
  check: check
};