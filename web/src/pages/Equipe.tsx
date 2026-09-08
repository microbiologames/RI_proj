import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PersonneDetail } from '../lib/types';
import { normaliser } from '../lib/utils';
import { BoutonExcel, EntetePage, PanneauVisuel } from './commun';
import type { Colonne } from '../components/Tableau';

/**
 * Équipe R&I : qui maîtrise quoi et qui porte quoi.
 *
 * Deux lectures de la même matrice : par collaborateur (ses expertises et sa
 * charge) et par expertise (qui la couvre — et surtout, qui est seul à la
 * couvrir).
 */
export function PageEquipe() {
  const equipe = useQuery({ queryKey: ['equipe'], queryFn: api.equipe });
  const matrice = useQuery({ queryKey: ['matrice-expertises'], queryFn: api.matriceExpertises });

  const [vue, setVue] = useState<'personnes' | 'expertises'>('personnes');
  const [recherche, setRecherche] = useState('');
  const [inclureHorsEquipe, setInclureHorsEquipe] = useState(false);

  const personnes = useMemo(() => {
    const q = normaliser(recherche);
    return (equipe.data ?? []).filter((p) => {
      if (!inclureHorsEquipe && !p.equipe_ri) return false;
      if (!q) return true;
      return normaliser(p.nom).includes(q)
        || normaliser(p.fonction ?? '').includes(q)
        || p.expertises.some((e) => normaliser(e.libelle).includes(q));
    });
  }, [equipe.data, recherche, inclureHorsEquipe]);

  const expertises = useMemo(() => {
    const q = normaliser(recherche);
    return (matrice.data ?? []).filter(
      (e) =>
        !q || normaliser(e.libelle).includes(q) || normaliser(e.domaine ?? '').includes(q)
        || e.personnes.some((p) => normaliser(p.nom).includes(q)),
    );
  }, [matrice.data, recherche]);

  /** Une expertise portée par une seule personne est un point de fragilité. */
  const fragiles = (matrice.data ?? []).filter((e) => e.personnes.filter((p) => p.nom !== 'Equipe CO3P (Opérations hors R&I)').length === 1);

  const colonnesExport: Colonne<PersonneDetail>[] = [
    { cle: 'nom', entete: 'Collaborateur', rendu: (p) => p.nom },
    { cle: 'fonction', entete: 'Fonction', rendu: (p) => p.fonction ?? '' },
    { cle: 'expertises', entete: 'Expertises', valeur: (p) => p.expertises.map((e) => e.libelle).join(' ; '), rendu: () => null },
    { cle: 'nb_projets_en_cours', entete: 'Projets en cours', valeur: (p) => p.nb_projets_en_cours, rendu: () => null },
    { cle: 'nb_projets_total', entete: 'Projets au total', valeur: (p) => p.nb_projets_total, rendu: () => null },
    { cle: 'nb_questions', entete: 'Questions pilotées', valeur: (p) => p.nb_questions, rendu: () => null },
    { cle: 'nb_transferts', entete: 'Transferts', valeur: (p) => p.nb_transferts, rendu: () => null },
  ];

  const chargeMax = Math.max(1, ...personnes.map((p) => p.nb_projets_en_cours));

  return (
    <>
      <EntetePage
        titre="Équipe R&amp;I"
        sousTitre="Les expertises de chacun et la charge portée. Sert aussi à proposer un pilote à la création d'un projet."
        actions={<BoutonExcel lignes={personnes} colonnes={colonnesExport} nom="Équipe" />}
      />

      <div className="barre-filtres">
        <input
          className="recherche"
          type="search"
          value={recherche}
          placeholder="Rechercher un collaborateur ou une expertise…"
          onChange={(e) => setRecherche(e.target.value)}
        />
        <div className="groupe-filtre">
          <span className="etiquette-groupe">Vue</span>
          {(
            [
              ['personnes', 'Par collaborateur'],
              ['expertises', 'Par expertise'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" className="chip" aria-pressed={vue === v} onClick={() => setVue(v)}>
              {l}
            </button>
          ))}
        </div>
        {vue === 'personnes' && (
          <label className="ligne petit" style={{ gap: 5 }}>
            <input
              type="checkbox"
              checked={inclureHorsEquipe}
              onChange={() => setInclureHorsEquipe((v) => !v)}
            />
            Inclure les contributeurs hors équipe R&amp;I
          </label>
        )}
      </div>

      {vue === 'personnes' ? (
        <div className="mise-en-page-2col">
          <div className="pile">
            {personnes.map((p) => (
              <article key={p.id} className="panneau">
                <div className="ligne" style={{ marginBottom: 8 }}>
                  <div>
                    <h3 style={{ fontSize: 14 }}>{p.nom}</h3>
                    <p className="attenue petit" style={{ margin: '2px 0 0' }}>
                      {p.fonction ?? (p.equipe_ri ? 'Fonction non renseignée' : 'Hors équipe R&I')}
                    </p>
                  </div>
                  <div className="pousse-droite ligne" style={{ gap: 14 }}>
                    <Compteur valeur={p.nb_projets_en_cours} libelle="projets en cours" fort />
                    <Compteur valeur={p.nb_projets_total} libelle="au total" />
                    <Compteur valeur={p.nb_questions} libelle="questions" />
                    <Compteur valeur={p.nb_transferts} libelle="transferts" />
                  </div>
                </div>

                <div
                  style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden', marginBottom: 9 }}
                  title={`${p.nb_projets_en_cours} projet(s) en cours`}
                >
                  <div
                    style={{
                      width: `${(p.nb_projets_en_cours / chargeMax) * 100}%`,
                      height: '100%', background: 'var(--accent)', borderRadius: 3,
                    }}
                  />
                </div>

                <div className="etiquettes">
                  {p.expertises.length ? (
                    p.expertises.map((e) => (
                      <span key={e.id} className="chip chip-lecture" title={e.domaine ?? undefined}>
                        {e.libelle}
                      </span>
                    ))
                  ) : (
                    <span className="attenue petit">Aucune expertise renseignée</span>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="colonne-visuels">
            <PanneauVisuel
              titre="Expertises portées par une seule personne"
              nomFichier="expertises-fragiles"
              aide="Ces compétences ne sont couvertes que par un collaborateur de l'équipe R&I."
            >
              {fragiles.length ? (
                <div className="pile" style={{ gap: 6 }}>
                  {fragiles.map((e) => (
                    <div key={e.id} className="ligne petit">
                      <span>{e.libelle}</span>
                      <span className="pousse-droite chip chip-lecture">
                        {e.personnes.filter((p) => p.equipe_ri)[0]?.nom ?? e.personnes[0]?.nom}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="attenue petit">Toutes les expertises sont couvertes par au moins deux personnes.</p>
              )}
            </PanneauVisuel>
          </div>
        </div>
      ) : (
        <div className="cadre-tableau">
          <table>
            <thead>
              <tr>
                <th style={{ cursor: 'default', width: 190 }}>Domaine</th>
                <th style={{ cursor: 'default', width: 250 }}>Expertise</th>
                <th style={{ cursor: 'default' }}>Collaborateurs</th>
                <th style={{ cursor: 'default', width: 60 }} className="cellule-num">Nb</th>
              </tr>
            </thead>
            <tbody>
              {expertises.map((e) => (
                <tr key={e.id}>
                  <td className="attenue">{e.domaine ?? '—'}</td>
                  <td>{e.libelle}</td>
                  <td>
                    <div className="etiquettes">
                      {e.personnes.map((p) => (
                        <span
                          key={p.id}
                          className="chip chip-lecture"
                          title={p.equipe_ri ? undefined : 'Hors équipe R&I'}
                          style={p.equipe_ri ? undefined : { opacity: 0.62 }}
                        >
                          {p.nom}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="cellule-num">{e.personnes.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Compteur({ valeur, libelle, fort }: { valeur: number; libelle: string; fort?: boolean }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: fort ? 18 : 15, fontWeight: 650, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {valeur}
      </div>
      <div className="attenue" style={{ fontSize: 10 }}>{libelle}</div>
    </div>
  );
}
