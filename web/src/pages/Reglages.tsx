import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, auteurActuel, definirAuteur, ErreurApi } from '../lib/api';
import { couleurAxe, useThemeSombre } from '../lib/utils';
import { Bandeau } from '../components/Base';
import { EntetePage, useEtatAdm, useReferentiels } from './commun';

export function PageReglages() {
  const sombre = useThemeSombre();
  const qc = useQueryClient();
  const { data: referentiels } = useReferentiels();
  const { data: adm } = useEtatAdm();

  const [nom, setNom] = useState(auteurActuel());
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function rattraperGeocodage() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await api.rattraperGeocodage();
      setMessage(`${r.traites} entrée(s) traitée(s). Les partenaires et transferts localisés apparaissent sur les cartes.`);
      void qc.invalidateQueries();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <EntetePage titre="Réglages" sousTitre="Identité pour le journal, axes de recherche, géolocalisation et état du module d'acquisition." />

      {message && <Bandeau>{message}</Bandeau>}
      {erreur && <Bandeau type="erreur">{erreur}</Bandeau>}

      <div className="pile" style={{ maxWidth: 780 }}>
        <section className="panneau">
          <h3>Votre nom</h3>
          <p className="attenue petit">
            L'application ne demande pas d'authentification. Ce nom, facultatif, est simplement joint à vos écritures
            dans le journal : sans lui, elles apparaissent comme « anonyme ». Il reste dans votre navigateur.
          </p>
          <div className="ligne">
            <input
              type="text"
              value={nom}
              placeholder="Prénom Nom"
              style={{ maxWidth: 280 }}
              onChange={(e) => setNom(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primaire"
              onClick={() => {
                definirAuteur(nom);
                setMessage(nom.trim() ? `Vos écritures seront signées « ${nom.trim()} ».` : 'Vos écritures seront anonymes.');
              }}
            >
              Enregistrer
            </button>
          </div>
        </section>

        <section className="panneau">
          <h3>Axes de recherche</h3>
          <p className="attenue petit">
            Les quatre axes structurent toutes les bases et le diagramme de Venn. Les libellés livrés sont une
            proposition : corrigez-les pour qu'ils correspondent aux axes réels. Deux couleurs par axe, l'une pour le
            thème clair, l'autre pour le thème sombre — le jeu par défaut a été vérifié pour rester distinguable, y
            compris en cas de daltonisme.
          </p>
          <div className="pile">
            {(referentiels?.axes ?? []).map((axe) => (
              <div key={axe.id} className="ligne">
                <span className="chip chip-lecture" style={{ minWidth: 66 }}>
                  <span className="pastille" style={{ background: couleurAxe(axe, sombre) }} />
                  {axe.code}
                </span>
                <input
                  type="text"
                  defaultValue={axe.libelle}
                  style={{ flex: 1, minWidth: 220 }}
                  onBlur={async (e) => {
                    if (e.target.value.trim() === axe.libelle) return;
                    await api.modifierAxe(axe.id, { libelle: e.target.value.trim() });
                    void qc.invalidateQueries({ queryKey: ['referentiels'] });
                    setMessage('Axe mis à jour.');
                  }}
                />
                <input
                  type="color"
                  defaultValue={axe.couleur}
                  title="Couleur en thème clair"
                  style={{ width: 42, padding: 2 }}
                  onBlur={async (e) => {
                    await api.modifierAxe(axe.id, { couleur: e.target.value });
                    void qc.invalidateQueries({ queryKey: ['referentiels'] });
                  }}
                />
                <input
                  type="color"
                  defaultValue={axe.couleur_sombre}
                  title="Couleur en thème sombre"
                  style={{ width: 42, padding: 2 }}
                  onBlur={async (e) => {
                    await api.modifierAxe(axe.id, { couleur_sombre: e.target.value });
                    void qc.invalidateQueries({ queryKey: ['referentiels'] });
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="panneau">
          <h3>Géolocalisation</h3>
          <p className="attenue petit">
            Les partenaires et transferts sont placés sur les cartes à partir de leur ville et de leur pays. Ce
            rattrapage complète les coordonnées manquantes (jusqu'à 100 entrées par base, à raison d'une par seconde —
            la limite du service OpenStreetMap).
          </p>
          <button type="button" className="btn" disabled={enCours} onClick={rattraperGeocodage}>
            {enCours ? 'Géocodage en cours…' : 'Compléter les coordonnées manquantes'}
          </button>
        </section>

        <section className="panneau">
          <h3>Acquisition de données multimodale</h3>
          <p className="attenue petit" style={{ marginBottom: 6 }}>
            {adm?.disponible ? (
              <>
                Module actif, modèle <code className="mono">{adm.modele}</code>. Le texte collé dans la boîte de
                dialogue est transmis au service pour analyse ; les propositions renvoyées ne sont enregistrées
                qu'après votre validation.
              </>
            ) : (
              <>
                Module inactif : la variable d'environnement <code className="mono">ANTHROPIC_API_KEY</code> n'est pas
                définie sur le serveur. La saisie manuelle reste disponible partout.
              </>
            )}
          </p>
        </section>

        <section className="panneau">
          <h3>Référentiels</h3>
          <div className="pile" style={{ gap: 6 }}>
            {[
              ['Pilotes', referentiels?.personnes.length],
              ['Expertises', referentiels?.expertises.length],
              ['Types de financement', referentiels?.financements.length],
              ['Labellisations', referentiels?.labellisations.length],
              ['Types de transfert', referentiels?.types_transfert.length],
            ].map(([libelle, n]) => (
              <div key={String(libelle)} className="ligne petit">
                <span>{libelle}</span>
                <span className="pousse-droite attenue">{n ?? 0} valeur(s)</span>
              </div>
            ))}
          </div>
          <p className="attenue petit" style={{ marginBottom: 0, marginTop: 8 }}>
            Ces listes s'enrichissent au fil de la saisie : taper une valeur absente dans un champ propose de la créer.
          </p>
        </section>
      </div>
    </>
  );
}
