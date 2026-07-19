#!/usr/bin/env node
// Encrypt/decrypt data/*.json using the shared passphrase in .secrets/plan-key.txt.
// Format must match the browser's Web Crypto AES-GCM implementation in index.html:
//   base64(salt:16) + ':' + base64(iv:12) + ':' + base64(ciphertext+authTag)
// Key derivation: PBKDF2-SHA256, 100000 iterations, 32-byte key.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_PATH = path.join(__dirname, '..', '.secrets', 'plan-key.txt');
const ITERATIONS = 100000;

function loadPassphrase() {
  return fs.readFileSync(KEY_PATH, 'utf8').trim();
}

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, 32, 'sha256');
}

function encrypt(plaintext) {
  const passphrase = loadPassphrase();
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([ciphertext, authTag]); // matches Web Crypto's tag-appended output
  return [salt.toString('base64'), iv.toString('base64'), combined.toString('base64')].join(':');
}

function decrypt(blob) {
  const passphrase = loadPassphrase();
  const [saltB64, ivB64, dataB64] = blob.trim().split(':');
  if (!saltB64 || !ivB64 || !dataB64) throw new Error('Malformed encrypted blob');
  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const combined = Buffer.from(dataB64, 'base64');
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(0, combined.length - 16);
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

function main() {
  const [, , mode, inputPath] = process.argv;
  if (!mode || !['encrypt', 'decrypt'].includes(mode)) {
    console.error('Usage: crypto-helper.js <encrypt|decrypt> [inputFile]  (reads stdin if no file given)');
    process.exit(1);
  }
  const input = inputPath ? fs.readFileSync(inputPath, 'utf8') : fs.readFileSync(0, 'utf8');
  const output = mode === 'encrypt' ? encrypt(input) : decrypt(input);
  process.stdout.write(output);
}

if (require.main === module) main();
module.exports = { encrypt, decrypt };
