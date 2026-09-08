-- =====================================================================
-- Valeurs de référence.
--
-- ⚠️  Les 4 axes de recherche ci-dessous sont une PROPOSITION à valider :
--     ce sont les seules valeurs du fichier qui doivent impérativement
--     être relues et corrigées pour correspondre aux axes réels d'ADRIA.
--     Ils sont aussi modifiables à chaud depuis la page Réglages.
-- =====================================================================

INSERT INTO axes_recherche (code, libelle, couleur, ordre) VALUES
  ('AXE1', 'Sécurité microbiologique & maîtrise des dangers', '#2563eb', 1),
  ('AXE2', 'Procédés & technologies de conservation',          '#059669', 2),
  ('AXE3', 'Qualité, nutrition & durabilité',                  '#d97706', 3),
  ('AXE4', 'Données, modélisation & IA',                       '#9333ea', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO types_financement (libelle, ordre) VALUES
  ('En attente', 1), ('Carnot', 2), ('Région', 3), ('CASDAR', 4), ('Europe', 5),
  ('ANR', 6), ('FranceAgriMer', 7), ('BPI', 8), ('Autofinancement', 9), ('Privé', 10)
ON CONFLICT (libelle) DO NOTHING;

INSERT INTO labellisations (libelle) VALUES
  ('Valorial'), ('UMT TRANSISPORE'), ('Pôle Mer Bretagne Atlantique'), ('Vegepolys Valley')
ON CONFLICT (libelle) DO NOTHING;

INSERT INTO types_transfert (libelle, ordre) VALUES
  ('Publication peer-review', 1), ('Presse', 2), ('Conférence', 3), ('Symposium', 4),
  ('Workshop', 5), ('Poster', 6), ('Prestation ADRIA', 7), ('Outil', 8)
ON CONFLICT (libelle) DO NOTHING;
