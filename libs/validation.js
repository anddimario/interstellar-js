'use strict';
/*
 * INUTERSTELLAR
 * validation library
 */

// Requirements
const validator = require('validator');

// If true, validation passed, so request can go ahead
function check(body, querystring, resVhost) {
  // Check if need validation
  if (resVhost.validateBody || resVhost.validateQuery) {
    const result = {
      status: true
    };
    // Get validation informations
    // For each validation, check
    if (resVhost.validateBody) {
      result.reasons = [];
      const validateBody = JSON.parse(resVhost.validateBody);
      for (let i = 0; i < validateBody.length; i++) {
        let tmpTest;
        if (validateBody[i].validator === 'isIn') { 
          // isIn has a special value
          tmpTest = validator[validateBody[i].validator](body[validateBody[i].field], validateBody[i].compare);
        } else if (validateBody[i].options) {
          // Options has extra fields
          tmpTest = validator[validateBody[i].validator](body[validateBody[i].field], validateBody[i].options);
        } else {
          // Normal validation
          tmpTest = validator[validateBody[i].validator](body[validateBody[i].field]);
        }
        // If false, valid must be false
        if (tmpTest === false) {
          result.status = false;
          result.reasons.push({field: validateBody[i].field, message: validateBody[i].message});
        }
      }
    }
    if (resVhost.validateQuery) {
      const validateQuery = JSON.parse(resVhost.validateQuery);
      for (let i = 0; i < validateQuery.length; i++) {
        let tmpTest;
        if (validateQuery[i].validator === 'isIn') { 
          // isIn has a special value
          tmpTest = validator[validateQuery[i].validator](querystring[validateQuery[i].field], validateQuery[i].compare);
        } else if (validateQuery[i].options) {
          // Options has extra fields
          tmpTest = validator[validateQuery[i].validator](querystring[validateQuery[i].field], validateQuery[i].options);
        } else {
          // Normal validation
          tmpTest = validator[validateQuery[i].validator](querystring[validateQuery[i].field]);
        }
        // If false, valid must be false
        if (tmpTest === false) {
          result.status = false;
          result.reasons.push({field: validateQuery[i].field, message: validateQuery[i].message});
        }
      }
    }
    return result;
  } else {
    return {status: true};
  }
}

module.exports = {
  check: check
};