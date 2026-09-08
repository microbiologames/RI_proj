-- =====================================================================
-- Alignement du schéma sur les données réelles (extract MS List + feuille
-- de route). Les écarts constatés et leur traitement :
--
--   · un projet a plusieurs pilotes           → table projet_pilotes
--   · une question relève de plusieurs projets → table question_projets
--   · les questions portent une « transition alimentaire » et une
--     « problématique », pas un axe : l'axe se déduit de la problématique
--   · « Attente financement » et « Attente validation CODIR » ne sont pas
--     des projets mais des idées brutes qui n'ont pas encore été validées
--   · UMT oui/non se lit comme une labellisation
--   · l'auto-financement se convertit en pourcentage de financement
--   · les partenaires ont une zone et une catégorie, pas toujours une ville
-- =====================================================================

-- Les vues portent les colonnes modifiées plus bas : PostgreSQL refuse de
-- toucher à une colonne dont une vue dépend, on les retire d'abord et on les
-- recrée en fin de migration.
DROP VIEW v_questions, v_idees, v_projets, v_partenaires;

-- ---------------------------------------------------------------------
-- Les 4 axes réels de la feuille de route R&I
-- ---------------------------------------------------------------------
UPDATE axes_recherche SET libelle = 'Détection de signaux faibles et dangers émergents'      WHERE code = 'AXE1';
UPDATE axes_recherche SET libelle = 'Reproduction des contaminations naturelles'             WHERE code = 'AXE2';
UPDATE axes_recherche SET libelle = 'Simulation des phénomènes biologiques et physico-chimiques' WHERE code = 'AXE3';
UPDATE axes_recherche SET libelle = 'Éclairage dans les transitions alimentaires'            WHERE code = 'AXE4';

-- Le périmètre de chaque axe, tel que défini dans la feuille de route master.
CREATE TABLE scopes_feuille_de_route (
  id             serial PRIMARY KEY,
  axe_id         smallint NOT NULL REFERENCES axes_recherche(id) ON DELETE CASCADE,
  scope          text NOT NULL,
  contribution   text,
  ordre          smallint NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- Référentiels issus des données
-- ---------------------------------------------------------------------
CREATE TABLE transitions_alimentaires (
  id      serial PRIMARY KEY,
  libelle text NOT NULL UNIQUE
);

-- Une problématique est le pivot qui porte le rattachement aux axes :
-- qualifier les ~36 problématiques suffit à qualifier toutes les questions,
-- puis, par propagation, tous les projets.
CREATE TABLE problematiques (
  id             serial PRIMARY KEY,
  libelle        text NOT NULL UNIQUE,
  -- false tant que le rattachement aux axes n'a pas été relu par l'équipe.
  axes_valides   boolean NOT NULL DEFAULT false,
  cree_le        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE problematique_axes (
  problematique_id integer NOT NULL REFERENCES problematiques(id) ON DELETE CASCADE,
  axe_id           smallint NOT NULL REFERENCES axes_recherche(id) ON DELETE RESTRICT,
  PRIMARY KEY (problematique_id, axe_id)
);

CREATE TABLE categories_partenaire (
  id      serial PRIMARY KEY,
  libelle text NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- Personnes : fonction et expertises
-- ---------------------------------------------------------------------
ALTER TABLE personnes ADD COLUMN fonction text;
-- false pour les contributeurs hors équipe R&I (ex. « Équipe CO3P »).
ALTER TABLE personnes ADD COLUMN equipe_ri boolean NOT NULL DEFAULT true;
ALTER TABLE personnes ADD COLUMN ordre smallint NOT NULL DEFAULT 0;

ALTER TABLE expertises ADD COLUMN domaine text;

CREATE TABLE personne_expertises (
  personne_id  integer NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  expertise_id integer NOT NULL REFERENCES expertises(id) ON DELETE CASCADE,
  PRIMARY KEY (personne_id, expertise_id)
);

-- ---------------------------------------------------------------------
-- Partenaires : zone, catégorie, ville facultative
-- ---------------------------------------------------------------------
ALTER TABLE partenaires ALTER COLUMN ville DROP NOT NULL;
ALTER TABLE partenaires ALTER COLUMN pays DROP NOT NULL;
ALTER TABLE partenaires ADD COLUMN zone text;                  -- FR, EU, ER
ALTER TABLE partenaires ADD COLUMN categorie_id integer REFERENCES categories_partenaire(id) ON DELETE SET NULL;
ALTER TABLE partenaires ADD COLUMN utile_pour text;            -- ce que le partenariat apporte
-- D'où vient la localisation : « saisie » fait foi, les autres sont à vérifier.
ALTER TABLE partenaires ADD COLUMN localisation_source text NOT NULL DEFAULT 'saisie'
  CHECK (localisation_source IN ('saisie', 'recherche_web', 'deduite_du_nom', 'estimee', 'sans_lieu'));

-- ---------------------------------------------------------------------
-- Projets : plusieurs pilotes, plus d'auto-financement stocké
-- ---------------------------------------------------------------------
CREATE TABLE projet_pilotes (
  projet_id   integer NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  personne_id integer NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  PRIMARY KEY (projet_id, personne_id)
);

-- Reprise de l'ancien pilote unique avant de retirer la colonne.
INSERT INTO projet_pilotes (projet_id, personne_id)
SELECT id, pilote_id FROM projets WHERE pilote_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE projets DROP COLUMN pilote_id;

-- ---------------------------------------------------------------------
-- Questions : plusieurs projets, transition et problématique
-- ---------------------------------------------------------------------
CREATE TABLE question_projets (
  question_id integer NOT NULL REFERENCES questions_recherche(id) ON DELETE CASCADE,
  projet_id   integer NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, projet_id)
);

INSERT INTO question_projets (question_id, projet_id)
SELECT id, projet_id FROM questions_recherche WHERE projet_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE questions_recherche DROP COLUMN projet_id;
ALTER TABLE questions_recherche ADD COLUMN transition_id integer REFERENCES transitions_alimentaires(id) ON DELETE SET NULL;
ALTER TABLE questions_recherche ADD COLUMN problematique_id integer REFERENCES problematiques(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Idées brutes : elles portent le stade d'avancement avant validation.
-- Une idée reste brute tant que le CODIR ne l'a pas validée ; une fois
-- validée elle devient un projet « en préparation ».
-- ---------------------------------------------------------------------
CREATE TYPE statut_idee AS ENUM ('brute', 'attente_codir', 'attente_financement');
ALTER TABLE idees_brutes ADD COLUMN statut statut_idee NOT NULL DEFAULT 'brute';
ALTER TABLE idees_brutes ADD COLUMN titre text;          -- intitulé long, quand il existe
ALTER TABLE idees_brutes ADD COLUMN transition_id integer REFERENCES transitions_alimentaires(id) ON DELETE SET NULL;
ALTER TABLE idees_brutes ADD COLUMN problematique_id integer REFERENCES problematiques(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Vues recréées (supprimées en tête de migration)
-- ---------------------------------------------------------------------
CREATE VIEW v_partenaires AS
SELECT p.*,
       CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'libelle', c.libelle) END AS categorie,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'libelle', e.libelle, 'domaine', e.domaine) ORDER BY e.libelle)
                 FROM partenaire_expertises pe JOIN expertises e ON e.id = pe.expertise_id
                 WHERE pe.partenaire_id = p.id), '[]'::jsonb) AS expertises,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'acronyme', pr.acronyme) ORDER BY pr.acronyme)
                 FROM projet_partenaires pp JOIN projets pr ON pr.id = pp.projet_id
                 WHERE pp.partenaire_id = p.id), '[]'::jsonb) AS projets
