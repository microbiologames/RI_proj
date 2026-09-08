import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Partenaire, Projet, Question, Statut } from '../lib/types';
import { COULEURS_STATUT, LIBELLES_STATUT } from '../lib/types';
import { couleurAxe, formaterDate, formaterEuros, useThemeSombre } from '../lib/utils';
import { Bandeau, ChoixMultiple, Modale, SaisieAssistee } from '../components/Base';
import { EditionDate, EditionNombre, EditionTexte, Tableau, type Colonne } from '../components/Tableau';
import { appliquerFiltres, BarreFiltres, type EtatFiltres, type Facette } from '../components/Filtres';
import { DiagrammeVenn } from '../components/Venn';
import { Histogramme, type BarreDonnee } from '../components/Histogramme';
import { CartouchePitch } from '../components/CartouchePitch';
import { SuggestionPilote } from '../components/SuggestionPilote';
import { BoutonExcel, EntetePage, EtatChargement, PanneauVisuel, useBase, useOptions, useReferentiels } from './commun';

/** Axe de l'histogramme : ce qui est compté en abscisse. */
type Regroupement = 'statut' | 'axe' | 'pilote' | 'partenaire' | 'financement' | 'labellisation';

const REGROUPEMENTS: Array<{ cle: Regroupement; libelle: string }> = [
  { cle: 'statut', libelle: 'Statut' },
  { cle: 'axe', libelle: 'Axe' },
  { cle: 'pilote', libelle: 'Pilote' },
  { cle: 'partenaire', libelle: 'Partenaire' },
  { cle: 'financement', libelle: 'Financement' },
  { cle: 'labellisation', libelle: 'Labellisation' },
];

