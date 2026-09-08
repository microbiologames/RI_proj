-- Le cahier des charges prévoit qu'une question de recherche puisse être
-- rattachée à un projet OU à une idée brute. Quatre questions de l'export
-- référencent des entrées devenues idées brutes (OTOP, MEDAL, HALIOBREIZH,
-- TypDeLis) : sans cette table, ces liens seraient perdus.
CREATE TABLE question_idees (
  question_id integer NOT NULL REFERENCES questions_recherche(id) ON DELETE CASCADE,
  idee_id     integer NOT NULL REFERENCES idees_brutes(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, idee_id)
);

CREATE INDEX question_idees_idee_idx ON question_idees (idee_id);

DROP VIEW v_questions;
CREATE VIEW v_questions AS
SELECT q.*,
       CASE WHEN pe.id IS NULL THEN NULL ELSE jsonb_build_object('id', pe.id, 'nom', pe.nom) END AS pilote,
       CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('id', g.id, 'nom', g.nom) END AS grappe,
       CASE WHEN tr.id IS NULL THEN NULL ELSE jsonb_build_object('id', tr.id, 'libelle', tr.libelle) END AS transition,
       CASE WHEN pb.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', pb.id, 'libelle', pb.libelle, 'axes_valides', pb.axes_valides) END AS problematique,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'acronyme', pr.acronyme, 'titre', pr.titre,
                                                     'statut', pr.statut) ORDER BY pr.acronyme)
                 FROM question_projets qp JOIN projets pr ON pr.id = qp.projet_id
                 WHERE qp.question_id = q.id), '[]'::jsonb) AS projets,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'libelle', i.libelle, 'statut', i.statut) ORDER BY i.libelle)
                 FROM question_idees qi JOIN idees_brutes i ON i.id = qi.idee_id
                 WHERE qi.question_id = q.id), '[]'::jsonb) AS idees,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle,
                                                     'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) ORDER BY a.ordre)
                 FROM question_axes qa JOIN axes_recherche a ON a.id = qa.axe_id
                 WHERE qa.question_id = q.id), '[]'::jsonb) AS axes
FROM questions_recherche q
LEFT JOIN personnes  pe ON pe.id = q.pilote_id
LEFT JOIN grappes    g  ON g.id  = q.grappe_id
LEFT JOIN transitions_alimentaires tr ON tr.id = q.transition_id
LEFT JOIN problematiques pb ON pb.id = q.problematique_id;

-- Les idées brutes exposent à leur tour leurs questions.
DROP VIEW v_idees;
CREATE VIEW v_idees AS
SELECT i.*,
       CASE WHEN pe.id IS NULL THEN NULL ELSE jsonb_build_object('id', pe.id, 'nom', pe.nom) END AS pilote,
       CASE WHEN pt.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', pt.id, 'nom', pt.nom, 'ville', pt.ville, 'pays', pt.pays) END AS partenaire,
       CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('id', pr.id, 'acronyme', pr.acronyme) END AS projet,
       CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('id', g.id, 'nom', g.nom) END AS grappe,
       CASE WHEN tr.id IS NULL THEN NULL ELSE jsonb_build_object('id', tr.id, 'libelle', tr.libelle) END AS transition,
       CASE WHEN pb.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', pb.id, 'libelle', pb.libelle, 'axes_valides', pb.axes_valides) END AS problematique,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'libelle', q.libelle) ORDER BY q.id)
                 FROM question_idees qi JOIN questions_recherche q ON q.id = qi.question_id
                 WHERE qi.idee_id = i.id), '[]'::jsonb) AS questions,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle,
                                                     'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) ORDER BY a.ordre)
                 FROM idee_axes ia JOIN axes_recherche a ON a.id = ia.axe_id
                 WHERE ia.idee_id = i.id), '[]'::jsonb) AS axes
FROM idees_brutes i
LEFT JOIN personnes   pe ON pe.id = i.pilote_id
LEFT JOIN partenaires pt ON pt.id = i.partenaire_id
LEFT JOIN projets     pr ON pr.id = i.projet_id
LEFT JOIN grappes     g  ON g.id  = i.grappe_id
LEFT JOIN transitions_alimentaires tr ON tr.id = i.transition_id
LEFT JOIN problematiques pb ON pb.id = i.problematique_id;
