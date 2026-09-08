import { useState } from 'react';
import { api, ErreurApi } from '../lib/api';
import type { PropositionAdm, Referentiels } from '../lib/types';
import { couleurAxe, useThemeSombre } from '../lib/utils';
import { Bandeau, ChoixMultiple, Modale, SaisieAssistee } from './Base';

type Cible = 'question' | 'idee';

/** Ligne de proposition telle qu'affichée, après corrections de l'utilisateur. */
interface EntreeEditable {
  libelle: string;
  axes: number[];
  pilote_id: number | null;
  partenaire_id: number | null;
  justification: string;
  retenue: boolean;
}

/**
 * Acquisition de Données Multimodale.
 *
 * Deux temps, volontairement séparés : le modèle propose, l'utilisateur
 * dispose. Rien n'est écrit en base tant que « Enregistrer » n'a pas été
 * cliqué, et chaque ligne reste modifiable et décochable avant validation.
 */
export function DialogueAdm({
  cible,
  referentiels,
  admDisponible,
  onFermer,
  onEnregistre,
}: {
  cible: Cible;
  referentiels: Referentiels;
  admDisponible: boolean;
  onFermer: () => void;
  onEnregistre: (message: string) => void;
}) {
  const sombre = useThemeSombre();
  const [texte, setTexte] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [proposition, setProposition] = useState<PropositionAdm | null>(null);
  const [entrees, setEntrees] = useState<EntreeEditable[]>([]);
  const [fusions, setFusions] = useState<boolean[]>([]);
  const [grappes, setGrappes] = useState<boolean[]>([]);

  const intitule = cible === 'question' ? 'question de recherche' : 'idée brute';

  async function analyser() {
    setEnCours(true);
    setErreur(null);
    try {
      const p = await api.analyserAdm(cible, texte);
      setProposition(p);
      setEntrees(
        p.entrees.map((e) => ({
          libelle: e.libelle,
          axes: e.axes,
          pilote_id: referentiels.personnes.find((x) => x.nom === e.pilote)?.id ?? null,
          partenaire_id: null,
          justification: e.justification,
          retenue: true,
        })),
      );
      setFusions(p.fusions.map(() => true));
      setGrappes(p.grappes.map(() => true));
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  }

  /** Saisie manuelle : une ligne vide, sans passer par le modèle. */
  function ajouterLigneVide() {
    setProposition((p) => p ?? { langue_source: 'français', entrees: [], fusions: [], grappes: [] });
    setEntrees((v) => [
      ...v,
      { libelle: '', axes: [], pilote_id: null, partenaire_id: null, justification: 'Saisie manuelle', retenue: true },
    ]);
  }

  const retenues = entrees.filter((e) => e.retenue);
  const incompletes = retenues.filter((e) => !e.libelle.trim() || e.axes.length === 0);

  async function enregistrer() {
    setEnCours(true);
    setErreur(null);
    try {
      // Les index des entrées retenues changent : on recalcule la correspondance.
      const indexFinal = new Map<number, number>();
      entrees.forEach((e, i) => {
        if (e.retenue) indexFinal.set(i, indexFinal.size);
      });

      const resultat = await api.appliquerAdm({
        cible,
        entrees: retenues.map((e) => ({
          libelle: e.libelle.trim(),
          axes: e.axes,
          pilote_id: e.pilote_id,
          partenaire_id: cible === 'idee' ? e.partenaire_id : undefined,
        })),
        fusions: (proposition?.fusions ?? [])
          .filter((_, i) => fusions[i])
          .map((f) => ({ entree_existante_id: f.entree_existante_id, libelle_fusionne: f.libelle_fusionne })),
        grappes: (proposition?.grappes ?? [])
          .filter((_, i) => grappes[i])
          .map((g) => ({
            nom: g.nom,
            description: g.justification,
            index_entrees_nouvelles: g.index_entrees_nouvelles
              .map((i) => indexFinal.get(i))
              .filter((v): v is number => v !== undefined),
            ids_entrees_existantes: g.ids_entrees_existantes,
          })),
      });
      onEnregistre(
        `${resultat.creees.length} entrée(s) créée(s)` +
          (resultat.grappes.length ? `, ${resultat.grappes.length} grappe(s)` : '') +
          (resultat.message ? ` — ${resultat.message}` : ''),
      );
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : String(e));
      setEnCours(false);
    }
  }

  return (
    <Modale
      titre={`Acquisition de données — ${intitule}`}
      onFermer={onFermer}
      large
      pied={
        proposition ? (
          <>
            <button type="button" className="btn" onClick={() => setProposition(null)}>
              ← Revenir au texte
            </button>
            <button type="button" className="btn" onClick={ajouterLigneVide}>
              + Ligne vide
            </button>
            <button
              type="button"
              className="btn btn-primaire"
              disabled={enCours || retenues.length === 0 || incompletes.length > 0}
              onClick={enregistrer}
              title={incompletes.length ? 'Chaque entrée retenue doit avoir un énoncé et au moins un axe.' : undefined}
            >
              Enregistrer {retenues.length} entrée(s)
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={ajouterLigneVide}>
              Saisir manuellement
            </button>
            <button
              type="button"
              className="btn btn-primaire"
              disabled={enCours || texte.trim().length < 3 || !admDisponible}
              onClick={analyser}
            >
              {enCours ? 'Analyse en cours…' : 'Analyser le texte'}
            </button>
          </>
        )
      }
    >
      {erreur && <Bandeau type="erreur">{erreur}</Bandeau>}

      {!proposition && (
        <>
          {!admDisponible && (
            <Bandeau type="erreur">
              Le traitement automatique n'est pas configuré sur ce serveur. Utilisez « Saisir manuellement ».
            </Bandeau>
          )}
          <Bandeau>
            Collez vos notes telles quelles — compte rendu de réunion, courriel, notes de conférence, dans
            n'importe quelle langue. Le texte est découpé en entrées, traduit en français, comparé aux entrées
            existantes, et regroupé si un lien apparaît. <strong>Rien n'est enregistré sans votre validation.</strong>
          </Bandeau>
          <label className="champ">
            <span>Texte brut</span>
            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              rows={12}
              placeholder="Ex. : During the meeting, INRAE suggested testing HPP on ready meals; we also discussed…"
            />
          </label>
        </>
      )}

      {proposition && (
        <div className="pile">
          {proposition.langue_source && !/fran[çc]ais/i.test(proposition.langue_source) && (
            <Bandeau>Texte détecté en {proposition.langue_source} — les énoncés ci-dessous ont été traduits.</Bandeau>
          )}

          <section>
            <h3 style={{ marginBottom: 6 }}>Entrées proposées ({retenues.length} retenue(s))</h3>
            <div className="pile">
              {entrees.map((e, i) => (
                <div key={i} className="panneau" style={{ opacity: e.retenue ? 1 : 0.5 }}>
                  <div className="ligne" style={{ marginBottom: 8 }}>
                    <label className="ligne petit" style={{ gap: 5 }}>
                      <input
                        type="checkbox"
                        checked={e.retenue}
                        onChange={() =>
                          setEntrees((v) => v.map((x, j) => (j === i ? { ...x, retenue: !x.retenue } : x)))
                        }
                      />
                      Retenir
                    </label>
                    <span className="attenue petit pousse-droite">{e.justification}</span>
                  </div>

                  <label className="champ">
                    <span>Énoncé <span className="requis">*</span></span>
                    <textarea
                      rows={2}
                      value={e.libelle}
                      onChange={(ev) =>
                        setEntrees((v) => v.map((x, j) => (j === i ? { ...x, libelle: ev.target.value } : x)))
                      }
                    />
                  </label>

                  <label className="champ">
                    <span>Axes de recherche <span className="requis">*</span></span>
                    <ChoixMultiple
                      valeurs={e.axes}
                      options={referentiels.axes.map((a) => ({ id: a.id, libelle: a.libelle }))}
                      couleurs={Object.fromEntries(referentiels.axes.map((a) => [a.id, couleurAxe(a, sombre)]))}
                      onChanger={(ids) => setEntrees((v) => v.map((x, j) => (j === i ? { ...x, axes: ids } : x)))}
                    />
                  </label>

                  <div className="grille-champs">
                    <label className="champ">
                      <span>Pilote</span>
                      <SaisieAssistee
                        valeur={e.pilote_id}
                        options={referentiels.personnes.map((p) => ({ id: p.id, libelle: p.nom }))}
                        onChoisir={(id) => setEntrees((v) => v.map((x, j) => (j === i ? { ...x, pilote_id: id } : x)))}
                        onCreer={async (nom) => {
                          const cree = await api.creerReference('personnes', { libelle: nom });
                          return { id: cree.id, libelle: cree.nom ?? nom };
                        }}
                        placeholder="Aucun"
                      />
                    </label>
                  </div>
                </div>
              ))}
              {entrees.length === 0 && <p className="attenue petit">Aucune entrée proposée pour ce texte.</p>}
            </div>
          </section>

          {proposition.fusions.length > 0 && (
            <section>
              <h3 style={{ marginBottom: 6 }}>Doublons détectés</h3>
              <p className="attenue petit" style={{ margin: '0 0 8px' }}>
                L'énoncé de l'entrée déjà en base serait remplacé par une formulation couvrant les deux.
              </p>
              <div className="pile">
                {proposition.fusions.map((f, i) => (
                  <label key={i} className="panneau ligne" style={{ alignItems: 'flex-start', gap: 9 }}>
                    <input
                      type="checkbox"
                      checked={fusions[i] ?? false}
                      onChange={() => setFusions((v) => v.map((x, j) => (j === i ? !x : x)))}
                    />
                    <div>
                      <p style={{ margin: 0, fontWeight: 500 }}>{f.libelle_fusionne}</p>
                      <p className="attenue petit" style={{ margin: '3px 0 0' }}>
                        Remplace l'entrée #{f.entree_existante_id} · {f.justification}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </section>
          )}

          {proposition.grappes.length > 0 && (
            <section>
              <h3 style={{ marginBottom: 6 }}>Grappes proposées</h3>
              <p className="attenue petit" style={{ margin: '0 0 8px' }}>
                Une grappe validée peut ensuite être basculée en projet « en préparation » d'un clic.
              </p>
              <div className="pile">
                {proposition.grappes.map((g, i) => (
                  <label key={i} className="panneau ligne" style={{ alignItems: 'flex-start', gap: 9 }}>
                    <input
                      type="checkbox"
                      checked={grappes[i] ?? false}
                      onChange={() => setGrappes((v) => v.map((x, j) => (j === i ? !x : x)))}
                    />
                    <div>
                      <p style={{ margin: 0, fontWeight: 500 }}>{g.nom}</p>
                      <p className="attenue petit" style={{ margin: '3px 0 0' }}>
                        {g.index_entrees_nouvelles.length} nouvelle(s) + {g.ids_entrees_existantes.length} existante(s)
                        · {g.justification}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </section>
          )}

          {incompletes.length > 0 && (
            <Bandeau type="erreur">
              {incompletes.length} entrée(s) retenue(s) sans énoncé ou sans axe de recherche : complétez-les ou
              décochez-les.
            </Bandeau>
          )}
        </div>
      )}
    </Modale>
  );
}
