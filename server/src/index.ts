import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import statique from '@fastify/static';
import Fastify from 'fastify';
import { migrate } from './migrate.js';
import { gererErreur } from './http.js';
import { enregistrerCrud } from './routes/crud.js';
import { enregistrerReferentiels } from './routes/referentiels.js';
import { enregistrerGrappes } from './routes/grappes.js';
import { enregistrerJournal } from './routes/journal.js';
import { enregistrerGeocodage } from './routes/geocodage.js';
import { enregistrerAdm } from './routes/adm.js';
import { enregistrerQualification } from './routes/qualification.js';
import { enregistrerEquipe } from './routes/equipe.js';
import { pool } from './db.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 5 * 1024 * 1024,
});

app.setErrorHandler((err, _req, reply) => gererErreur(err, reply));

await app.register(cors, { origin: process.env.CORS_ORIGINE ?? true });

app.get('/api/sante', async () => {
  await pool.query('SELECT 1');
  return { statut: 'ok', horodatage: new Date().toISOString() };
});

enregistrerReferentiels(app);
enregistrerCrud(app);
enregistrerGrappes(app);
enregistrerJournal(app);
enregistrerGeocodage(app);
enregistrerAdm(app);
enregistrerQualification(app);
enregistrerEquipe(app);

// En production, la même image sert l'API et le front compilé.
const racineStatique = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (existsSync(racineStatique)) {
  await app.register(statique, { root: racineStatique });
  // Toute route non-API retombe sur l'application React (routage côté client).
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.status(404).send({ erreur: 'Route inconnue' });
    return reply.sendFile('index.html');
  });
}

/**
 * Le dépôt est public : le mot de passe par défaut de la base l'est donc
 * aussi. Laisser démarrer une installation qui l'a gardé reviendrait à
 * compter sur la lecture d'une documentation pour toute protection.
 *
 * Les lanceurs du poste individuel en tirent un au hasard au premier
 * démarrage ; un déploiement serveur le pose dans son fichier .env.
 */
function verifierMotDePasse(): void {
  const url = process.env.DATABASE_URL ?? '';
  const motDePasse = url.match(/^postgres(?:ql)?:\/\/[^:]+:([^@]*)@/)?.[1];
  const faibles = ['ri', 'postgres', 'password', 'motdepasse', 'changeme', ''];

  if (motDePasse !== undefined && faibles.includes(decodeURIComponent(motDePasse))) {
    app.log.fatal(
      'Le mot de passe de la base est resté une valeur par défaut, publiée dans le dépôt.\n' +
      "  Posez POSTGRES_PASSWORD dans le fichier .env, puis relancez :\n" +
      "    docker compose down && docker compose up -d\n" +
      '  Pour un poste individuel, demarrer.sh ou demarrer.bat en génère un.',
    );
    process.exit(1);
  }
}

verifierMotDePasse();

const port = Number(process.env.PORT ?? 8080);

if (process.env.MIGRER_AU_DEMARRAGE !== 'false') {
  await migrate();
}

await app.listen({ port, host: '0.0.0.0' });
app.log.info(`API prête sur http://0.0.0.0:${port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
