#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const password = process.argv[2];
if (!password) {
  console.error('Usage: node create-password-hash.js "new-password"');
  process.exit(1);
}

const N = 16384, R = 8, P = 1, KEYLEN = 32;
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, KEYLEN, {
  N, r: R, p: P, maxmem: 64 * 1024 * 1024,
}).toString('hex');
console.log(`scrypt$${N}$${R}$${P}$${salt}$${hash}`);