FROM partenaires p
LEFT JOIN categories_partenaire c ON c.id = p.categorie_id;

CREATE VIEW v_projets AS
SELECT pr.*,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pe.id, 'nom', pe.nom) ORDER BY pe.ordre, pe.nom)
                 FROM projet_pilotes pp JOIN personnes pe ON pe.id = pp.personne_id
                 WHERE pp.projet_id = pr.id), '[]'::jsonb) AS pilotes,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle,
                                                     'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) ORDER BY a.ordre)
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
                 FROM question_projets qp JOIN questions_recherche q ON q.id = qp.question_id
                 WHERE qp.projet_id = pr.id), '[]'::jsonb) AS questions,
       (SELECT count(*) FROM transferts t WHERE t.projet_id = pr.id) AS nb_transferts
FROM projets pr;

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
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle,
                                                     'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) ORDER BY a.ordre)
                 FROM question_axes qa JOIN axes_recherche a ON a.id = qa.axe_id
                 WHERE qa.question_id = q.id), '[]'::jsonb) AS axes
FROM questions_recherche q
LEFT JOIN personnes  pe ON pe.id = q.pilote_id
LEFT JOIN grappes    g  ON g.id  = q.grappe_id
LEFT JOIN transitions_alimentaires tr ON tr.id = q.transition_id
LEFT JOIN problematiques pb ON pb.id = q.problematique_id;

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

-- Les personnes, avec leurs expertises et leur charge : alimente la page
-- Équipe et la suggestion de pilote.
CREATE VIEW v_personnes AS
SELECT p.*,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'libelle', e.libelle, 'domaine', e.domaine)
                                  ORDER BY e.domaine, e.libelle)
                 FROM personne_expertises pe JOIN expertises e ON e.id = pe.expertise_id
                 WHERE pe.personne_id = p.id), '[]'::jsonb) AS expertises,
       (SELECT count(*) FROM projet_pilotes pp JOIN projets pr ON pr.id = pp.projet_id
        WHERE pp.personne_id = p.id AND pr.statut = 'en_cours')       AS nb_projets_en_cours,
       (SELECT count(*) FROM projet_pilotes pp WHERE pp.personne_id = p.id) AS nb_projets_total,
       (SELECT count(*) FROM questions_recherche q WHERE q.pilote_id = p.id) AS nb_questions,
       (SELECT count(*) FROM idees_brutes i WHERE i.pilote_id = p.id)        AS nb_idees,
       (SELECT count(*) FROM transfert_pilotes tp WHERE tp.personne_id = p.id) AS nb_transferts
FROM personnes p;

-- Problématiques avec leurs axes et leur usage : alimente l'écran de
-- qualification.
CREATE VIEW v_problematiques AS
SELECT pb.*,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'libelle', a.libelle,
                                                     'couleur', a.couleur, 'couleur_sombre', a.couleur_sombre) ORDER BY a.ordre)
                 FROM problematique_axes pa JOIN axes_recherche a ON a.id = pa.axe_id
                 WHERE pa.problematique_id = pb.id), '[]'::jsonb) AS axes,
       (SELECT count(*) FROM questions_recherche q WHERE q.problematique_id = pb.id) AS nb_questions,
       COALESCE((SELECT jsonb_agg(q.libelle ORDER BY q.id)
                 FROM questions_recherche q WHERE q.problematique_id = pb.id), '[]'::jsonb) AS questions
FROM problematiques pb;

CREATE INDEX question_projets_projet_idx ON question_projets (projet_id);
CREATE INDEX projet_pilotes_personne_idx  ON projet_pilotes (personne_id);
