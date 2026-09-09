-- =====================================================================
-- Préparation de l'intégration avec un outil de gestion tiers (ERP).
--
-- Deux principes :
--
--   1. Un identifiant stable. L'identifiant numérique d'une ligne dépend de
--      l'ordre d'insertion : un réimport le change, et toute correspondance
--      établie côté ERP serait perdue. On ajoute donc un UUID, dérivé de la
--      clé naturelle là où il en existe une (acronyme d'un projet, nom d'un
--      partenaire) — le même projet réimporté retrouve le même identifiant.
--
--   2. Une surface de lecture séparée. Le schéma « integration » expose des
--      vues plates et stables ; c'est le contrat. Les tables et les vues
--      applicatives restent libres d'évoluer derrière.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identifiants stables
-- ---------------------------------------------------------------------

/**
 * UUID déterministe dérivé d'un texte : la même clé naturelle donne toujours
 * le même identifiant, y compris sur une base reconstruite de zéro.
 *
 * La casse est conservée volontairement. L'export MS List contient des
 * acronymes qui ne diffèrent que par elle (SPOREFISH / Sporefish, deux projets
 * distincts) : les replier produirait deux fois le même identifiant. Seuls les
 * accents et les espaces superflus sont normalisés.
 *
 * L'identifiant n'est posé qu'à la création : corriger un acronyme plus tard
 * ne le change pas.
 */
CREATE OR REPLACE FUNCTION uuid_depuis_texte(v text) RETURNS uuid AS $$
  SELECT md5(regexp_replace(unaccent(coalesce(v, '')), '\s+', ' ', 'g'))::uuid;
$$ LANGUAGE sql IMMUTABLE;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projets','questions_recherche','idees_brutes','partenaires','transferts','personnes']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN uuid uuid NOT NULL DEFAULT gen_random_uuid()', t);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I_uuid_unique UNIQUE (uuid)', t, t);
    -- Référence de l'entrée dans l'outil de gestion, renseignée au moment
    -- du rapprochement. Unique quand elle est présente.
    EXECUTE format('ALTER TABLE %I ADD COLUMN code_externe text', t);
    EXECUTE format('CREATE UNIQUE INDEX %I_code_externe_unique ON %I (code_externe) WHERE code_externe IS NOT NULL', t, t);
  END LOOP;
END $$;

/** Pose l'UUID dérivé de la clé naturelle quand l'appelant n'en fournit pas. */
CREATE OR REPLACE FUNCTION poser_uuid_stable() RETURNS trigger AS $$
DECLARE cle text;
BEGIN
  IF TG_ARGV[0] IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT ($1).%I::text', TG_ARGV[0]) INTO cle USING NEW;
  IF cle IS NOT NULL AND cle <> '' THEN
    NEW.uuid := uuid_depuis_texte(TG_TABLE_NAME || ':' || cle);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Seules ces trois tables ont une clé naturelle assez stable pour cela.
CREATE TRIGGER projets_uuid     BEFORE INSERT ON projets     FOR EACH ROW EXECUTE FUNCTION poser_uuid_stable('acronyme');
CREATE TRIGGER partenaires_uuid BEFORE INSERT ON partenaires FOR EACH ROW EXECUTE FUNCTION poser_uuid_stable('nom');
CREATE TRIGGER personnes_uuid   BEFORE INSERT ON personnes   FOR EACH ROW EXECUTE FUNCTION poser_uuid_stable('nom');

-- Reprise des lignes déjà en base.
UPDATE projets     SET uuid = uuid_depuis_texte('projets:' || acronyme);
UPDATE partenaires SET uuid = uuid_depuis_texte('partenaires:' || nom);
UPDATE personnes   SET uuid = uuid_depuis_texte('personnes:' || nom);

-- ---------------------------------------------------------------------
-- Surface de lecture pour l'outil de gestion
--
-- Vues plates : un ERP consomme mal du JSON. Les valeurs multiples sont
-- agrégées en texte séparé par « ; », et les vues de liaison donnent le
-- détail à qui veut le normaliser.
-- ---------------------------------------------------------------------
CREATE SCHEMA integration;

COMMENT ON SCHEMA integration IS
  'Surface de lecture stable pour les outils tiers. Les colonnes de ces vues '
  'ne sont ni renommées ni supprimées sans préavis ; des colonnes peuvent être '
  'ajoutées. Ne jamais lire les tables directement.';

