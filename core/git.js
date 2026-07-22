import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as tar from 'tar';
import simpleGit from 'simple-git';
import { deleteAllEnvsFor } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ROUTES_PATH = path.join(ROOT, 'routes.json');
const GH = 'https://api.github.com';

function token() {
  const t = process.env.GITHUB_PAT;
  if (!t) throw new Error('GITHUB_PAT is not set');
  return t;
}

function ghHeaders() {
  return {
    'User-Agent': 'prototyper',
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token()}`,
  };
}

async function ghGet(url) {
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub GET ${url} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function ghPut(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub PUT ${url} failed: ${res.status} ${data?.message || ''}`);
  return data;
}

let cachedLogin = null;
export async function getMyLogin() {
  if (cachedLogin) return cachedLogin;
  const me = await ghGet(`${GH}/user`);
  cachedLogin = me.login;
  return cachedLogin;
}

const JS_LIKE = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const CSS_LIKE = new Set(['.css', '.scss', '.less']);
const HTML_LIKE = new Set(['.html', '.htm', '.xml', '.svg']);

function normalize(content, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let src = content;
  if (JS_LIKE.has(ext)) {
    src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
  } else if (CSS_LIKE.has(ext)) {
    src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  } else if (HTML_LIKE.has(ext)) {
    src = src.replace(/<!--[\s\S]*?-->/g, '');
  }
  return src.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

async function listFilesRecursive(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFilesRecursive(full, base)));
    else out.push(path.relative(base, full));
  }
  return out;
}

export async function listMyRepos() {
  const repos = await ghGet(`${GH}/user/repos?affiliation=owner&sort=updated&per_page=100`);
  return repos.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    defaultBranch: r.default_branch,
    private: r.private,
    updatedAt: r.updated_at,
  }));
}

export async function listRefs(repo) {
  const owner = await getMyLogin();
  const [branches, tags] = await Promise.all([
    ghGet(`${GH}/repos/${owner}/${repo}/branches?per_page=100`),
    ghGet(`${GH}/repos/${owner}/${repo}/tags?per_page=100`),
  ]);
  return { branches: branches.map((b) => b.name), tags: tags.map((t) => t.name) };
}

