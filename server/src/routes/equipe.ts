import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { valider } from '../http.js';

/**
 * Équipe R&I : qui maîtrise quoi, qui porte quoi, et qui pourrait porter un
 * projet donné.
 */
export function enregistrerEquipe(app: FastifyInstance): void {
  app.get('/api/equipe', async () =>
    query('SELECT * FROM v_personnes ORDER BY equipe_ri DESC, ordre, nom'),
  );

  /** La matrice expertises × collaborateurs de l'onglet du même nom. */
  app.get('/api/equipe/expertises', async () =>
    query(`SELECT e.id, e.libelle, e.domaine,
                  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'equipe_ri', p.equipe_ri)
                                             ORDER BY p.ordre, p.nom)
                            FROM personne_expertises pe JOIN personnes p ON p.id = pe.personne_id
                            WHERE pe.expertise_id = e.id), '[]'::jsonb) AS personnes
           FROM expertises e
           ORDER BY e.domaine NULLS LAST, e.libelle`),
  );

  /**
   * Pilotes suggérés pour un projet, d'après les expertises couvertes et la
   * charge en cours.
   *
   * Le score combine deux termes : la couverture des expertises demandées
   * (dominante) et la disponibilité (correctif). Il ordonne une liste de
   * propositions — il ne décide pas à la place de l'utilisateur, et les
   * raisons du classement sont renvoyées avec chaque proposition.
   */
  app.get('/api/equipe/suggestion-pilote', async (req) => {
    const q = valider(
      z.object({
        expertises: z.string().optional(),   // ids séparés par des virgules
        axes: z.string().optional(),
      }),
      req.query,
    );
    const idsExpertises = (q.expertises ?? '').split(',').map(Number).filter(Number.isFinite);
    const idsAxes = (q.axes ?? '').split(',').map(Number).filter(Number.isFinite);

    const personnes = await query<{
      id: number; nom: string; fonction: string | null; equipe_ri: boolean;
      expertises: Array<{ id: number; libelle: string }>;
      nb_projets_en_cours: number;
    }>('SELECT * FROM v_personnes WHERE equipe_ri ORDER BY ordre, nom');

    // Expérience de chaque personne sur les axes visés, mesurée par ses projets.
    const experience = idsAxes.length
      ? await query<{ personne_id: number; axe_id: number; n: number }>(
          `SELECT pp.personne_id, pa.axe_id, count(*)::int AS n
           FROM projet_pilotes pp
           JOIN projet_axes pa ON pa.projet_id = pp.projet_id
           WHERE pa.axe_id = ANY($1::int[])
           GROUP BY pp.personne_id, pa.axe_id`,
          [idsAxes],
        )
      : [];

    const chargeMax = Math.max(1, ...personnes.map((p) => p.nb_projets_en_cours));

    const suggestions = personnes.map((p) => {
      const couvertes = p.expertises.filter((e) => idsExpertises.includes(e.id));
      const couverture = idsExpertises.length ? couvertes.length / idsExpertises.length : 0;
      const surLesAxes = experience.filter((e) => e.personne_id === p.id).reduce((n, e) => n + e.n, 0);
      const disponibilite = 1 - p.nb_projets_en_cours / chargeMax;

      const raisons: string[] = [];
      if (couvertes.length) raisons.push(`couvre ${couvertes.length}/${idsExpertises.length} expertise(s) : ${couvertes.map((e) => e.libelle).join(', ')}`);
      if (surLesAxes) raisons.push(`${surLesAxes} projet(s) déjà pilotés sur ces axes`);
      raisons.push(p.nb_projets_en_cours === 0 ? 'aucun projet en cours' : `${p.nb_projets_en_cours} projet(s) en cours`);

      return {
        personne: { id: p.id, nom: p.nom, fonction: p.fonction },
        score: Math.round((couverture * 100 + Math.min(surLesAxes, 5) * 6 + disponibilite * 20) * 10) / 10,
        couverture: Math.round(couverture * 100),
        nb_projets_en_cours: p.nb_projets_en_cours,
        experience_axes: surLesAxes,
        raisons,
      };
    });

    return suggestions.sort((a, b) => b.score - a.score);
  });
}
