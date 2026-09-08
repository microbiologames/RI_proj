import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { journaliser } from '../audit.js';
import { auteur, valider } from '../http.js';
import { admDisponible, analyser, type CibleAdm } from '../services/adm.js';

const CIBLES = {
  question: { table: 'questions_recherche', jonction: 'question_axes', cle: 'question_id', typeGrappe: 'question' },
  idee: { table: 'idees_brutes', jonction: 'idee_axes', cle: 'idee_id', typeGrappe: 'idee' },
} as const;

/** Ce que le front renvoie après relecture : la proposition, éventuellement corrigée. */
const schemaApplication = z.object({
  cible: z.enum(['question', 'idee']),
  entrees: z.array(
    z.object({
      libelle: z.string().trim().min(1).max(500),
      axes: z.array(z.number().int().positive()).min(1, 'au moins un axe de recherche'),
      pilote_id: z.number().int().positive().nullish(),
      partenaire_id: z.number().int().positive().nullish(),
      notes: z.string().max(20000).nullish(),
    }),
  ),
  fusions: z
    .array(
      z.object({
        entree_existante_id: z.number().int().positive(),
        libelle_fusionne: z.string().trim().min(1).max(500),
      }),
    )
    .default([]),
  grappes: z
    .array(
      z.object({
        nom: z.string().trim().min(1).max(300),
        description: z.string().max(20000).nullish(),
        // Positions dans « entrees » ci-dessus (les entrées ne sont créées qu'ici).
        index_entrees_nouvelles: z.array(z.number().int().nonnegative()).default([]),
        ids_entrees_existantes: z.array(z.number().int().positive()).default([]),
      }),
    )
    .default([]),
});

export function enregistrerAdm(app: FastifyInstance): void {
  app.get('/api/adm/etat', async () => ({
    disponible: admDisponible(),
    modele: process.env.ADM_MODELE ?? 'claude-opus-5',
  }));

  /** Étape 1 — analyse : ne modifie rien, rend une proposition à valider. */
  app.post('/api/adm/analyser', async (req) => {
    const { cible, texte } = valider(
      z.object({
        cible: z.enum(['question', 'idee', 'partenaire', 'transfert']),
        texte: z.string().trim().min(3).max(50000),
      }),
      req.body,
    );
    return analyser(cible as CibleAdm, texte);
  });

  /** Étape 2 — application de la proposition validée par l'utilisateur. */
  app.post('/api/adm/appliquer', async (req, reply) => {
    const c = valider(schemaApplication, req.body);
    const cfg = CIBLES[c.cible];
    const nom = auteur(req);

    const resultat = await tx(async (client) => {
      // Fusions : on remplace l'énoncé de l'entrée existante par la formulation élargie.
      for (const f of c.fusions) {
        const avant = await client.query<{ libelle: string }>(
          `SELECT libelle FROM ${cfg.table} WHERE id = $1`,
          [f.entree_existante_id],
        );
        await client.query(`UPDATE ${cfg.table} SET libelle = $2 WHERE id = $1 AND verrouille = false`, [
          f.entree_existante_id,
          f.libelle_fusionne,
        ]);
        await journaliser(
          {
            entite: c.cible,
            entiteId: f.entree_existante_id,
            action: 'modification',
            resume: `ADM — formulation élargie par fusion`,
            details: { libelle: { avant: avant.rows[0]?.libelle ?? null, apres: f.libelle_fusionne } },
            auteur: nom,
          },
          client,
        );
      }

      // Créations.
      const idsCrees: number[] = [];
      for (const e of c.entrees) {
        const colonnes = ['libelle', 'pilote_id', 'notes'];
        const valeurs: unknown[] = [e.libelle, e.pilote_id ?? null, e.notes ?? null];
        if (c.cible === 'idee') {
          colonnes.push('partenaire_id');
          valeurs.push(e.partenaire_id ?? null);
        }
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO ${cfg.table} (${colonnes.join(', ')})
           VALUES (${colonnes.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
          valeurs,
        );
        const id = rows[0].id;
        await client.query(
          `INSERT INTO ${cfg.jonction} (${cfg.cle}, axe_id) SELECT $1, x FROM unnest($2::int[]) AS x`,
          [id, [...new Set(e.axes)]],
        );
        idsCrees.push(id);
        await journaliser(
          {
            entite: c.cible,
            entiteId: id,
            action: 'creation',
            resume: `ADM — création de « ${e.libelle.slice(0, 120)} »`,
            details: { axes: e.axes, source: 'adm' },
            auteur: nom,
          },
          client,
        );
      }

      // Grappes.
      const idsGrappes: number[] = [];
      for (const g of c.grappes) {
        const membres = [
          ...g.index_entrees_nouvelles.map((i) => idsCrees[i]).filter((v): v is number => v !== undefined),
          ...g.ids_entrees_existantes,
        ];
        if (membres.length < 2) continue;   // une grappe d'un seul élément n'a pas d'objet
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO grappes (nom, type_entite, description, origine) VALUES ($1, $2, $3, 'adm') RETURNING id`,
          [g.nom, cfg.typeGrappe, g.description ?? null],
        );
        await client.query(
          `UPDATE ${cfg.table} SET grappe_id = $1 WHERE id = ANY($2::int[]) AND verrouille = false`,
          [rows[0].id, membres],
        );
        idsGrappes.push(rows[0].id);
        await journaliser(
          {
            entite: 'grappe',
            entiteId: rows[0].id,
            action: 'grappage',
            resume: `ADM — grappe « ${g.nom} » (${membres.length} élément(s))`,
            details: { membres },
            auteur: nom,
          },
          client,
        );
      }

      return { idsCrees, idsGrappes };
    });

    reply.status(201);
    const vue = c.cible === 'question' ? 'v_questions' : 'v_idees';
    return {
      creees: resultat.idsCrees.length
        ? await query(`SELECT * FROM ${vue} WHERE id = ANY($1::int[])`, [resultat.idsCrees])
        : [],
      grappes: resultat.idsGrappes.length
        ? await query('SELECT * FROM v_grappes WHERE id = ANY($1::int[])', [resultat.idsGrappes])
        : [],
      // Les grappes issues de l'ADM peuvent être basculées en projet « en préparation »
      // depuis l'interface : POST /api/grappes/:id/bascule
      message: resultat.idsGrappes.length
        ? 'Grappes créées : vous pouvez les basculer en projets « en préparation ».'
        : undefined,
    };
  });
}
