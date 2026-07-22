import { createClient } from '@libsql/client';
import crypto from 'crypto';

const clients = new Map();
let masterClient = null;
let envsTableReady = false;

export function getDb(prototypeId) {
  if (!prototypeId) throw new Error('getDb() requires a prototypeId — there is no default DB.');
  if (!clients.has(prototypeId)) {
    const envKey = prototypeId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const url = process.env[`TURSO_URL_${envKey}`];
    const authToken = process.env[`TURSO_TOKEN_${envKey}`];
    if (!url) {
      throw new Error(
        `No Turso database configured for "${prototypeId}". Set TURSO_URL_${envKey} and TURSO_TOKEN_${envKey} in Render's env vars.`
      );
    }
    clients.set(prototypeId, createClient({ url, authToken }));
  }
  return clients.get(prototypeId);
}

function getMasterDb() {
  if (!masterClient) {
    if (!process.env.TURSO_URL) throw new Error('TURSO_URL is not set (master DB, used for the envs table).');
    masterClient = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_TOKEN });
  }
  return masterClient;
}

async function ensureEnvsTable() {
  if (envsTableReady) return;
  const db = getMasterDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS prototype_envs (
      prototype_id TEXT NOT NULL,
      key          TEXT NOT NULL,
      value        TEXT NOT NULL,
      iv           TEXT NOT NULL,
      tag          TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      PRIMARY KEY (prototype_id, key)
    )
  `);
  envsTableReady = true;
}

function encryptionKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars)');
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    value: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

function decrypt(value, iv, tag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(value, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

export async function setEnv(prototypeId, key, value) {
  await ensureEnvsTable();
  const db = getMasterDb();
  const enc = encrypt(value);
  await db.execute({
    sql: `INSERT INTO prototype_envs (prototype_id, key, value, iv, tag, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(prototype_id, key) DO UPDATE SET
            value = excluded.value, iv = excluded.iv, tag = excluded.tag, updated_at = excluded.updated_at`,
    args: [prototypeId, key, enc.value, enc.iv, enc.tag, new Date().toISOString()],
  });
}

export async function getEnv(prototypeId, key) {
  await ensureEnvsTable();
  const db = getMasterDb();
  const res = await db.execute({
    sql: `SELECT value, iv, tag FROM prototype_envs WHERE prototype_id = ? AND key = ?`,
    args: [prototypeId, key],
  });
  if (!res.rows.length) return undefined;
  const row = res.rows[0];
  return decrypt(row.value, row.iv, row.tag);
}

export async function listEnvKeys(prototypeId) {
  await ensureEnvsTable();
  const db = getMasterDb();
  const res = await db.execute({
    sql: `SELECT key, updated_at FROM prototype_envs WHERE prototype_id = ? ORDER BY key`,
    args: [prototypeId],
  });
  return res.rows.map((r) => ({ key: r.key, updatedAt: r.updated_at }));
}

export async function deleteEnv(prototypeId, key) {
  await ensureEnvsTable();
  const db = getMasterDb();
  await db.execute({
    sql: `DELETE FROM prototype_envs WHERE prototype_id = ? AND key = ?`,
    args: [prototypeId, key],
  });
}

export async function deleteAllEnvsFor(prototypeId) {
  await ensureEnvsTable();
  const db = getMasterDb();
  await db.execute({
    sql: `DELETE FROM prototype_envs WHERE prototype_id = ?`,
    args: [prototypeId],
  });
}
