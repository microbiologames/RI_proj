-- =====================================================================
-- Outil de pilotage des projets R&I — schéma initial
-- Bases séparées mais communicantes (cf. cahier des charges) :
--   questions de recherche · idées brutes · projets · partenaires · transferts
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- recherche floue / autocomplétion
CREATE EXTENSION IF NOT EXISTS unaccent;     -- « développement » ~ « developpement »

-- ---------------------------------------------------------------------
-- Référentiels
-- ---------------------------------------------------------------------

-- Les 4 axes de recherche. Table volontairement ouverte (pas d'enum) pour
-- rester modifiable, mais l'application suppose un petit nombre d'axes
-- (le diagramme de Venn est dessiné pour 4).
CREATE TABLE axes_recherche (
  id          smallserial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  libelle     text NOT NULL,
  couleur     text NOT NULL DEFAULT '#64748b',  -- hex, utilisée par le Venn et les chips
  ordre       smallint NOT NULL DEFAULT 0,
  actif       boolean NOT NULL DEFAULT true
);

CREATE TABLE personnes (
  id          serial PRIMARY KEY,
  nom         text NOT NULL UNIQUE,
  email       text,
  actif       boolean NOT NULL DEFAULT true,
  cree_le     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expertises (
  id          serial PRIMARY KEY,
  libelle     text NOT NULL UNIQUE
);

CREATE TABLE types_financement (
  id          serial PRIMARY KEY,
  libelle     text NOT NULL UNIQUE,
  ordre       smallint NOT NULL DEFAULT 0
);

CREATE TABLE labellisations (
  id          serial PRIMARY KEY,
  libelle     text NOT NULL UNIQUE
);

CREATE TABLE types_transfert (
  id          serial PRIMARY KEY,
  libelle     text NOT NULL UNIQUE,
  ordre       smallint NOT NULL DEFAULT 0
);

CREATE TYPE statut_projet AS ENUM ('en_preparation', 'en_cours', 'termine', 'abandonne');

-- ---------------------------------------------------------------------
-- Grappes : regroupement manuel (glisser-déposer / multi-sélection) ou
-- proposé par le module ADM. Une grappe rassemble des questions de
-- recherche OU des idées brutes, et peut être basculée en projet.
-- ---------------------------------------------------------------------
CREATE TABLE grappes (
  id            serial PRIMARY KEY,
  nom           text NOT NULL,
  type_entite   text NOT NULL CHECK (type_entite IN ('question', 'idee')),
  description   text,
  origine       text NOT NULL DEFAULT 'manuelle' CHECK (origine IN ('manuelle', 'adm')),
  projet_id     integer,          -- renseigné une fois la grappe basculée en projet
  cree_le       timestamptz NOT NULL DEFAULT now(),
  maj_le        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Partenaires
-- ---------------------------------------------------------------------
CREATE TABLE partenaires (
  id          serial PRIMARY KEY,
  nom         text NOT NULL UNIQUE,
  ville       text NOT NULL,
  pays        text NOT NULL,
  latitude    double precision,     -- rempli par le géocodage (cartographie)
  longitude   double precision,
  notes       text,
  verrouille  boolean NOT NULL DEFAULT false,
  cree_le     timestamptz NOT NULL DEFAULT now(),
  maj_le      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE partenaire_expertises (
  partenaire_id integer NOT NULL REFERENCES partenaires(id) ON DELETE CASCADE,
  expertise_id  integer NOT NULL REFERENCES expertises(id) ON DELETE CASCADE,
  PRIMARY KEY (partenaire_id, expertise_id)
);

-- ---------------------------------------------------------------------
-- Projets
-- ---------------------------------------------------------------------
CREATE TABLE projets (
  id               serial PRIMARY KEY,
  acronyme         text NOT NULL UNIQUE,
  titre            text NOT NULL,
  statut           statut_projet NOT NULL DEFAULT 'en_preparation',
  pilote_id        integer REFERENCES personnes(id) ON DELETE SET NULL,
  date_debut       date,
  date_fin         date,
  budget_total     numeric(12,2),
  budget_adria     numeric(12,2),
  pct_financement  numeric(5,2),
  contributions_adria text,   -- alimente le cartouche pitch
  notes            text,
  verrouille       boolean NOT NULL DEFAULT false,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  maj_le           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dates_coherentes CHECK (date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut)
);

ALTER TABLE grappes
  ADD CONSTRAINT grappes_projet_fk FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE SET NULL;

CREATE TABLE projet_axes (
  projet_id integer NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  axe_id    smallint NOT NULL REFERENCES axes_recherche(id) ON DELETE RESTRICT,
  PRIMARY KEY (projet_id, axe_id)
);

CREATE TABLE projet_partenaires (
  projet_id     integer NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  partenaire_id integer NOT NULL REFERENCES partenaires(id) ON DELETE CASCADE,
  role          text,
  PRIMARY KEY (projet_id, partenaire_id)
);

CREATE TABLE projet_financements (
  projet_id      integer NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  financement_id integer NOT NULL REFERENCES types_financement(id) ON DELETE RESTRICT,
  PRIMARY KEY (projet_id, financement_id)
);

CREATE TABLE projet_labellisations (
  projet_id       integer NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  labellisation_id integer NOT NULL REFERENCES labellisations(id) ON DELETE RESTRICT,
  PRIMARY KEY (projet_id, labellisation_id)
);

-- ---------------------------------------------------------------------
-- Questions de recherche
-- ---------------------------------------------------------------------
CREATE TABLE questions_recherche (
  id          serial PRIMARY KEY,
  libelle     text NOT NULL,
  pilote_id   integer REFERENCES personnes(id) ON DELETE SET NULL,
  projet_id   integer REFERENCES projets(id) ON DELETE SET NULL,
  grappe_id   integer REFERENCES grappes(id) ON DELETE SET NULL,
  notes       text,
  verrouille  boolean NOT NULL DEFAULT false,
  cree_le     timestamptz NOT NULL DEFAULT now(),
  maj_le      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE question_axes (
  question_id integer NOT NULL REFERENCES questions_recherche(id) ON DELETE CASCADE,
  axe_id      smallint NOT NULL REFERENCES axes_recherche(id) ON DELETE RESTRICT,
  PRIMARY KEY (question_id, axe_id)
);

-- ---------------------------------------------------------------------
-- Idées brutes — structure identique aux projets mais informations manquantes
-- ---------------------------------------------------------------------
CREATE TABLE idees_brutes (
  id            serial PRIMARY KEY,
  libelle       text NOT NULL,               -- 1 phrase décrivant l'idée
  pilote_id     integer REFERENCES personnes(id) ON DELETE SET NULL,
  partenaire_id integer REFERENCES partenaires(id) ON DELETE SET NULL,
  grappe_id     integer REFERENCES grappes(id) ON DELETE SET NULL,
  projet_id     integer REFERENCES projets(id) ON DELETE SET NULL,  -- si basculée en projet
  notes         text,
  verrouille    boolean NOT NULL DEFAULT false,
  cree_le       timestamptz NOT NULL DEFAULT now(),
  maj_le        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idee_axes (
  idee_id integer NOT NULL REFERENCES idees_brutes(id) ON DELETE CASCADE,
  axe_id  smallint NOT NULL REFERENCES axes_recherche(id) ON DELETE RESTRICT,
  PRIMARY KEY (idee_id, axe_id)
);

-- ---------------------------------------------------------------------
-- Transferts
-- ---------------------------------------------------------------------
CREATE TABLE transferts (
  id          serial PRIMARY KEY,
  libelle     text NOT NULL,
  type_id     integer NOT NULL REFERENCES types_transfert(id) ON DELETE RESTRICT,
  ville       text,
  pays        text,
  latitude    double precision,
  longitude   double precision,
  projet_id   integer REFERENCES projets(id) ON DELETE SET NULL,
  date_transfert date,
  reference   text,          -- DOI, lien, référence de publication
  notes       text,
  verrouille  boolean NOT NULL DEFAULT false,
  cree_le     timestamptz NOT NULL DEFAULT now(),
  maj_le      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transfert_pilotes (
  transfert_id integer NOT NULL REFERENCES transferts(id) ON DELETE CASCADE,
  personne_id  integer NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  PRIMARY KEY (transfert_id, personne_id)
);

-- ---------------------------------------------------------------------
-- Journal (historique des logs)
-- ---------------------------------------------------------------------
CREATE TABLE journal (
  id            bigserial PRIMARY KEY,
  horodatage    timestamptz NOT NULL DEFAULT now(),
  entite        text NOT NULL,     -- 'projet', 'question', 'idee', 'partenaire', 'transfert', 'grappe'
  entite_id     integer,
  action        text NOT NULL CHECK (action IN ('creation', 'modification', 'suppression', 'bascule', 'grappage', 'import')),
  resume        text NOT NULL,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { champ: { avant, apres } }
  auteur        text                                  -- facultatif : pas d'authentification
);

CREATE INDEX journal_horodatage_idx ON journal (horodatage DESC);
CREATE INDEX journal_entite_idx     ON journal (entite, entite_id);

-- ---------------------------------------------------------------------
-- Index de recherche / autocomplétion
-- ---------------------------------------------------------------------
CREATE INDEX questions_libelle_trgm ON questions_recherche USING gin (libelle gin_trgm_ops);
CREATE INDEX idees_libelle_trgm     ON idees_brutes        USING gin (libelle gin_trgm_ops);
CREATE INDEX projets_titre_trgm     ON projets             USING gin (titre gin_trgm_ops);
CREATE INDEX partenaires_nom_trgm   ON partenaires         USING gin (nom gin_trgm_ops);
CREATE INDEX transferts_libelle_trgm ON transferts         USING gin (libelle gin_trgm_ops);

-- ---------------------------------------------------------------------
-- maj_le automatique
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_maj_le() RETURNS trigger AS $$
BEGIN
  NEW.maj_le := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projets','questions_recherche','idees_brutes','partenaires','transferts','grappes']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_maj_le()', t, t);
  END LOOP;
END $$;
