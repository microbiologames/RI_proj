-- Une couleur ne peut pas servir telle quelle sur fond clair et sur fond sombre :
-- on stocke les deux pas de la même teinte. Les valeurs ci-dessous sont issues
-- d'une palette catégorielle validée (séparation daltonisme + contraste sur
-- chacun des deux fonds).
ALTER TABLE axes_recherche ADD COLUMN couleur_sombre text NOT NULL DEFAULT '#94a3b8';

UPDATE axes_recherche SET couleur = '#2a78d6', couleur_sombre = '#3987e5' WHERE code = 'AXE1';
UPDATE axes_recherche SET couleur = '#eb6834', couleur_sombre = '#d95926' WHERE code = 'AXE2';
UPDATE axes_recherche SET couleur = '#1baf7a', couleur_sombre = '#199e70' WHERE code = 'AXE3';
UPDATE axes_recherche SET couleur = '#eda100', couleur_sombre = '#c98500' WHERE code = 'AXE4';

-- Les vues embarquent la couleur des axes : il faut les recréer.
DROP VIEW v_questions, v_idees, v_projets, v_transferts;

CREATE VIEW v_projets AS
SELECT pr.*,
       CASE WHEN pe.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', pe.id, 'nom', pe.nom) END AS pilote,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle, 'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) ORDER BY a.ordre)
                 FROM projet_axes pa JOIN axes_recherche a ON a.id = pa.axe_id
                 WHERE pa.projet_id = pr.id), '[]'::jsonb) AS axes,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pt.id, 'nom', pt.nom, 'ville', pt.ville, 'pays', pt.pays,
                                                     'latitude', pt.latitude, 'longitude', pt.longitude) ORDER BY pt.nom)
                 FROM projet_partenaires pp JOIN partenaires pt ON pt.id = pp.partenaire_id
                 WHERE pp.projet_id = pr.id), '[]'::jsonb) AS partenaires,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', tf.id, 'libelle', tf.libelle) ORDER BY tf.ordre)
                 FROM projet_financements pf JOIN types_financement tf ON tf.id = pf.financement_id
                 WHERE pf.projet_id = pr.id), '[]'::jsonb) AS financements,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'libelle', l.libelle) ORDER BY l.libelle)
                 FROM projet_labellisations pl JOIN labellisations l ON l.id = pl.labellisation_id
                 WHERE pl.projet_id = pr.id), '[]'::jsonb) AS labellisations,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'libelle', q.libelle) ORDER BY q.id)
                 FROM questions_recherche q WHERE q.projet_id = pr.id), '[]'::jsonb) AS questions,
       (SELECT count(*) FROM transferts t WHERE t.projet_id = pr.id) AS nb_transferts
FROM projets pr
LEFT JOIN personnes pe ON pe.id = pr.pilote_id;

CREATE VIEW v_questions AS
SELECT q.*,
       CASE WHEN pe.id IS NULL THEN NULL ELSE jsonb_build_object('id', pe.id, 'nom', pe.nom) END AS pilote,
       CASE WHEN pr.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', pr.id, 'acronyme', pr.acronyme, 'titre', pr.titre, 'statut', pr.statut) END AS projet,
       CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('id', g.id, 'nom', g.nom) END AS grappe,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle, 'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) ORDER BY a.ordre)
                 FROM question_axes qa JOIN axes_recherche a ON a.id = qa.axe_id
                 WHERE qa.question_id = q.id), '[]'::jsonb) AS axes
FROM questions_recherche q
LEFT JOIN personnes pe ON pe.id = q.pilote_id
LEFT JOIN projets    pr ON pr.id = q.projet_id
LEFT JOIN grappes    g  ON g.id  = q.grappe_id;

CREATE VIEW v_idees AS
SELECT i.*,
       CASE WHEN pe.id IS NULL THEN NULL ELSE jsonb_build_object('id', pe.id, 'nom', pe.nom) END AS pilote,
       CASE WHEN pt.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', pt.id, 'nom', pt.nom, 'ville', pt.ville, 'pays', pt.pays) END AS partenaire,
       CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('id', pr.id, 'acronyme', pr.acronyme) END AS projet,
       CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('id', g.id, 'nom', g.nom) END AS grappe,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle, 'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) ORDER BY a.ordre)
                 FROM idee_axes ia JOIN axes_recherche a ON a.id = ia.axe_id
                 WHERE ia.idee_id = i.id), '[]'::jsonb) AS axes
FROM idees_brutes i
LEFT JOIN personnes   pe ON pe.id = i.pilote_id
LEFT JOIN partenaires pt ON pt.id = i.partenaire_id
LEFT JOIN projets     pr ON pr.id = i.projet_id
LEFT JOIN grappes     g  ON g.id  = i.grappe_id;

CREATE VIEW v_transferts AS
SELECT t.*,
       jsonb_build_object('id', tt.id, 'libelle', tt.libelle) AS type,
       CASE WHEN pr.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', pr.id, 'acronyme', pr.acronyme, 'titre', pr.titre) END AS projet,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pe.id, 'nom', pe.nom) ORDER BY pe.nom)
                 FROM transfert_pilotes tp JOIN personnes pe ON pe.id = tp.personne_id
                 WHERE tp.transfert_id = t.id), '[]'::jsonb) AS pilotes,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle, 'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) ORDER BY a.ordre)
                 FROM projet_axes pa JOIN axes_recherche a ON a.id = pa.axe_id
                 WHERE pa.projet_id = t.projet_id), '[]'::jsonb) AS axes  -- axes hérités du projet lié
FROM transferts t
JOIN types_transfert tt ON tt.id = t.type_id
LEFT JOIN projets pr ON pr.id = t.projet_id;