CREATE VIEW integration.projets AS
SELECT p.uuid                                   AS id,
       p.code_externe,
       p.acronyme,
       p.titre,
       p.statut::text                           AS statut,
       p.date_debut,
       p.date_fin,
       p.budget_total,
       p.budget_adria,
       p.pct_financement,
       p.contributions_adria,
       (SELECT string_agg(pe.nom, ' ; ' ORDER BY pe.nom)
        FROM projet_pilotes pp JOIN personnes pe ON pe.id = pp.personne_id
        WHERE pp.projet_id = p.id)               AS pilotes,
       (SELECT string_agg(a.code || ' — ' || a.libelle, ' ; ' ORDER BY a.ordre)
        FROM projet_axes pa JOIN axes_recherche a ON a.id = pa.axe_id
        WHERE pa.projet_id = p.id)               AS axes_recherche,
       (SELECT string_agg(tf.libelle, ' ; ' ORDER BY tf.libelle)
        FROM projet_financements pf JOIN types_financement tf ON tf.id = pf.financement_id
        WHERE pf.projet_id = p.id)               AS financements,
       (SELECT string_agg(l.libelle, ' ; ' ORDER BY l.libelle)
        FROM projet_labellisations pl JOIN labellisations l ON l.id = pl.labellisation_id
        WHERE pl.projet_id = p.id)               AS labellisations,
       (SELECT string_agg(pt.nom, ' ; ' ORDER BY pt.nom)
        FROM projet_partenaires pp JOIN partenaires pt ON pt.id = pp.partenaire_id
        WHERE pp.projet_id = p.id)               AS partenaires,
       (SELECT count(*) FROM question_projets qp WHERE qp.projet_id = p.id) AS nb_questions,
       p.cree_le,
       p.maj_le
FROM projets p;

CREATE VIEW integration.personnes AS
SELECT p.uuid AS id, p.code_externe, p.nom, p.fonction, p.email, p.equipe_ri, p.actif,
       (SELECT string_agg(e.libelle, ' ; ' ORDER BY e.libelle)
        FROM personne_expertises pe JOIN expertises e ON e.id = pe.expertise_id
        WHERE pe.personne_id = p.id) AS expertises
FROM personnes p;

CREATE VIEW integration.partenaires AS
SELECT p.uuid AS id, p.code_externe, p.nom, p.ville, p.pays, p.zone,
       c.libelle AS categorie, p.utile_pour,
       (SELECT string_agg(e.libelle, ' ; ' ORDER BY e.libelle)
        FROM partenaire_expertises pe JOIN expertises e ON e.id = pe.expertise_id
        WHERE pe.partenaire_id = p.id) AS expertises
FROM partenaires p
LEFT JOIN categories_partenaire c ON c.id = p.categorie_id;

CREATE VIEW integration.questions_recherche AS
SELECT q.uuid AS id, q.libelle, pe.nom AS pilote,
       t.libelle AS transition_alimentaire, pb.libelle AS problematique,
       (SELECT string_agg(a.code, ' ; ' ORDER BY a.ordre)
        FROM question_axes qa JOIN axes_recherche a ON a.id = qa.axe_id
        WHERE qa.question_id = q.id) AS axes_recherche,
       (SELECT string_agg(pr.acronyme, ' ; ' ORDER BY pr.acronyme)
        FROM question_projets qp JOIN projets pr ON pr.id = qp.projet_id
        WHERE qp.question_id = q.id) AS projets,
       q.cree_le, q.maj_le
FROM questions_recherche q
LEFT JOIN personnes pe ON pe.id = q.pilote_id
LEFT JOIN transitions_alimentaires t ON t.id = q.transition_id
LEFT JOIN problematiques pb ON pb.id = q.problematique_id;

CREATE VIEW integration.transferts AS
SELECT t.uuid AS id, t.libelle, tt.libelle AS type, t.ville, t.pays,
       t.date_transfert, t.reference, pr.acronyme AS projet, pr.uuid AS projet_id,
       (SELECT string_agg(pe.nom, ' ; ' ORDER BY pe.nom)
        FROM transfert_pilotes tp JOIN personnes pe ON pe.id = tp.personne_id
        WHERE tp.transfert_id = t.id) AS pilotes,
       t.cree_le, t.maj_le
FROM transferts t
JOIN types_transfert tt ON tt.id = t.type_id
LEFT JOIN projets pr ON pr.id = t.projet_id;

-- Liaisons, pour qui préfère des données normalisées à des chaînes agrégées.
CREATE VIEW integration.projet_pilotes AS
SELECT pr.uuid AS projet_id, pe.uuid AS personne_id, pr.acronyme, pe.nom
FROM projet_pilotes pp JOIN projets pr ON pr.id = pp.projet_id JOIN personnes pe ON pe.id = pp.personne_id;

CREATE VIEW integration.projet_partenaires AS
SELECT pr.uuid AS projet_id, pt.uuid AS partenaire_id, pr.acronyme, pt.nom
FROM projet_partenaires pp JOIN projets pr ON pr.id = pp.projet_id JOIN partenaires pt ON pt.id = pp.partenaire_id;

CREATE VIEW integration.projet_axes AS
SELECT pr.uuid AS projet_id, pr.acronyme, a.code, a.libelle
FROM projet_axes pa JOIN projets pr ON pr.id = pa.projet_id JOIN axes_recherche a ON a.id = pa.axe_id;

-- ---------------------------------------------------------------------
-- Rôle de lecture. Le mot de passe est posé au déploiement, pas ici :
-- une migration est versionnée, un secret ne doit pas l'être.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lecture_integration') THEN
    CREATE ROLE lecture_integration NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA integration TO lecture_integration;
GRANT SELECT ON ALL TABLES IN SCHEMA integration TO lecture_integration;
ALTER DEFAULT PRIVILEGES IN SCHEMA integration GRANT SELECT ON TABLES TO lecture_integration;
-- Aucun droit sur le schéma applicatif : la surface de lecture est la seule
-- chose qu'un outil tiers peut atteindre.
REVOKE ALL ON SCHEMA public FROM lecture_integration;
