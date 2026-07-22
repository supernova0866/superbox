import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import * as git from './git.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 },
  })
);

// ── Two-tier auth ─────────────────────────────────────────────────────────
app.post('/api/auth/site', (req, res) => {
  if (req.body?.password && req.body.password === process.env.SITE_PASSWORD) {
    req.session.siteAuthed = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false });
});

app.post('/api/auth/git', (req, res) => {
  if (!req.session.siteAuthed) return res.status(401).json({ ok: false });
  if (req.body?.password && req.body.password === process.env.GIT_PASSWORD) {
    req.session.gitAuthed = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false });
});

app.get('/api/auth/status', (req, res) => {
  res.json({ site: !!req.session.siteAuthed, git: !!req.session.gitAuthed });
});

// Share codes grant view access to ONE prototype only — never the full
// grid, routes.json, or any other prototype's folder.
app.post('/api/auth/share', async (req, res) => {
  const code = (req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: 'Enter a code.' });

  const raw = await fs.readFile(path.join(ROOT, 'routes.json'), 'utf8').catch(() => '{"prototypes":[]}');
  const { prototypes = [] } = JSON.parse(raw);
  const proto = prototypes.find((p) => p.shareCode && p.shareCode.toUpperCase() === code);
  if (!proto) return res.status(404).json({ ok: false, error: 'Invalid code.' });

  req.session.sharedPrototypes = req.session.sharedPrototypes || [];
  if (!req.session.sharedPrototypes.includes(proto.id)) req.session.sharedPrototypes.push(proto.id);
  res.json({ ok: true, url: `/p/${proto.id}` });
});

function requireSiteAuth(req, res, next) {
  if (req.session.siteAuthed) return next();
  res.status(401).json({ error: 'locked' });
}
function requireGitAuth(req, res, next) {
  if (req.session.gitAuthed) return next();
  res.status(401).json({ error: 'git-locked' });
}
function requirePrototypeAccess(protoId) {
  return (req, res, next) => {
    if (req.session.siteAuthed) return next();
    if ((req.session.sharedPrototypes || []).includes(protoId)) return next();
    res.status(401).json({ error: 'locked' });
  };
}

// index.html always loads (it renders its own password gate client-side).
// Everything else — including routes.json — requires the site session.
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/routes.json', requireSiteAuth, (req, res) => res.sendFile(path.join(ROOT, 'routes.json')));

// ── Git admin API (site auth + git auth both required) ───────────────────
const gitRouter = express.Router();
gitRouter.use(requireSiteAuth, requireGitAuth);

gitRouter.get('/repos', async (req, res, next) => {
  try { res.json(await git.listMyRepos()); } catch (e) { next(e); }
});
gitRouter.get('/refs/:repo', async (req, res, next) => {
  try { res.json(await git.listRefs(req.params.repo)); } catch (e) { next(e); }
});
gitRouter.post('/preview-import', async (req, res, next) => {
  try { res.json(await git.previewImport(req.body)); } catch (e) { next(e); }
});
gitRouter.post('/confirm-import', async (req, res, next) => {
  try { res.json(await git.confirmImport(req.body)); } catch (e) { next(e); }
});
gitRouter.post('/preview-push', async (req, res, next) => {
  try { res.json(await git.previewPush(req.body)); } catch (e) { next(e); }
});
gitRouter.post('/confirm-push', async (req, res, next) => {
  try { res.json(await git.confirmPush(req.body)); } catch (e) { next(e); }
});
gitRouter.post('/remove', async (req, res, next) => {
  try { res.json(await git.removePrototype(req.body.folder)); } catch (e) { next(e); }
});
app.use('/api/git', gitRouter);

// ── Mount each prototype from routes.json ────────────────────────────────
// Static assets are always served; a backend router is only lazy-loaded on
// first request if the prototype declares hasBackend + entrypoint, so idle
// RAM only reflects what's actually being used.
async function mountPrototypes() {
  const raw = await fs.readFile(path.join(ROOT, 'routes.json'), 'utf8').catch(() => '{"prototypes":[]}');
  const { prototypes = [] } = JSON.parse(raw);

  for (const proto of prototypes) {
    const folder = path.join(ROOT, proto.id);
    const mountPath = `/p/${proto.id}`;

    app.use(mountPath, requireSiteAuth, express.static(folder));

    if (proto.hasBackend && proto.entrypoint) {
      let routerPromise = null;
      app.use(mountPath, requireSiteAuth, async (req, res, next) => {
        try {
          if (!routerPromise) {
            const entryFile = path.join(folder, proto.entrypoint);
            routerPromise = import(entryFile).then((m) => m.default || m.router);
          }
          const router = await routerPromise;
          return router(req, res, next);
        } catch (e) {
          console.error(`[${proto.id}] router error:`, e);
          res.status(500).json({ error: 'prototype error', prototype: proto.id });
        }
      });
    }
  }
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

// Keep one bad prototype from taking the whole playground down.
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));

await git.ensureAuthenticatedRemote().catch((e) => console.warn('remote setup skipped:', e.message));
await mountPrototypes();

app.listen(PORT, () => console.log(`Prototyper listening on :${PORT}`));
