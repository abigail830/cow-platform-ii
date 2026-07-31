import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, '..');

const DEFAULT_REPO = 'abigail830/okf-knowledge-bundle';
const DEFAULT_REF = 'main';
const DEFAULT_SUBDIR = 'smart-proposal-knowledge';

function sanitizeRef(ref) {
  if (!/^[\w./-]+$/.test(ref)) {
    throw new Error(`Invalid OKF_BUNDLE_GIT_REF: ${ref}`);
  }
  return ref;
}

function sanitizeRepo(repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`Invalid OKF_BUNDLE_GIT_REPO: ${repo}`);
  }
  return repo;
}

function githubArchiveUrl(repo, ref) {
  return `https://github.com/${repo}/archive/refs/heads/${ref}.tar.gz`;
}

function countFiles(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) n += countFiles(full);
    else n += 1;
  }
  return n;
}

/**
 * Copy OKF bundle into the Vercel function directory as `okf-bundle/`.
 * Vendored at build time — runtime reads via OKF_BUNDLE_PATH=okf-bundle (default).
 */
export function vendorOkfBundle(destDir) {
  const subdir = process.env.OKF_BUNDLE_GIT_SUBDIR ?? DEFAULT_SUBDIR;
  const bundleDest = path.join(destDir, 'okf-bundle');

  rmSync(bundleDest, { recursive: true, force: true });
  mkdirSync(bundleDest, { recursive: true });

  const localPath = process.env.OKF_BUNDLE_LOCAL_PATH?.trim();
  if (localPath) {
    const src = path.resolve(backendRoot, localPath);
    if (!existsSync(src)) throw new Error(`OKF_BUNDLE_LOCAL_PATH does not exist: ${src}`);
    cpSync(src, bundleDest, { recursive: true });
    console.log(`OKF bundle: copied local ${src} → ${bundleDest}`);
  } else {
    const repo = sanitizeRepo(process.env.OKF_BUNDLE_GIT_REPO ?? DEFAULT_REPO);
    const ref = sanitizeRef(process.env.OKF_BUNDLE_GIT_REF ?? DEFAULT_REF);
    const url = githubArchiveUrl(repo, ref);
    const tmpRoot = path.join(backendRoot, '.vercel', 'okf-bundle-fetch');
    const tarball = path.join(tmpRoot, 'archive.tar.gz');
    const extractDir = path.join(tmpRoot, 'extract');

    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });
    mkdirSync(extractDir, { recursive: true });

    console.log(`OKF bundle: fetching ${url}`);
    execSync(`curl -fsSL "${url}" -o "${tarball}"`, { stdio: 'inherit' });
    execSync(`tar -xzf "${tarball}" -C "${extractDir}"`, { stdio: 'inherit' });

    const [extractedRoot] = readdirSync(extractDir);
    if (!extractedRoot) throw new Error('OKF bundle archive was empty');
    const src = path.join(extractDir, extractedRoot, subdir);
    if (!existsSync(src)) {
      throw new Error(
        `OKF bundle subdir "${subdir}" not found in ${repo}@${ref} (extracted: ${extractedRoot})`,
      );
    }
    cpSync(src, bundleDest, { recursive: true });
    rmSync(tmpRoot, { recursive: true, force: true });
    console.log(`OKF bundle: vendored ${repo}@${ref}/${subdir} → ${bundleDest}`);
  }

  const indexPath = path.join(bundleDest, 'index.md');
  if (!existsSync(indexPath)) {
    throw new Error(`OKF bundle missing index.md at ${bundleDest}`);
  }

  const fileCount = countFiles(bundleDest);
  const bytes = folderSize(bundleDest);
  writeFileSync(
    path.join(bundleDest, '.vendor-manifest.json'),
    `${JSON.stringify(
      {
        source: localPath ?? `${process.env.OKF_BUNDLE_GIT_REPO ?? DEFAULT_REPO}@${process.env.OKF_BUNDLE_GIT_REF ?? DEFAULT_REF}`,
        subdir,
        files: fileCount,
        bytes,
        vendoredAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`OKF bundle: ${fileCount} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

function folderSize(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) total += folderSize(full);
    else total += st.size;
  }
  return total;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dest = process.argv[2] ?? path.join(backendRoot, '.vercel', 'output', 'functions', 'index.func');
  vendorOkfBundle(dest);
}
