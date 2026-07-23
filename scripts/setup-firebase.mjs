/**
 * Configura el proyecto de Firebase usando la service account key: registra la
 * app web, escribe .env.local, verifica la base Firestore y publica las reglas.
 *
 * Es idempotente: se puede correr las veces que haga falta.
 *
 *   node scripts/setup-firebase.mjs <ruta-al-service-account.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { cert } from 'firebase-admin/app';

const keyPath = process.argv[2];
if (!keyPath || !fs.existsSync(keyPath)) {
  console.error('Pasá la ruta al JSON de la service account.');
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const projectId = sa.project_id;
const { access_token: token } = await cert(sa).getAccessToken();

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

const step = (msg) => console.log(`\n▶ ${msg}`);
const fail = (r) =>
  `${r.status} ${(r.body?.error?.message ?? JSON.stringify(r.body)).split('\n')[0].slice(0, 160)}`;

/* 1. App web ------------------------------------------------------------ */
step('Firebase: app web');
const list = await api(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`);
if (!list.ok) {
  console.error(`  ✖ no se pudo listar: ${fail(list)}`);
  process.exit(1);
}

let webApp = list.body.apps?.[0];
if (webApp) {
  console.log(`  ✔ ya existía: ${webApp.displayName ?? webApp.appId}`);
} else {
  console.log('  no hay ninguna, creándola…');
  const op = await api(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
    method: 'POST',
    body: JSON.stringify({ displayName: 'Basas Online' }),
  });
  if (!op.ok) {
    console.error(`  ✖ no se pudo crear: ${fail(op)}`);
    process.exit(1);
  }
  for (let i = 0; i < 30 && !webApp; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const again = await api(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`);
    if (again.ok && again.body.apps?.length) webApp = again.body.apps[0];
    else process.stdout.write('.');
  }
  if (!webApp) {
    console.error('\n  ✖ la app no apareció a tiempo.');
    process.exit(1);
  }
  console.log(`  ✔ creada: ${webApp.appId}`);
}

const cfg = await api(
  `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${webApp.appId}/config`
);
if (!cfg.ok) {
  console.error(`  ✖ no se pudo leer la config: ${fail(cfg)}`);
  process.exit(1);
}

/* 2. .env.local --------------------------------------------------------- */
step('Escribiendo .env.local');
fs.writeFileSync(
  path.join(process.cwd(), '.env.local'),
  [
    '# Generado por scripts/setup-firebase.mjs',
    '',
    '# Config pública del cliente (la protegen las reglas, no el secreto)',
    `NEXT_PUBLIC_FIREBASE_API_KEY=${cfg.body.apiKey}`,
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${cfg.body.projectId}`,
    `NEXT_PUBLIC_FIREBASE_APP_ID=${cfg.body.appId}`,
    `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${cfg.body.authDomain}`,
    '',
    '# Credenciales de servidor: saltan TODAS las reglas.',
    `FIREBASE_PROJECT_ID=${sa.project_id}`,
    `FIREBASE_CLIENT_EMAIL=${sa.client_email}`,
    `FIREBASE_PRIVATE_KEY="${sa.private_key.replace(/\n/g, '\\n')}"`,
    '',
  ].join('\n')
);
console.log('  ✔ listo');

/* 3. Base de datos Firestore ------------------------------------------- */
step('Firestore: base de datos');
const db = await api(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`
);

if (!db.ok) {
  console.log(`  ✖ no disponible: ${fail(db)}`);
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │ FALTA UN PASO MANUAL                                        │');
  console.log('  ├─────────────────────────────────────────────────────────────┤');
  console.log('  │ La service account no tiene permiso para habilitar APIs ni  │');
  console.log('  │ crear la base. Entrá a la consola de Firebase:              │');
  console.log('  │                                                             │');
  console.log(`  │  https://console.firebase.google.com/project/${projectId}/firestore`);
  console.log('  │                                                             │');
  console.log('  │ Clic en "Crear base de datos" → modo producción →           │');
  console.log('  │ región southamerica-east1. Eso habilita la API solo.        │');
  console.log('  │                                                             │');
  console.log('  │ Después volvé a correr este script y termina todo.          │');
  console.log('  └─────────────────────────────────────────────────────────────┘');
  process.exit(2);
}
console.log(`  ✔ ${db.body.type} en ${db.body.locationId}`);

/* 4. Reglas de seguridad ------------------------------------------------ */
step('Firestore: reglas de seguridad');
const rulesSource = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

const ruleset = await api(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
  method: 'POST',
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rulesSource }] } }),
});
if (!ruleset.ok) {
  console.error(`  ✖ no se pudo crear el ruleset: ${fail(ruleset)}`);
  process.exit(1);
}

const releaseName = `projects/${projectId}/releases/cloud.firestore`;
let release = await api(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
  method: 'PATCH',
  body: JSON.stringify({ release: { name: releaseName, rulesetName: ruleset.body.name } }),
});
if (!release.ok) {
  release = await api(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`, {
    method: 'POST',
    body: JSON.stringify({ name: releaseName, rulesetName: ruleset.body.name }),
  });
}
if (!release.ok) {
  console.error(`  ✖ no se pudieron publicar: ${fail(release)}`);
  process.exit(1);
}
console.log('  ✔ publicadas (rooms cerrada, pulse solo lectura)');

console.log('\n✅ Firebase configurado.');
console.log(`   Proyecto: ${projectId}`);
console.log(`   App ID  : ${cfg.body.appId}`);
