import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ErreurHttp, valider } from '../http.js';

/**
 * Référentiels alimentant l'autocomplétion. Le front les charge en une fois
 * et propose les valeurs dès les premiers caractères frappés ; une valeur
 * inconnue peut être créée à la volée depuis le même champ.
 */
const TABLES = {
  axes: { table: 'axes_recherche', ordre: 'ordre, libelle', libelle: 'libelle' },
  personnes: { table: 'personnes', ordre: 'nom', libelle: 'nom' },
  expertises: { table: 'expertises', ordre: 'libelle', libelle: 'libelle' },
  financements: { table: 'types_financement', ordre: 'ordre, libelle', libelle: 'libelle' },
  labellisations: { table: 'labellisations', ordre: 'libelle', libelle: 'libelle' },
  types_transfert: { table: 'types_transfert', ordre: 'ordre, libelle', libelle: 'libelle' },
} as const;

type CleReferentiel = keyof typeof TABLES;

export function enregistrerReferentiels(app: FastifyInstance): void {
  // Tout en une requête : c'est ce que consomme le front au démarrage.
  app.get('/api/referentiels', async () => {
    const cles = Object.keys(TABLES) as CleReferentiel[];
    const entrees = await Promise.all(
      cles.map(async (cle) => {
        const t = TABLES[cle];
        return [cle, await query(`SELECT * FROM ${t.table} ORDER BY ${t.ordre}`)] as const;
      }),
    );
    return Object.fromEntries(entrees);
  });

  app.get<{ Params: { cle: string } }>('/api/referentiels/:cle', async (req) => {
    const t = TABLES[req.params.cle as CleReferentiel];
    if (!t) throw new ErreurHttp(404, `Référentiel « ${req.params.cle} » inconnu`);
    return query(`SELECT * FROM ${t.table} ORDER BY ${t.ordre}`);
  });

  // Création à la volée depuis un champ d'autocomplétion.
  app.post<{ Params: { cle: string } }>('/api/referentiels/:cle', async (req, reply) => {
    const t = TABLES[req.params.cle as CleReferentiel];
    if (!t) throw new ErreurHttp(404, `Référentiel « ${req.params.cle} » inconnu`);

    if (req.params.cle === 'axes') {
      const corps = valider(
        z.object({
          code: z.string().trim().min(1).max(30),
          libelle: z.string().trim().min(1).max(200),
          couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#64748b'),
          couleur_sombre: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#94a3b8'),
          ordre: z.number().int().default(0),
        }),
        req.body,
      );
      reply.status(201);
      return one(
        `INSERT INTO axes_recherche (code, libelle, couleur, couleur_sombre, ordre) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, couleur = EXCLUDED.couleur,
                                          couleur_sombre = EXCLUDED.couleur_sombre
         RETURNING *`,
        [corps.code, corps.libelle, corps.couleur, corps.couleur_sombre, corps.ordre],
      );
    }

    const corps = valider(
      z.object({ libelle: z.string().trim().min(1).max(200), email: z.string().email().nullish() }),
      req.body,
    );
    const colonne = t.libelle;
    const existant = await one(`SELECT * FROM ${t.table} WHERE lower(${colonne}) = lower($1)`, [corps.libelle]);
    if (existant) return existant;

    reply.status(201);
    if (t.table === 'personnes') {
      return one(`INSERT INTO personnes (nom, email) VALUES ($1, $2) RETURNING *`, [corps.libelle, corps.email ?? null]);
    }
    return one(`INSERT INTO ${t.table} (${colonne}) VALUES ($1) RETURNING *`, [corps.libelle]);
  });

  // Mise à jour d'un axe (libellé, couleur) depuis la page Réglages.
  app.patch<{ Params: { id: string } }>('/api/referentiels/axes/:id', async (req) => {
    const corps = valider(
      z.object({
        libelle: z.string().trim().min(1).max(200).optional(),
        couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        couleur_sombre: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        ordre: z.number().int().optional(),
        actif: z.boolean().optional(),
      }).strict(),
      req.body,
    );
    const champs = Object.keys(corps);
    if (!champs.length) throw new ErreurHttp(400, 'Aucun champ à modifier.');
    const set = champs.map((c, i) => `${c} = $${i + 2}`).join(', ');
    return one(
      `UPDATE axes_recherche SET ${set} WHERE id = $1 RETURNING *`,
      [Number(req.params.id), ...champs.map((c) => corps[c as keyof typeof corps])],
    );
  });
}
