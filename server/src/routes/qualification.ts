import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { journaliser } from '../audit.js';
import { ErreurHttp, auteur, valider } from '../http.js';

/**
 * Qualification des problématiques par axe de recherche.
 *
 * Les données d'origine ne portent aucun axe : les questions relèvent d'une
 * « problématique », et c'est elle qu'on rattache aux axes. Qualifier les
 * ~36 problématiques suffit alors à qualifier les 66 questions, puis, par
 * propagation, les projets et les idées qui s'y rattachent.
 */
export function enregistrerQualification(app: FastifyInstance): void {
  app.get('/api/problematiques', async () =>
    query(`SELECT * FROM v_problematiques ORDER BY axes_valides, nb_questions DESC, libelle`),
  );

  app.get('/api/feuille-de-route', async () =>
    query(`SELECT s.*, jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle,
                                          'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) AS axe
           FROM scopes_feuille_de_route s
           JOIN axes_recherche a ON a.id = s.axe_id
           ORDER BY a.ordre, s.ordre`),
  );

  /** Avancement de la qualification, affiché en tête de page. */
  app.get('/api/qualification/etat', async () => {
    const [etat] = await query<Record<string, number>>(`
      SELECT
        (SELECT count(*)::int FROM problematiques)                                         AS problematiques,
        (SELECT count(*)::int FROM problematiques WHERE axes_valides)                      AS problematiques_validees,
        (SELECT count(*)::int FROM problematiques pb
           WHERE NOT EXISTS (SELECT 1 FROM problematique_axes WHERE problematique_id = pb.id)) AS problematiques_sans_axe,
        (SELECT count(*)::int FROM questions_recherche)                                    AS questions,
        (SELECT count(*)::int FROM questions_recherche q
           WHERE NOT EXISTS (SELECT 1 FROM question_axes WHERE question_id = q.id))        AS questions_sans_axe,
        (SELECT count(*)::int FROM projets)                                                AS projets,
        (SELECT count(*)::int FROM projets p
           WHERE NOT EXISTS (SELECT 1 FROM projet_axes WHERE projet_id = p.id))            AS projets_sans_axe,
        (SELECT count(*)::int FROM idees_brutes)                                           AS idees,
        (SELECT count(*)::int FROM idees_brutes i
           WHERE NOT EXISTS (SELECT 1 FROM idee_axes WHERE idee_id = i.id))                AS idees_sans_axe`);
    return etat;
  });

  /**
   * Modifie les axes d'une problématique et répercute immédiatement sur les
   * questions qui la portent, puis sur les projets et idées liés à ces
   * questions. La répercussion est additive : elle n'efface jamais un axe
   * saisi à la main sur un projet.
   */
  app.patch<{ Params: { id: string } }>('/api/problematiques/:id', async (req) => {
    const id = Number(req.params.id);
    const corps = valider(
      z.object({
        axes: z.array(z.number().int().positive()).optional(),
        axes_valides: z.boolean().optional(),
        libelle: z.string().trim().min(1).max(500).optional(),
      }).strict(),
      req.body,
    );

    const avant = await one<{ id: number; libelle: string }>('SELECT * FROM problematiques WHERE id = $1', [id]);
    if (!avant) throw new ErreurHttp(404, `Problématique ${id} introuvable`);

    const propagation = await tx(async (c) => {
      if (corps.libelle !== undefined) {
        await c.query('UPDATE problematiques SET libelle = $2 WHERE id = $1', [id, corps.libelle]);
      }
      if (corps.axes_valides !== undefined) {
        await c.query('UPDATE problematiques SET axes_valides = $2 WHERE id = $1', [id, corps.axes_valides]);
      }
      if (corps.axes === undefined) return { questions: 0, projets: 0, idees: 0 };

      await c.query('DELETE FROM problematique_axes WHERE problematique_id = $1', [id]);
      if (corps.axes.length) {
        await c.query(
          `INSERT INTO problematique_axes (problematique_id, axe_id) SELECT $1, x FROM unnest($2::int[]) AS x`,
          [id, [...new Set(corps.axes)]],
        );
      }

      // Les axes des questions sont entièrement redéfinis par leur
      // problématique : c'est elle qui fait autorité.
      await c.query(
        'DELETE FROM question_axes WHERE question_id IN (SELECT id FROM questions_recherche WHERE problematique_id = $1)',
        [id],
      );
      const { rowCount: q } = await c.query(
        `INSERT INTO question_axes (question_id, axe_id)
         SELECT qr.id, pa.axe_id FROM questions_recherche qr
         CROSS JOIN problematique_axes pa
         WHERE qr.problematique_id = $1 AND pa.problematique_id = $1
         ON CONFLICT DO NOTHING`,
        [id],
      );

      // Projets et idées : on ajoute sans retirer, un axe peut y avoir été
      // saisi à la main indépendamment des questions.
      const { rowCount: p } = await c.query(
        `INSERT INTO projet_axes (projet_id, axe_id)
         SELECT DISTINCT qp.projet_id, qa.axe_id
         FROM questions_recherche qr
         JOIN question_projets qp ON qp.question_id = qr.id
         JOIN question_axes qa ON qa.question_id = qr.id
         WHERE qr.problematique_id = $1
         ON CONFLICT DO NOTHING`,
        [id],
      );
      const { rowCount: i } = await c.query(
        `INSERT INTO idee_axes (idee_id, axe_id)
         SELECT DISTINCT qi.idee_id, qa.axe_id
         FROM questions_recherche qr
         JOIN question_idees qi ON qi.question_id = qr.id
         JOIN question_axes qa ON qa.question_id = qr.id
         WHERE qr.problematique_id = $1
         ON CONFLICT DO NOTHING`,
        [id],
      );
      return { questions: q ?? 0, projets: p ?? 0, idees: i ?? 0 };
    });

    await journaliser({
      entite: 'problematique',
      entiteId: id,
      action: 'modification',
      resume: `Qualification de « ${avant.libelle.slice(0, 90)} »` +
        (corps.axes ? ` — ${propagation.questions} question(s), ${propagation.projets} projet(s), ${propagation.idees} idée(s) mis à jour` : ''),
      details: { ...corps, propagation },
      auteur: auteur(req),
    });

    return { ...(await one('SELECT * FROM v_problematiques WHERE id = $1', [id])), propagation };
  });

  /** Valide d'un coup toutes les problématiques qui portent déjà un axe. */
  app.post('/api/qualification/valider-tout', async (req) => {
    const { rowCount } = await (await import('../db.js')).pool.query(
      `UPDATE problematiques SET axes_valides = true
       WHERE NOT axes_valides
         AND EXISTS (SELECT 1 FROM problematique_axes WHERE problematique_id = problematiques.id)`,
    );
    await journaliser({
      entite: 'problematique',
      entiteId: null,
      action: 'modification',
      resume: `${rowCount} problématique(s) validées en bloc`,
      auteur: auteur(req),
    });
    return { validees: rowCount ?? 0 };
  });
}
