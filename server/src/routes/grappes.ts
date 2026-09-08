import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { journaliser } from '../audit.js';
import { ErreurHttp, auteur, valider } from '../http.js';

const TYPES = { question: { table: 'questions_recherche', jonction: 'question_axes', cle: 'question_id' },
                idee:     { table: 'idees_brutes',        jonction: 'idee_axes',     cle: 'idee_id' } } as const;

type TypeEntite = keyof typeof TYPES;

const schemaGrappe = z.object({
  nom: z.string().trim().min(1).max(300),
  type_entite: z.enum(['question', 'idee']),
  description: z.string().trim().max(20000).nullish(),
  origine: z.enum(['manuelle', 'adm']).default('manuelle'),
  membres: z.array(z.number().int().positive()).min(1, 'une grappe contient au moins un élément'),
});

/** Affecte (ou détache) un ensemble d'entrées à une grappe. */
async function affecterMembres(
  client: PoolClient,
  type: TypeEntite,
  grappeId: number | null,
  ids: number[],
): Promise<void> {
  if (!ids.length) return;
  await client.query(
    `UPDATE ${TYPES[type].table} SET grappe_id = $1 WHERE id = ANY($2::int[]) AND verrouille = false`,
    [grappeId, ids],
  );
}

/**
 * Bascule une grappe (ou une entrée seule) dans la base projets avec le
 * statut « en préparation ». Les axes du projet sont l'union des axes des
 * membres — le cahier des charges impose au moins un axe par projet, cette
 * union le garantit puisque les membres en ont déjà.
 */