async function fetchTarballToTemp(owner, repo, ref) {
  const url = `${GH}/repos/${owner}/${repo}/tarball/${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: ghHeaders(), redirect: 'follow' });
  if (!res.ok) throw new Error(`Tarball fetch failed for ${owner}/${repo}@${ref}: ${res.status}`);

  const tmpBase = path.join(os.tmpdir(), `proto-${crypto.randomUUID()}`);
  await fs.mkdir(tmpBase, { recursive: true });
  const tarPath = path.join(tmpBase, 'src.tar.gz');

  await new Promise((resolve, reject) => {
    const dest = createWriteStream(tarPath);
    dest.on('error', reject);
    dest.on('finish', resolve);
    res.body.pipeTo(
      new WritableStream({
        write(chunk) { dest.write(chunk); },
        close() { dest.end(); },
        abort(err) { reject(err); },
      })
    ).catch(reject);
  });

  const extractDir = path.join(tmpBase, 'extracted');
  await fs.mkdir(extractDir, { recursive: true });
  await tar.x({ file: tarPath, cwd: extractDir, strip: 1 });
  await fs.rm(tarPath, { force: true });

  return { tmpBase, extractDir };
}

async function cleanupTemp(tmpBase) {
  await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
}

export async function previewImport({ owner, repo, ref, targetFolder }) {
  owner = owner || (await getMyLogin());
  const { tmpBase, extractDir } = await fetchTarballToTemp(owner, repo, ref);
  try {
    const targetPath = path.join(ROOT, targetFolder);
    const incoming = await listFilesRecursive(extractDir);

    const created = [], updated = [], unchanged = [];
    for (const rel of incoming) {
      const srcFile = path.join(extractDir, rel);
      const dstFile = path.join(targetPath, rel);
      if (!existsSync(dstFile)) { created.push(rel); continue; }
      const [a, b] = await Promise.all([
        fs.readFile(srcFile, 'utf8').catch(() => null),
        fs.readFile(dstFile, 'utf8').catch(() => null),
      ]);
      if (a === null || b === null) { updated.push(rel); continue; } // binary — assume changed, be safe
      if (normalize(a, rel) === normalize(b, rel)) unchanged.push(rel);
      else updated.push(rel);
    }
    return { created, updated, unchanged, fileCount: incoming.length };
  } finally {
    await cleanupTemp(tmpBase);
  }
}

export async function confirmImport({ owner, repo, ref, targetFolder, isNew, routeMeta, commitMessage }) {
  owner = owner || (await getMyLogin());
  const { tmpBase, extractDir } = await fetchTarballToTemp(owner, repo, ref);
  try {
    const targetPath = path.join(ROOT, targetFolder);
    await fs.mkdir(targetPath, { recursive: true });
    await fs.cp(extractDir, targetPath, { recursive: true, force: true }); // overwrite, no delete pass

    if (isNew && routeMeta) await upsertRoute(routeMeta);

    const msg = commitMessage || `${isNew ? 'Import' : 'Sync'} ${targetFolder} from ${owner}/${repo}@${ref}`;
    const result = await gitCommitAndPush(msg);
    return { ok: true, folder: targetFolder, ...result };
  } finally {
    await cleanupTemp(tmpBase);
  }
}

async function readRoutes() {
  const raw = await fs.readFile(ROUTES_PATH, 'utf8').catch(() => '{"prototypes":[]}');
  return JSON.parse(raw);
}
async function writeRoutes(data) {
  await fs.writeFile(ROUTES_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function upsertRoute(meta) {
  const data = await readRoutes();
  const idx = data.prototypes.findIndex((p) => p.id === meta.id);
  if (idx >= 0) data.prototypes[idx] = { ...data.prototypes[idx], ...meta };
  else data.prototypes.push({ addedAt: new Date().toISOString().slice(0, 10), ...meta });
  await writeRoutes(data);
}

export async function removeRoute(id) {
  const data = await readRoutes();
  data.prototypes = data.prototypes.filter((p) => p.id !== id);
  await writeRoutes(data);
}

export async function removePrototype(folderName) {
  await fs.rm(path.join(ROOT, folderName), { recursive: true, force: true });
  await removeRoute(folderName);
  await deleteAllEnvsFor(folderName).catch(() => {}); // best-effort if Turso isn't configured
  const result = await gitCommitAndPush(`Remove prototype ${folderName}`);
  return { ok: true, ...result };
}

export async function previewPush({ owner, repo, sourceFolder }) {
  owner = owner || (await getMyLogin());
  const sourcePath = path.join(ROOT, sourceFolder);
  const localFiles = await listFilesRecursive(sourcePath);

  const created = [], updated = [], unchanged = [];
  for (const rel of localFiles) {
    const ghPath = rel.split(path.sep).join('/');
    let existing = null;
    try {
      existing = await ghGet(`${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(ghPath)}`);
    } catch {  }

    if (!existing) { created.push(rel); continue; }
    const localContent = await fs.readFile(path.join(sourcePath, rel), 'utf8').catch(() => null);
    if (localContent === null) { updated.push(rel); continue; }
    const remoteContent = Buffer.from(existing.content, 'base64').toString('utf8');
    if (normalize(localContent, rel) === normalize(remoteContent, rel)) unchanged.push(rel);
    else updated.push(rel);
  }
  return { created, updated, unchanged, fileCount: localFiles.length };
}

export async function confirmPush({ owner, repo, sourceFolder, branch, commitMessage }) {
  const login = await getMyLogin();
  owner = owner || login;
  const sourcePath = path.join(ROOT, sourceFolder);
  const localFiles = await listFilesRecursive(sourcePath);
  const msg = commitMessage || 'Update files';
  let created = 0, updated = 0, failed = 0;

  for (const rel of localFiles) {
    const ghPath = rel.split(path.sep).join('/');
    const apiUrl = `${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(ghPath)}`;
    let sha;
    try {
      const existing = await ghGet(apiUrl);
      sha = existing.sha;
    } catch {  }

    try {
      const buf = await fs.readFile(path.join(sourcePath, rel));
      await ghPut(apiUrl, {
        message: msg,
        content: buf.toString('base64'),
        branch: branch || undefined,
        author: { name: login, email: `${login}@users.noreply.github.com` },
        committer: { name: login, email: `${login}@users.noreply.github.com` },
        ...(sha ? { sha } : {}),
      });
      sha ? updated++ : created++;
    } catch {
      failed++;
    }
  }
  return { created, updated, failed };
}

export async function gitCommitAndPush(message) {
  const git = simpleGit(ROOT);
  await git.addConfig('user.name', process.env.GIT_AUTHOR_NAME || 'prototyper-bot');
  await git.addConfig('user.email', process.env.GIT_AUTHOR_EMAIL || 'prototyper@bot.local');
  await git.add('.');
  const status = await git.status();
  const dirty = status.staged.length || status.created.length || status.modified.length || status.deleted.length;
  if (!dirty) return { skipped: true };

  await git.commit(message);
  await git.pull({ '--rebase': 'true' }).catch(() => {}); // best-effort, guards against drift between deploys
  await git.push();
  return { skipped: false };
}

export async function ensureAuthenticatedRemote() {
  const owner = process.env.GITHUB_OWNER;
  const repoName = process.env.MONOREPO_NAME;
  if (!owner || !repoName) {
    console.warn('GITHUB_OWNER/MONOREPO_NAME not set — skipping remote auth setup, pushes will fail.');
    return;
  }
  const git = simpleGit(ROOT);
  const authedUrl = `https://${token()}@github.com/${owner}/${repoName}.git`;
  const remotes = await git.getRemotes(false);
  if (remotes.some((r) => r.name === 'origin')) {
    await git.remote(['set-url', 'origin', authedUrl]);
  } else {
    await git.addRemote('origin', authedUrl);
  }
}
