import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErreurApi } from '../lib/api';
import type { Problematique } from '../lib/types';
import { couleurAxe, normaliser, useThemeSombre } from '../lib/utils';
import { Bandeau, ChoixMultiple } from '../components/Base';
import { EntetePage, useReferentiels } from './commun';

/**
 * Rattachement des problématiques aux axes de recherche.
 *
 * Les données reprises de MS List ne portent aucun axe : une question relève
 * d'une « problématique », et c'est elle qu'on qualifie. Les ~35 problématiques
 * suffisent donc à qualifier les 66 questions, puis, par propagation, les
 * projets et idées qui s'y rattachent.
 *
 * Les rattachements affichés au départ sont une PROPOSITION, marquée comme
 * telle tant qu'elle n'a pas été relue.
 */
export function PageQualification() {
  const sombre = useThemeSombre();
  const qc = useQueryClient();
  const { data: referentiels } = useReferentiels();

  const problematiques = useQuery({ queryKey: ['problematiques'], queryFn: api.problematiques });
  const etat = useQuery({ queryKey: ['qualification'], queryFn: api.etatQualification });
  const feuilleDeRoute = useQuery({ queryKey: ['feuille-de-route'], queryFn: api.feuilleDeRoute });

  const [filtre, setFiltre] = useState<'toutes' | 'a_valider' | 'sans_axe'>('a_valider');
  const [recherche, setRecherche] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aide, setAide] = useState(false);

  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: ['problematiques'] });
    void qc.invalidateQueries({ queryKey: ['qualification'] });
    void qc.invalidateQueries({ queryKey: ['questions'] });
    void qc.invalidateQueries({ queryKey: ['projets'] });
    void qc.invalidateQueries({ queryKey: ['idees'] });
  };

  const modifier = useMutation({
    mutationFn: ({ id, corps }: { id: number; corps: unknown }) => api.modifierProblematique(id, corps),
    onSuccess: (r) => {
      setErreur(null);
      const p = r as Problematique & { propagation?: { questions: number; projets: number; idees: number } };
      if (p.propagation) {
        setMessage(
          `« ${p.libelle.slice(0, 60)} » : ${p.propagation.questions} question(s), ${p.propagation.projets} projet(s) et ${p.propagation.idees} idée(s) mis à jour.`,
        );
      }
      rafraichir();
    },
    onError: (e) => setErreur(e instanceof ErreurApi ? e.message : String(e)),
  });

  const validerTout = useMutation({
    mutationFn: api.validerToutesProblematiques,
    onSuccess: (r) => { setMessage(`${r.validees} problématique(s) validée(s).`); rafraichir(); },
    onError: (e) => setErreur(e instanceof ErreurApi ? e.message : String(e)),
  });

  const visibles = useMemo(() => {
    const q = normaliser(recherche);
    return (problematiques.data ?? []).filter((p) => {
      if (filtre === 'a_valider' && p.axes_valides) return false;
      if (filtre === 'sans_axe' && p.axes.length > 0) return false;
      if (!q) return true;
      return normaliser(p.libelle).includes(q) || p.questions.some((x) => normaliser(x).includes(q));
    });
  }, [problematiques.data, filtre, recherche]);

  const e = etat.data;
  const avancement = e ? Math.round((e.problematiques_validees / Math.max(1, e.problematiques)) * 100) : 0;

  if (!referentiels) return <p className="attenue">Chargement…</p>;

  return (
    <>
      <EntetePage
        titre="Qualification des axes"
        sousTitre="Les données reprises de MS List ne portent pas d'axe de recherche : elles portent une problématique. Rattacher chaque problématique à un ou plusieurs axes qualifie d'un coup toutes les questions concernées, puis les projets et idées qui s'y rattachent."
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAide((v) => !v)}>
              {aide ? 'Masquer' : 'Voir'} la feuille de route
            </button>
            <button
              type="button"
              className="btn btn-primaire"
              disabled={validerTout.isPending || (e?.problematiques_validees ?? 0) >= (e?.problematiques ?? 0)}
              onClick={() => validerTout.mutate()}
            >
              Valider les propositions restantes
            </button>
          </>
        }
      />

      {message && <Bandeau>{message}</Bandeau>}
      {erreur && <Bandeau type="erreur">{erreur}</Bandeau>}

      {e && (
        <div className="barre-filtres" style={{ gap: 18 }}>
          <Jauge libelle="Problématiques validées" valeur={e.problematiques_validees} total={e.problematiques} />
          <Jauge libelle="Questions qualifiées" valeur={e.questions - e.questions_sans_axe} total={e.questions} />
          <Jauge libelle="Projets qualifiés" valeur={e.projets - e.projets_sans_axe} total={e.projets} />
          <Jauge libelle="Idées qualifiées" valeur={e.idees - e.idees_sans_axe} total={e.idees} />
        </div>
      )}

      {e && e.projets_sans_axe > 0 && (
        <Bandeau>
          {e.projets_sans_axe} projet(s) n'ont aucune question de recherche rattachée : leur axe ne peut pas être
          déduit et reste à saisir depuis la page Projets.
        </Bandeau>
      )}

      {aide && (
        <section className="panneau" style={{ marginBottom: 12 }}>
          <h3 style={{ marginBottom: 8 }}>Feuille de route R&amp;I — périmètre de chaque axe</h3>
          <div className="pile" style={{ gap: 12 }}>
            {referentiels.axes.map((axe) => {
              const scopes = (feuilleDeRoute.data ?? []).filter((s) => s.axe_id === axe.id);
              return (
                <div key={axe.id}>
                  <h4 style={{ margin: '0 0 5px', fontSize: 13, color: couleurAxe(axe, sombre) }}>
                    {axe.code} — {axe.libelle}
                  </h4>
                  <table style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ cursor: 'default', width: '45%' }}>Scope de questions</th>
                        <th style={{ cursor: 'default' }}>Contribution ADRIA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopes.map((s) => (
                        <tr key={s.id}>
                          <td>{s.scope}</td>
                          <td className="attenue">{s.contribution}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="barre-filtres">
        <input
          className="recherche"
          type="search"
          value={recherche}
          placeholder="Rechercher une problématique ou une question…"
          onChange={(ev) => setRecherche(ev.target.value)}
        />
        <div className="groupe-filtre">
          <span className="etiquette-groupe">Afficher</span>
          {(
            [
              ['a_valider', 'À valider'],
              ['sans_axe', 'Sans axe'],
              ['toutes', 'Toutes'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" className="chip" aria-pressed={filtre === v} onClick={() => setFiltre(v)}>
              {l}
            </button>
          ))}
        </div>
        <span className="attenue petit pousse-droite">
          {visibles.length} problématique(s) · {avancement} % validé
        </span>
      </div>

      <div className="pile">
        {visibles.length === 0 && (
          <p className="vide panneau">
            {filtre === 'a_valider'
              ? 'Toutes les problématiques ont été validées.'
              : 'Aucune problématique ne correspond.'}
          </p>
        )}

        {visibles.map((p) => (
          <article key={p.id} className="panneau">
            <div className="ligne" style={{ alignItems: 'flex-start', marginBottom: 9 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 14 }}>{p.libelle}</h3>
                <p className="attenue petit" style={{ margin: '3px 0 0' }}>
                  {p.nb_questions} question(s) de recherche concernée(s)
                  {!p.axes_valides && p.axes.length > 0 && ' · rattachement proposé, à relire'}
                </p>
              </div>
              {p.axes_valides ? (
                <span className="chip chip-lecture" title="Rattachement relu et validé">
                  <span className="pastille" style={{ background: 'var(--bon)' }} />
                  Validée
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-s btn-primaire"
                  disabled={p.axes.length === 0 || modifier.isPending}
                  title={p.axes.length === 0 ? 'Choisissez au moins un axe' : undefined}
                  onClick={() => modifier.mutate({ id: p.id, corps: { axes_valides: true } })}
                >
                  Valider
                </button>
              )}
            </div>

            <ChoixMultiple
              valeurs={p.axes.map((a) => a.id)}
              options={referentiels.axes.map((a) => ({ id: a.id, libelle: `${a.code} — ${a.libelle}` }))}
              couleurs={Object.fromEntries(referentiels.axes.map((a) => [a.id, couleurAxe(a, sombre)]))}
              onChanger={(ids) => modifier.mutate({ id: p.id, corps: { axes: ids } })}
            />

            {p.questions.length > 0 && (
              <details style={{ marginTop: 9 }}>
                <summary className="attenue petit" style={{ cursor: 'pointer' }}>
                  Voir les {p.questions.length} question(s)
                </summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                  {p.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function Jauge({ libelle, valeur, total }: { libelle: string; valeur: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((valeur / total) * 100);
  return (
    <div style={{ minWidth: 150, flex: '1 1 150px' }}>
      <div className="ligne petit" style={{ justifyContent: 'space-between', marginBottom: 3 }}>
        <span className="attenue">{libelle}</span>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {valeur}/{total}
        </strong>
      </div>
      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`, height: '100%', borderRadius: 3,
            background: pct === 100 ? 'var(--bon)' : 'var(--accent)',
          }}
        />
      </div>
    </div>
  );
}
