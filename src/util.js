'use strict';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(value) {
  return String(value == null ? '' : value)
    .replace(/([?&]api_key=)[^&\s]+/gi, '$1***')
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
    .slice(0, 500);
}

module.exports = { sleep, redact };
