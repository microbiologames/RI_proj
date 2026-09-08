import { useRef } from 'react';
import type { Projet, Question } from '../lib/types';
import { LIBELLES_STATUT } from '../lib/types';
import { exporterPng } from '../lib/export';
import { couleurAxe, formaterDate, formaterEuros, useThemeSombre } from '../lib/utils';
import { Modale } from './Base';

/**
 * Cartouche pitch : la fiche à sortir pour présenter un ou plusieurs projets —
 * partenaires, financement, questions de recherche, contributions ADRIA, dates.
 * Exportable en PNG pour être collée dans une présentation.
 */
export function CartouchePitch({
  projets,
  questions,
  onFermer,
}: {
  projets: Projet[];
  questions: Question[];
  onFermer: () => void;
}) {
  const sombre = useThemeSombre();
  const zone = useRef<HTMLDivElement>(null);

  return (
    <Modale
      titre={projets.length > 1 ? `Cartouche pitch — ${projets.length} projets` : 'Cartouche pitch'}
      onFermer={onFermer}
      large
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer}>
            Fermer
          </button>
          <button
            type="button"
            className="btn btn-primaire"
            onClick={() => zone.current && exporterPng(zone.current, 'cartouche-pitch')}
          >
            Exporter en PNG
          </button>
        </>
      }
    >
      <div ref={zone} className="pile" style={{ background: 'var(--surface)', padding: 2 }}>
        {projets.map((p) => {
          const liees = questions.filter((q) => q.projets.some((x) => x.id === p.id));
          return (
            <article
              key={p.id}
              className="panneau"
              style={{ borderLeft: `3px solid ${p.axes[0] ? couleurAxe(p.axes[0], sombre) : 'var(--bordure-forte)'}` }}
            >
              <header className="ligne" style={{ marginBottom: 8 }}>
                <h3 style={{ fontSize: 15 }}>{p.acronyme}</h3>
                <span className="chip chip-lecture">{LIBELLES_STATUT[p.statut]}</span>
                <span className="attenue petit pousse-droite">
                  {formaterDate(p.date_debut)} → {formaterDate(p.date_fin)}
                </span>
              </header>

              <p style={{ margin: '0 0 10px', fontWeight: 500 }}>{p.titre}</p>

              <div className="grille-champs" style={{ gap: '10px 18px' }}>
                <Bloc titre="Axes de recherche">
                  <div className="etiquettes">
                    {p.axes.map((a) => (
                      <span key={a.id} className="chip chip-lecture">
                        <span className="pastille" style={{ background: couleurAxe(a, sombre) }} />
                        {a.libelle}
                      </span>
                    ))}
                  </div>
                </Bloc>

                <Bloc titre="Partenaires">
                  {p.partenaires.length ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {p.partenaires.map((pt) => (
                        <li key={pt.id}>
                          {pt.nom} <span className="attenue">— {pt.ville}, {pt.pays}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="attenue">Aucun partenaire renseigné</span>
                  )}
                </Bloc>

                <Bloc titre="Mode de financement">
                  <div className="etiquettes">
                    {p.financements.length ? (
                      p.financements.map((f) => (
                        <span key={f.id} className="chip chip-lecture">
                          {f.libelle}
                        </span>
                      ))
                    ) : (
                      <span className="attenue">Non renseigné</span>
                    )}
                  </div>
                  <p className="petit" style={{ margin: '6px 0 0' }}>
                    Budget total {formaterEuros(p.budget_total)} · part ADRIA {formaterEuros(p.budget_adria)}
                    {p.pct_financement !== null && ` · financement ${p.pct_financement} %`}
                  </p>
                  {p.labellisations.length > 0 && (
                    <p className="petit attenue" style={{ margin: '4px 0 0' }}>
                      Labellisations : {p.labellisations.map((l) => l.libelle).join(', ')}
                    </p>
                  )}
                </Bloc>

                <Bloc titre="Pilote(s)">
                  {p.pilotes.length ? (
                    p.pilotes.map((x) => x.nom).join(', ')
                  ) : (
                    <span className="attenue">Non renseigné</span>
                  )}
                </Bloc>
              </div>

              <Bloc titre="Questions de recherche">
                {liees.length ? (
                  <ol style={{ margin: 0, paddingLeft: 18 }}>
                    {liees.map((q) => (
                      <li key={q.id}>{q.libelle}</li>
                    ))}
                  </ol>
                ) : (
                  <span className="attenue">Aucune question rattachée à ce projet</span>
                )}
              </Bloc>

              <Bloc titre="Contributions ADRIA">
                {p.contributions_adria ? (
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.contributions_adria}</p>
                ) : (
                  <span className="attenue">
                    Non renseignées — complétez le champ « Contributions ADRIA » de la fiche projet.
                  </span>
                )}
              </Bloc>
            </article>
          );
        })}
      </div>
    </Modale>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 10 }}>
      <h4
        style={{
          margin: '0 0 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          textTransform: 'uppercase', color: 'var(--texte-attenue)',
        }}
      >
        {titre}
      </h4>
      <div style={{ fontSize: 13 }}>{children}</div>
    </section>
  );
}