export function PageProjets() {
  const sombre = useThemeSombre();
  const base = useBase<Projet>('projets');
  const { data: referentiels } = useReferentiels();
  const options = useOptions(referentiels);
  const partenaires = useQuery({ queryKey: ['partenaires'], queryFn: () => api.lister<Partenaire>('partenaires') });
  const questions = useQuery({ queryKey: ['questions'], queryFn: () => api.lister<Question>('questions') });

  const [filtres, setFiltres] = useState<EtatFiltres>({});
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<number[]>([]);
  const [creation, setCreation] = useState(false);
  const [pitch, setPitch] = useState(false);
  const [regroupement, setRegroupement] = useState<Regroupement>('statut');

  const facettes: Facette<Projet>[] = useMemo(
    () => [
      {
        cle: 'statut',
        etiquette: 'Statut',
        valeurs: (p) => [{ id: p.statut, libelle: LIBELLES_STATUT[p.statut], couleur: COULEURS_STATUT[p.statut] }],
      },
      {
        cle: 'axes',
        etiquette: 'Axes',
        valeurs: (p) => p.axes.map((a) => ({ id: `a${a.id}`, libelle: a.code, couleur: couleurAxe(a, sombre) })),
      },
      {
        cle: 'pilotes',
        etiquette: 'Pilote',
        valeurs: (p) =>
          p.pilotes.length
            ? p.pilotes.map((x) => ({ id: `p${x.id}`, libelle: x.nom }))
            : [{ id: 'p0', libelle: 'Sans pilote' }],
      },
      {
        cle: 'qualification',
        etiquette: 'Axes',
        valeurs: (p) => (p.axes.length === 0 ? [{ id: 'x0', libelle: 'À qualifier' }] : []),
      },
      {
        cle: 'partenaires',
        etiquette: 'Partenaires',
        valeurs: (p) =>
          p.partenaires.length
            ? p.partenaires.map((x) => ({ id: `pt${x.id}`, libelle: x.nom }))
            : [{ id: 'pt0', libelle: 'Sans partenaire' }],
      },
      {
        cle: 'financements',
        etiquette: 'Financement',
        valeurs: (p) => p.financements.map((f) => ({ id: `f${f.id}`, libelle: f.libelle })),
      },
      {
        cle: 'labellisations',
        etiquette: 'Labellisation',
        valeurs: (p) => p.labellisations.map((l) => ({ id: `l${l.id}`, libelle: l.libelle })),
      },
    ],
    [sombre],
  );

  const visibles = useMemo(
    () =>
      appliquerFiltres(base.lignes, facettes, filtres, recherche, (p) => [
        p.acronyme,
        p.titre,
        p.notes,
        p.contributions_adria,
        ...p.pilotes.map((x) => x.nom),
      ]),
    [base.lignes, facettes, filtres, recherche],
  );

  /** L'histogramme et le Venn portent sur les projets filtrés, jamais sur la base entière. */
  const barres: BarreDonnee[] = useMemo(() => {
    const compte = new Map<string, BarreDonnee>();
    const ajouter = (cle: string, libelle: string, couleur?: string) => {
      const e = compte.get(cle);
      if (e) e.valeur += 1;
      else compte.set(cle, { cle, libelle, valeur: 1, couleur });
    };

    for (const p of visibles) {
      switch (regroupement) {
        case 'statut':
          ajouter(p.statut, LIBELLES_STATUT[p.statut], COULEURS_STATUT[p.statut]);
          break;
        case 'axe':
          for (const a of p.axes) ajouter(`a${a.id}`, a.code, couleurAxe(a, sombre));
          break;
        case 'pilote':
          if (p.pilotes.length === 0) ajouter('p0', 'Sans pilote');
          else for (const x of p.pilotes) ajouter(`p${x.id}`, x.nom);
          break;
        case 'partenaire':
          if (p.partenaires.length === 0) ajouter('pt0', 'Sans partenaire');
          else for (const x of p.partenaires) ajouter(`pt${x.id}`, x.nom);
          break;
        case 'financement':
          if (p.financements.length === 0) ajouter('f0', 'Non renseigné');
          else for (const f of p.financements) ajouter(`f${f.id}`, f.libelle);
          break;
        case 'labellisation':
          if (p.labellisations.length === 0) ajouter('l0', 'Aucune');
          else for (const l of p.labellisations) ajouter(`l${l.id}`, l.libelle);
          break;
      }
    }
    return [...compte.values()].sort((a, b) => b.valeur - a.valeur).slice(0, 14);
  }, [visibles, regroupement, sombre]);

  const colonnes: Colonne<Projet>[] = [
    {
      cle: 'acronyme',
      entete: 'Projet',
      largeur: '120px',
      rendu: (p) => <strong>{p.acronyme}</strong>,
      edition: (p, fin) => (
        <EditionTexte valeur={p.acronyme} terminer={fin} onValider={(v) => base.majChamp(p.id, 'acronyme', v)} />
      ),
    },
    {
      cle: 'titre',
      entete: 'Titre complet',
      largeur: '200px',
      rendu: (p) => (
        <span className="tronque-lignes" title={p.titre}>{p.titre}</span>
      ),
      edition: (p, fin) => (
        <EditionTexte valeur={p.titre} terminer={fin} multiligne onValider={(v) => base.majChamp(p.id, 'titre', v)} />
      ),
    },
    {
      cle: 'statut',
      entete: 'Statut',
      largeur: '118px',
      rendu: (p) => (
        <span className="pastille-statut">
          <span className="point" style={{ background: COULEURS_STATUT[p.statut] }} />
          {LIBELLES_STATUT[p.statut]}
        </span>
      ),
      edition: (p, fin) => (
        <select
          autoFocus
          defaultValue={p.statut}
          onChange={(e) => { base.majChamp(p.id, 'statut', e.target.value as Statut); fin(); }}
          onBlur={fin}
        >
          {Object.entries(LIBELLES_STATUT).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      ),
    },
    {
      cle: 'pilotes',
      entete: 'Pilote(s)',
      largeur: '150px',
      valeur: (p) => p.pilotes.map((x) => x.nom).join(' ; '),
      rendu: (p) => (
        <div className="etiquettes">
          {p.pilotes.length ? (
            p.pilotes.map((x) => <span key={x.id} className="chip chip-lecture">{x.nom}</span>)
          ) : (
            <span className="attenue">—</span>
          )}
        </div>
      ),
      edition: (p, fin) => (
        <>
          <ChoixMultiple
            valeurs={p.pilotes.map((x) => x.id)}
            options={options.personnes}
            onChanger={(ids) => base.majChamp(p.id, 'pilotes', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>Terminer</button>
        </>
      ),
    },
    {
      cle: 'financements',
      secondaire: true,
      entete: 'Financement',
      largeur: '150px',
      valeur: (p) => p.financements.map((f) => f.libelle).join(' ; '),
      rendu: (p) => (
        <div className="etiquettes">
          {p.financements.length ? (
            p.financements.map((f) => <span key={f.id} className="chip chip-lecture">{f.libelle}</span>)
          ) : (
            <span className="attenue">—</span>
          )}
        </div>
      ),
      edition: (p, fin) => (
        <>
          <ChoixMultiple
            valeurs={p.financements.map((f) => f.id)}
            options={options.financements}
            onChanger={(ids) => base.majChamp(p.id, 'financements', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>Terminer</button>
        </>
      ),
    },
    {
      cle: 'labellisations',
      secondaire: true,
      entete: 'Labellisation',
      largeur: '140px',
      valeur: (p) => p.labellisations.map((l) => l.libelle).join(' ; '),
      rendu: (p) => (
        <div className="etiquettes">
          {p.labellisations.length ? (
            p.labellisations.map((l) => <span key={l.id} className="chip chip-lecture">{l.libelle}</span>)
          ) : (
            <span className="attenue">—</span>
          )}
        </div>
      ),
      edition: (p, fin) => (
        <>
          <ChoixMultiple
            valeurs={p.labellisations.map((l) => l.id)}
            options={options.labellisations}
            onChanger={(ids) => base.majChamp(p.id, 'labellisations', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>Terminer</button>
        </>
      ),
    },
    {
      cle: 'partenaires',
      secondaire: true,
      entete: 'Partenaires',
      largeur: '170px',
      valeur: (p) => p.partenaires.map((x) => x.nom).join(' ; '),
      rendu: (p) =>
        p.partenaires.length ? (
          <span title={p.partenaires.map((x) => x.nom).join(', ')}>
            {p.partenaires[0]!.nom}
            {p.partenaires.length > 1 && <span className="attenue"> +{p.partenaires.length - 1}</span>}
          </span>
        ) : (
          <span className="attenue">—</span>
        ),
      edition: (p, fin) => (
        <>
          <ChoixMultiple
            valeurs={p.partenaires.map((x) => x.id)}
            options={(partenaires.data ?? []).map((x) => ({ id: x.id, libelle: x.nom }))}
            onChanger={(ids) => base.majChamp(p.id, 'partenaires', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>Terminer</button>
        </>
      ),
    },
    {
      cle: 'axes',
      entete: 'Axes',
      largeur: '175px',
      valeur: (p) => p.axes.map((a) => a.code).join(' '),
      rendu: (p) =>
        p.axes.length === 0 ? (
          <span className="a-qualifier" title="Aucune question de recherche rattachée : l'axe reste à saisir">
            à qualifier
          </span>
        ) : (
          <div className="etiquettes">
            {p.axes.map((a) => (
              <span key={a.id} className="chip chip-lecture" title={a.libelle}>
                <span className="pastille" style={{ background: couleurAxe(a, sombre) }} />
                {a.code}
              </span>
            ))}
          </div>
        ),
      edition: (p, fin) => (
        <>
          <ChoixMultiple
            valeurs={p.axes.map((a) => a.id)}
            options={options.axes}
            couleurs={Object.fromEntries((referentiels?.axes ?? []).map((a) => [a.id, couleurAxe(a, sombre)]))}
            onChanger={(ids) => ids.length > 0 && base.majChamp(p.id, 'axes', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>Terminer</button>
        </>
      ),
    },
    {
      cle: 'dates',
      entete: 'Début',
      largeur: '110px',
      valeur: (p) => p.date_debut ?? '',
      rendu: (p) => formaterDate(p.date_debut),
      edition: (p, fin) => (
        <EditionDate valeur={p.date_debut} terminer={fin} onValider={(v) => base.majChamp(p.id, 'date_debut', v)} />
      ),
    },
    {
      cle: 'date_fin',
      secondaire: true,
      entete: 'Fin',
      largeur: '110px',
      valeur: (p) => p.date_fin ?? '',
      rendu: (p) => formaterDate(p.date_fin),
      edition: (p, fin) => (
        <EditionDate valeur={p.date_fin} terminer={fin} onValider={(v) => base.majChamp(p.id, 'date_fin', v)} />
      ),
    },
    {
      cle: 'budget_total',
      entete: 'Budget total',
      largeur: '115px',
      numerique: true,
      valeur: (p) => p.budget_total,
      rendu: (p) => formaterEuros(p.budget_total),
      edition: (p, fin) => (
        <EditionNombre valeur={p.budget_total} terminer={fin} onValider={(v) => base.majChamp(p.id, 'budget_total', v)} />
      ),
    },
    {
      cle: 'budget_adria',
      secondaire: true,
      entete: 'Budget ADRIA',
      largeur: '115px',
      numerique: true,
      valeur: (p) => p.budget_adria,
      rendu: (p) => formaterEuros(p.budget_adria),
      edition: (p, fin) => (
        <EditionNombre valeur={p.budget_adria} terminer={fin} onValider={(v) => base.majChamp(p.id, 'budget_adria', v)} />
      ),
    },
    {
      cle: 'pct_financement',
      secondaire: true,
      entete: '% financement',
      largeur: '105px',
      numerique: true,
      valeur: (p) => p.pct_financement,
      rendu: (p) => (p.pct_financement === null ? <span className="attenue">—</span> : `${p.pct_financement} %`),
      edition: (p, fin) => (
        <EditionNombre
          valeur={p.pct_financement}
          terminer={fin}
          onValider={(v) => base.majChamp(p.id, 'pct_financement', v)}
        />
      ),
    },
  ];

  const selectionnes = base.lignes.filter((p) => selection.includes(p.id));

  if (!referentiels) return <p className="attenue">Chargement…</p>;

  return (
    <>
      <EntetePage
        titre="Projets"
        sousTitre="Rassemble les questions de recherche, les partenaires et les informations propres aux projets. Les visuels suivent les filtres."
        actions={
          <>
            <BoutonExcel lignes={visibles} colonnes={colonnes} nom="Projets" />
            <button
              type="button"
              className="btn"
              disabled={selection.length === 0}
              title={selection.length ? undefined : 'Sélectionnez au moins un projet'}
              onClick={() => setPitch(true)}
            >
              ▤ Cartouche pitch{selection.length > 0 && ` (${selection.length})`}
            </button>
            <button type="button" className="btn btn-primaire" onClick={() => setCreation(true)}>+ Nouveau projet</button>
          </>
        }
      />

      <EtatChargement chargement={base.chargement} erreur={base.erreur} onFermer={base.effacerErreur} />

      <BarreFiltres
        lignes={base.lignes}
        facettes={facettes}
        etat={filtres}
        onChanger={setFiltres}
        recherche={recherche}
        onRecherche={setRecherche}
        placeholderRecherche="Rechercher un projet…"
      />

      <div className="mise-en-page-2col">
        <Tableau
          lignes={visibles}
          colonnes={colonnes}
          cleColonnes="projets"
          selection={selection}
          onSelection={setSelection}
          onBasculerVerrou={base.basculerVerrou}
          onSupprimer={(p) => confirm(`Supprimer le projet ${p.acronyme} ?`) && base.supprimer.mutate(p.id)}
        />

        <div className="colonne-visuels">
          <PanneauVisuel
            titre="Répartition par axe de recherche"
            nomFichier="venn-axes"
            aide="Chaque nombre est l'effectif d'une région : au centre, les projets relevant des quatre axes."
          >
            <DiagrammeVenn
              elements={visibles.map((p) => ({ id: p.id, axes: p.axes }))}
              axes={referentiels.axes}
              titreZeroAxe="sans axe"
              onCliquerRegion={(ids) => setFiltres({ ...filtres, axes: ids.map((i) => `a${i}`) })}
            />
          </PanneauVisuel>

          <PanneauVisuel titre={`Nombre de projets par ${REGROUPEMENTS.find((r) => r.cle === regroupement)!.libelle.toLowerCase()}`} nomFichier="histogramme-projets">
            <div className="ligne" style={{ marginBottom: 10 }} data-exclure-export="oui">
              <select value={regroupement} onChange={(e) => setRegroupement(e.target.value as Regroupement)}>
                {REGROUPEMENTS.map((r) => (
                  <option key={r.cle} value={r.cle}>En abscisse : {r.libelle}</option>
                ))}
              </select>
            </div>
            <Histogramme donnees={barres} unite="projet" />
            <p className="attenue petit" style={{ marginTop: 8, marginBottom: 0 }}>
              {visibles.length} projet(s) après filtrage sur {base.lignes.length}.
            </p>
          </PanneauVisuel>
        </div>
      </div>

      {pitch && (
        <CartouchePitch
          projets={selectionnes}
          questions={questions.data ?? []}
          onFermer={() => setPitch(false)}
        />
      )}

      {creation && (
        <FormulaireProjet
          referentiels={referentiels}
          partenaires={partenaires.data ?? []}
          onFermer={() => setCreation(false)}
          onEnregistrer={(corps) => { base.creer.mutate(corps); setCreation(false); }}
        />
      )}
    </>
  );
}

function FormulaireProjet({
  referentiels,
  partenaires,
  onFermer,
  onEnregistrer,
}: {
  referentiels: NonNullable<ReturnType<typeof useReferentiels>['data']>;
  partenaires: Partenaire[];
  onFermer: () => void;
  onEnregistrer: (corps: unknown) => void;
}) {
  const sombre = useThemeSombre();
  const [f, setF] = useState({
    acronyme: '',
    titre: '',
    statut: 'en_preparation' as Statut,
    date_debut: '',
    date_fin: '',
    budget_total: '',
    budget_adria: '',
    pct_financement: '',
    contributions_adria: '',
  });
  const [axes, setAxes] = useState<number[]>([]);
  const [pilotes, setPilotes] = useState<number[]>([]);
  const [partenairesChoisis, setPartenaires] = useState<number[]>([]);
  const [financements, setFinancements] = useState<number[]>([]);
  const [labellisations, setLabellisations] = useState<number[]>([]);

  const nombre = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const valide = f.acronyme.trim() && f.titre.trim() && axes.length > 0;

  return (
    <Modale
      titre="Nouveau projet"
      onFermer={onFermer}
      large
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button
            type="button"
            className="btn btn-primaire"
            disabled={!valide}
            onClick={() =>
              onEnregistrer({
                acronyme: f.acronyme.trim(),
                titre: f.titre.trim(),
                statut: f.statut,
                pilotes,
                date_debut: f.date_debut || null,
                date_fin: f.date_fin || null,
                budget_total: nombre(f.budget_total),
                budget_adria: nombre(f.budget_adria),
                pct_financement: nombre(f.pct_financement),
                contributions_adria: f.contributions_adria.trim() || null,
                axes,
                partenaires: partenairesChoisis,
                financements,
                labellisations,
              })
            }
          >
            Créer
          </button>
        </>
      }
    >
      <div className="grille-champs">
        <label className="champ">
          <span>Acronyme <span className="requis">*</span></span>
          <input type="text" autoFocus value={f.acronyme} onChange={(e) => setF({ ...f, acronyme: e.target.value })} />
        </label>
        <label className="champ">
          <span>Statut <span className="requis">*</span></span>
          <select value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value as Statut })}>
            {Object.entries(LIBELLES_STATUT).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="champ">
        <span>Titre complet <span className="requis">*</span></span>
        <input type="text" value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} />
      </label>

      <label className="champ">
        <span>Axes de recherche <span className="requis">*</span></span>
        <ChoixMultiple
          valeurs={axes}
          options={referentiels.axes.map((a) => ({ id: a.id, libelle: a.libelle }))}
          couleurs={Object.fromEntries(referentiels.axes.map((a) => [a.id, couleurAxe(a, sombre)]))}
          onChanger={setAxes}
        />
      </label>

      <div className="grille-champs">
        <label className="champ">
          <span>Début</span>
          <input type="date" value={f.date_debut} onChange={(e) => setF({ ...f, date_debut: e.target.value })} />
        </label>
        <label className="champ">
          <span>Fin</span>
          <input type="date" value={f.date_fin} onChange={(e) => setF({ ...f, date_fin: e.target.value })} />
        </label>
      </div>

      <div className="grille-champs">
        <label className="champ">
          <span>Budget total (€)</span>
          <input type="number" value={f.budget_total} onChange={(e) => setF({ ...f, budget_total: e.target.value })} />
        </label>
        <label className="champ">
          <span>Budget ADRIA (€)</span>
          <input type="number" value={f.budget_adria} onChange={(e) => setF({ ...f, budget_adria: e.target.value })} />
        </label>
        <label className="champ">
          <span>% de financement</span>
          <input
            type="number"
            min={0}
            max={100}
            value={f.pct_financement}
            onChange={(e) => setF({ ...f, pct_financement: e.target.value })}
          />
        </label>
      </div>

      <label className="champ">
        <span>Pilote(s)</span>
        <ChoixMultiple
          valeurs={pilotes}
          options={referentiels.personnes.filter((p) => p.equipe_ri).map((p) => ({ id: p.id, libelle: p.nom }))}
          onChanger={setPilotes}
        />
        <SuggestionPilote axes={axes} pilotes={pilotes} onChoisir={(id: number) => setPilotes([...new Set([...pilotes, id])])} />
      </label>

      <label className="champ">
        <span>Type de financement</span>
        <ChoixMultiple
          valeurs={financements}
          options={referentiels.financements.map((x) => ({ id: x.id, libelle: x.libelle }))}
          onChanger={setFinancements}
        />
      </label>

      <label className="champ">
        <span>Labellisation</span>
        <ChoixMultiple
          valeurs={labellisations}
          options={referentiels.labellisations.map((x) => ({ id: x.id, libelle: x.libelle }))}
          onChanger={setLabellisations}
        />
      </label>

      <label className="champ">
        <span>Partenaires</span>
        <ChoixMultiple
          valeurs={partenairesChoisis}
          options={partenaires.map((x) => ({ id: x.id, libelle: x.nom }))}
          onChanger={setPartenaires}
        />
      </label>

      <label className="champ">
        <span>Contributions ADRIA <span className="attenue">— reprises telles quelles dans le cartouche pitch</span></span>
        <textarea
          value={f.contributions_adria}
          onChange={(e) => setF({ ...f, contributions_adria: e.target.value })}
          rows={3}
        />
      </label>
    </Modale>
  );
}