async function basculerEnProjet(
  client: PoolClient,
  type: TypeEntite,
  membres: number[],
  acronyme: string,
  titre: string,
): Promise<number> {
  const t = TYPES[type];

  const { rows: axes } = await client.query<{ axe_id: number }>(
    `SELECT DISTINCT axe_id FROM ${t.jonction} WHERE ${t.cle} = ANY($1::int[])`,
    [membres],
  );
  if (!axes.length) {
    throw new ErreurHttp(400, "Impossible de basculer : aucun axe de recherche n'est rattaché à ces entrées.");
  }

  const { rows: pilotes } = await client.query<{ pilote_id: number }>(
    `SELECT pilote_id FROM ${t.table} WHERE id = ANY($1::int[]) AND pilote_id IS NOT NULL LIMIT 1`,
    [membres],
  );

  // Acronyme unique : on suffixe si nécessaire plutôt que d'échouer.
  let acronymeFinal = acronyme.slice(0, 60);
  for (let n = 2; ; n += 1) {
    const collision = await client.query('SELECT 1 FROM projets WHERE lower(acronyme) = lower($1)', [acronymeFinal]);
    if (collision.rowCount === 0) break;
    acronymeFinal = `${acronyme.slice(0, 55)}-${n}`;
  }

  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO projets (acronyme, titre, statut, pilote_id)
     VALUES ($1, $2, 'en_preparation', $3) RETURNING id`,
    [acronymeFinal, titre.slice(0, 500), pilotes[0]?.pilote_id ?? null],
  );
  const projetId = rows[0].id;

  await client.query(
    `INSERT INTO projet_axes (projet_id, axe_id) SELECT $1, x FROM unnest($2::int[]) AS x`,
    [projetId, axes.map((a) => a.axe_id)],
  );

  // Les questions se rattachent au projet ; les idées gardent une trace de leur projet issu.
  await client.query(`UPDATE ${t.table} SET projet_id = $1 WHERE id = ANY($2::int[])`, [projetId, membres]);

  // Les partenaires portés par les idées deviennent partenaires du projet.
  if (type === 'idee') {
    await client.query(
      `INSERT INTO projet_partenaires (projet_id, partenaire_id)
       SELECT $1, partenaire_id FROM idees_brutes
       WHERE id = ANY($2::int[]) AND partenaire_id IS NOT NULL
       ON CONFLICT DO NOTHING`,
      [projetId, membres],
    );
  }

  return projetId;
}

export function enregistrerGrappes(app: FastifyInstance): void {
  app.get('/api/grappes', async () => query('SELECT * FROM v_grappes ORDER BY maj_le DESC'));

  app.post('/api/grappes', async (req: FastifyRequest, reply) => {
    const c = valider(schemaGrappe, req.body);
    const grappe = await tx(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO grappes (nom, type_entite, description, origine) VALUES ($1, $2, $3, $4) RETURNING id`,
        [c.nom, c.type_entite, c.description ?? null, c.origine],
      );
      await affecterMembres(client, c.type_entite, rows[0].id, c.membres);
      await journaliser(
        {
          entite: 'grappe',
          entiteId: rows[0].id,
          action: 'grappage',
          resume: `Grappe « ${c.nom} » créée avec ${c.membres.length} élément(s)`,
          details: { type_entite: c.type_entite, membres: c.membres, origine: c.origine },
          auteur: auteur(req),
        },
        client,
      );
      return rows[0].id;
    });
    reply.status(201);
    return one('SELECT * FROM v_grappes WHERE id = $1', [grappe]);
  });

  // Ajout / retrait de membres (glisser-déposer, multi-sélection).
  app.patch<{ Params: { id: string } }>('/api/grappes/:id', async (req) => {
    const id = Number(req.params.id);
    const c = valider(
      z.object({
        nom: z.string().trim().min(1).max(300).optional(),
        description: z.string().trim().max(20000).nullish(),
        ajouter: z.array(z.number().int().positive()).optional(),
        retirer: z.array(z.number().int().positive()).optional(),
      }).strict(),
      req.body,
    );
    const grappe = await one<{ id: number; nom: string; type_entite: TypeEntite }>(
      'SELECT * FROM grappes WHERE id = $1',
      [id],
    );
    if (!grappe) throw new ErreurHttp(404, `Grappe ${id} introuvable`);

    await tx(async (client) => {
      if (c.nom !== undefined || c.description !== undefined) {
        await client.query('UPDATE grappes SET nom = COALESCE($2, nom), description = COALESCE($3, description) WHERE id = $1',
          [id, c.nom ?? null, c.description ?? null]);
      }
      if (c.ajouter?.length) await affecterMembres(client, grappe.type_entite, id, c.ajouter);
      if (c.retirer?.length) await affecterMembres(client, grappe.type_entite, null, c.retirer);
      await journaliser(
        {
          entite: 'grappe',
          entiteId: id,
          action: 'grappage',
          resume: `Grappe « ${c.nom ?? grappe.nom} » mise à jour (+${c.ajouter?.length ?? 0} / −${c.retirer?.length ?? 0})`,
          details: c,
          auteur: auteur(req),
        },
        client,
      );
    });
    return one('SELECT * FROM v_grappes WHERE id = $1', [id]);
  });

  // Dissout la grappe sans supprimer ses membres.
  app.delete<{ Params: { id: string } }>('/api/grappes/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const grappe = await one<{ nom: string }>('SELECT nom FROM grappes WHERE id = $1', [id]);
    if (!grappe) throw new ErreurHttp(404, `Grappe ${id} introuvable`);
    await query('DELETE FROM grappes WHERE id = $1', [id]);
    await journaliser({
      entite: 'grappe', entiteId: id, action: 'suppression',
      resume: `Grappe « ${grappe.nom} » dissoute (ses éléments sont conservés)`,
      auteur: auteur(req),
    });
    reply.status(204);
    return null;
  });

  // ---- Bascule d'une grappe entière en projet -----------------------------
  app.post<{ Params: { id: string } }>('/api/grappes/:id/bascule', async (req, reply) => {
    const id = Number(req.params.id);
    const c = valider(
      z.object({ acronyme: z.string().trim().min(1).max(60).optional(), titre: z.string().trim().min(1).max(500).optional() }).strict(),
      req.body ?? {},
    );
    const grappe = await one<{ id: number; nom: string; type_entite: TypeEntite; projet_id: number | null }>(
      'SELECT * FROM grappes WHERE id = $1', [id],
    );
    if (!grappe) throw new ErreurHttp(404, `Grappe ${id} introuvable`);
    if (grappe.projet_id) throw new ErreurHttp(409, `Cette grappe a déjà été basculée dans le projet ${grappe.projet_id}.`);

    const membres = (await query<{ id: number }>(
      `SELECT id FROM ${TYPES[grappe.type_entite].table} WHERE grappe_id = $1`, [id],
    )).map((m) => m.id);
    if (!membres.length) throw new ErreurHttp(400, 'Cette grappe est vide.');

    const projetId = await tx(async (client) => {
      const pid = await basculerEnProjet(
        client, grappe.type_entite, membres,
        c.acronyme ?? acronymeDepuis(grappe.nom), c.titre ?? grappe.nom,
      );
      await client.query('UPDATE grappes SET projet_id = $1 WHERE id = $2', [pid, id]);
      await journaliser(
        {
          entite: 'projet', entiteId: pid, action: 'bascule',
          resume: `Projet créé en préparation depuis la grappe « ${grappe.nom} » (${membres.length} élément(s))`,
          details: { grappe_id: id, type_entite: grappe.type_entite, membres },
          auteur: auteur(req),
        },
        client,
      );
      return pid;
    });

    reply.status(201);
    return one('SELECT * FROM v_projets WHERE id = $1', [projetId]);
  });

  // ---- Bascule d'une entrée seule en projet -------------------------------
  for (const [type, cfg] of Object.entries(TYPES) as [TypeEntite, (typeof TYPES)[TypeEntite]][]) {
    const segment = type === 'question' ? 'questions' : 'idees';
    app.post<{ Params: { id: string } }>(`/api/${segment}/:id/bascule`, async (req, reply) => {
      const id = Number(req.params.id);
      const c = valider(
        z.object({ acronyme: z.string().trim().min(1).max(60).optional(), titre: z.string().trim().min(1).max(500).optional() }).strict(),
        req.body ?? {},
      );
      const entree = await one<{ id: number; libelle: string; projet_id: number | null }>(
        `SELECT id, libelle, projet_id FROM ${cfg.table} WHERE id = $1`, [id],
      );
      if (!entree) throw new ErreurHttp(404, `Entrée ${id} introuvable`);
      if (entree.projet_id) throw new ErreurHttp(409, `Cette entrée est déjà rattachée au projet ${entree.projet_id}.`);

      const projetId = await tx(async (client) => {
        const pid = await basculerEnProjet(
          client, type, [id], c.acronyme ?? acronymeDepuis(entree.libelle), c.titre ?? entree.libelle,
        );
        await journaliser(
          {
            entite: 'projet', entiteId: pid, action: 'bascule',
            resume: `Projet créé en préparation depuis ${type === 'idee' ? "l'idée brute" : 'la question'} « ${entree.libelle.slice(0, 120)} »`,
            details: { source: type, source_id: id },
            auteur: auteur(req),
          },
          client,
        );
        return pid;
      });

      reply.status(201);
      return one('SELECT * FROM v_projets WHERE id = $1', [projetId]);
    });
  }
}

/** Acronyme de départ dérivé d'un libellé : initiales des mots significatifs. */
function acronymeDepuis(libelle: string): string {
  const mots = libelle
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((m) => m.length > 3);
  const sigle = mots.slice(0, 5).map((m) => m[0].toUpperCase()).join('');
  return sigle.length >= 2 ? sigle : libelle.slice(0, 20).toUpperCase() || 'PROJET';
}
