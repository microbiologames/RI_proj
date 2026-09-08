import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Grappe, Projet, Question } from '../lib/types';
import { couleurAxe, formaterDateHeure, useThemeSombre } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Bandeau, ChoixMultiple, Modale, SaisieAssistee } from '../components/Base';
import { EditionTexte, Tableau, type Colonne } from '../components/Tableau';
import { appliquerFiltres, BarreFiltres, type EtatFiltres, type Facette } from '../components/Filtres';
import { DialogueAdm } from '../components/DialogueAdm';
import { BoutonExcel, EntetePage, EtatChargement, useBase, useEtatAdm, useOptions, useReferentiels } from './commun';
import { BarreGrappage } from './Grappage';

export function PageQuestions() {
  const sombre = useThemeSombre();
  const base = useBase<Question>('questions');
  const { data: referentiels } = useReferentiels();
  const { data: adm } = useEtatAdm();
  const options = useOptions(referentiels);
  const projets = useQuery({ queryKey: ['projets'], queryFn: () => api.lister<Projet>('projets') });
  const grappes = useQuery({ queryKey: ['grappes'], queryFn: api.grappes });

  const [filtres, setFiltres] = useState<EtatFiltres>({});
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<number[]>([]);
  const [dialogueAdm, setDialogueAdm] = useState(false);
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const facettes: Facette<Question>[] = useMemo(
    () => [
      {
        cle: 'axes',
        etiquette: 'Axes',
        valeurs: (q) => q.axes.map((a) => ({ id: `a${a.id}`, libelle: a.code, couleur: couleurAxe(a, sombre) })),
      },
      {
        cle: 'pilote',
        etiquette: 'Pilote',
        valeurs: (q) => (q.pilote ? [{ id: `p${q.pilote.id}`, libelle: q.pilote.nom }] : [{ id: 'p0', libelle: 'Sans pilote' }]),
      },
      {
        cle: 'projets',
        etiquette: 'Projet',
        valeurs: (q) =>
          q.projets.length
            ? q.projets.map((p) => ({ id: `pr${p.id}`, libelle: p.acronyme }))
            : [{ id: 'pr0', libelle: 'Non rattachée' }],
      },
      {
        cle: 'transition',
        etiquette: 'Transition',
        valeurs: (q) => (q.transition ? [{ id: `t${q.transition.id}`, libelle: q.transition.libelle }] : []),
      },
      {
        cle: 'qualification',
        etiquette: 'Axes',
        valeurs: (q) =>
          q.axes.length === 0
            ? [{ id: 'x0', libelle: 'À qualifier' }]
            : q.problematique && !q.problematique.axes_valides
              ? [{ id: 'x1', libelle: 'Proposition à relire' }]
              : [{ id: 'x2', libelle: 'Validés' }],
      },
      {
        cle: 'grappe',
        etiquette: 'Grappe',
        valeurs: (q) => (q.grappe ? [{ id: `g${q.grappe.id}`, libelle: q.grappe.nom }] : []),
      },
    ],
    [sombre],
  );

  const visibles = useMemo(
    () => appliquerFiltres(base.lignes, facettes, filtres, recherche, (q) => [q.libelle, q.notes, q.pilote?.nom]),
    [base.lignes, facettes, filtres, recherche],
  );

  const colonnes: Colonne<Question>[] = [
    {
      cle: 'libelle',
      entete: 'Question de recherche',
      rendu: (q) => q.libelle,
      edition: (q, fin) => (
        <EditionTexte valeur={q.libelle} terminer={fin} multiligne onValider={(v) => base.majChamp(q.id, 'libelle', v)} />
      ),
    },
    {
      cle: 'pilote',
      entete: 'Pilote',
      largeur: '160px',
      valeur: (q) => q.pilote?.nom ?? '',
      rendu: (q) => q.pilote?.nom ?? <span className="attenue">—</span>,
      edition: (q, fin) => (
        <SaisieAssistee
          valeur={q.pilote_id}
          options={options.personnes}
          onChoisir={(id) => { base.majChamp(q.id, 'pilote_id', id); fin(); }}
          onCreer={async (nom) => {
            const c = await api.creerReference('personnes', { libelle: nom });
            return { id: c.id, libelle: c.nom ?? nom };
          }}
        />
      ),
    },
    {
      cle: 'projets',
      entete: 'Projets',
      largeur: '170px',
      valeur: (q) => q.projets.map((p) => p.acronyme).join(' ; '),
      rendu: (q) => (
        <div className="etiquettes">
          {q.projets.length ? (
            q.projets.map((p) => (
              <span key={p.id} className="chip chip-lecture" title={p.titre}>{p.acronyme}</span>
            ))
          ) : q.idees.length ? (
            q.idees.map((i) => (
              <span key={i.id} className="chip chip-lecture" title="Idée brute">💡 {i.libelle}</span>
            ))
          ) : (
            <span className="attenue">—</span>
          )}
        </div>
      ),
      edition: (q, fin) => (
        <>
          <ChoixMultiple
            valeurs={q.projets.map((p) => p.id)}
            options={(projets.data ?? []).map((p) => ({ id: p.id, libelle: p.acronyme }))}
            onChanger={(ids) => base.majChamp(q.id, 'projets', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>Terminer</button>
        </>
      ),
    },
    {
      cle: 'problematique',
      entete: 'Problématique',
      largeur: '175px',
      valeur: (q) => q.problematique?.libelle ?? '',
      rendu: (q) =>
        q.problematique ? (
          <span title={q.problematique.axes_valides ? undefined : 'Rattachement aux axes à relire'}>
            {q.problematique.libelle}
            {!q.problematique.axes_valides && <span className="attenue"> ·  à relire</span>}
          </span>
        ) : (
          <span className="attenue">—</span>
        ),
      edition: (q, fin) => (
        <SaisieAssistee
          valeur={q.problematique_id}
          options={(referentiels?.problematiques ?? []).map((x) => ({ id: x.id, libelle: x.libelle }))}
          onChoisir={(id) => { base.majChamp(q.id, 'problematique_id', id); fin(); }}
          onCreer={async (libelle) => {
            const c = await api.creerReference('problematiques', { libelle });
            return { id: c.id, libelle: c.libelle ?? libelle };
          }}
        />
      ),
    },
    {
      cle: 'transition',
      entete: 'Transition alimentaire',
      secondaire: true,
      largeur: '180px',
      valeur: (q) => q.transition?.libelle ?? '',
      rendu: (q) => q.transition?.libelle ?? <span className="attenue">—</span>,
      edition: (q, fin) => (
        <SaisieAssistee
          valeur={q.transition_id}
          options={(referentiels?.transitions ?? []).map((x) => ({ id: x.id, libelle: x.libelle }))}
          onChoisir={(id) => { base.majChamp(q.id, 'transition_id', id); fin(); }}
          onCreer={async (libelle) => {
            const c = await api.creerReference('transitions', { libelle });
            return { id: c.id, libelle: c.libelle ?? libelle };
          }}
        />
      ),
    },
    {
      cle: 'axes',
      entete: 'Axes',
      largeur: '120px',
      valeur: (q) => q.axes.map((a) => a.code).join(' '),
      rendu: (q) =>
        q.axes.length === 0 ? (
          <span className="a-qualifier" title="Axe non renseigné — voir la page Qualification">
            à qualifier
          </span>
        ) : (
          <div className="etiquettes">
            {q.axes.map((a) => (
              <span key={a.id} className="chip chip-lecture" title={a.libelle}>
                <span className="pastille" style={{ background: couleurAxe(a, sombre) }} />
                {a.code}
              </span>
            ))}
          </div>
        ),
      edition: (q, fin) => (
        <>
          <ChoixMultiple
            valeurs={q.axes.map((a) => a.id)}
            options={options.axes}
            couleurs={Object.fromEntries((referentiels?.axes ?? []).map((a) => [a.id, couleurAxe(a, sombre)]))}
            onChanger={(ids) => ids.length > 0 && base.majChamp(q.id, 'axes', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>
            Terminer
          </button>
        </>
      ),
    },
    {
      cle: 'grappe',
      entete: 'Grappe',
      secondaire: true,
      largeur: '130px',
      valeur: (q) => q.grappe?.nom ?? '',
      rendu: (q) => (q.grappe ? <span className="chip chip-lecture">{q.grappe.nom}</span> : <span className="attenue">—</span>),
    },
    {
      cle: 'maj_le',
      entete: 'Modifiée',
      secondaire: true,
      largeur: '115px',
      valeur: (q) => q.maj_le,
      rendu: (q) => <span className="attenue petit">{formaterDateHeure(q.maj_le)}</span>,
    },
  ];

  if (!referentiels) return <p className="attenue">Chargement…</p>;

  return (
    <>
      <EntetePage
        titre="Questions de recherche"
        sousTitre="Chaque question relève d'au moins un axe de recherche ; le rattachement à un pilote et à un projet reste facultatif."
        actions={
          <>
            <BoutonExcel lignes={visibles} colonnes={colonnes} nom="Questions de recherche" />
            <button type="button" className="btn" onClick={() => setDialogueAdm(true)}>
              ✦ Acquisition de données
            </button>
            <button type="button" className="btn btn-primaire" onClick={() => setCreation(true)}>
              + Nouvelle question
            </button>
          </>
        }
      />

      {message && <Bandeau>{message}</Bandeau>}
      <EtatChargement chargement={base.chargement} erreur={base.erreur} onFermer={base.effacerErreur} />

      <BarreFiltres
        lignes={base.lignes}
        facettes={facettes}
        etat={filtres}
        onChanger={setFiltres}
        recherche={recherche}
        onRecherche={setRecherche}
        placeholderRecherche="Rechercher dans les questions…"
      />

      <BarreGrappage
        typeEntite="question"
        ressource="questions"
        selection={selection}
        onSelection={setSelection}
        grappes={grappes.data ?? []}
        lignes={base.lignes}
        onFait={(m) => { setMessage(m); base.invalider(); }}
      />

      <Tableau
        lignes={visibles}
        colonnes={colonnes}
        cleColonnes="questions"
        selection={selection}
        onSelection={setSelection}
        onDeposer={(source, cible) => setSelection([...new Set([...selection, source, cible])])}
        onBasculerVerrou={base.basculerVerrou}
        onSupprimer={(q) => confirm(`Supprimer « ${q.libelle.slice(0, 60)} » ?`) && base.supprimer.mutate(q.id)}
      />

      {dialogueAdm && (
        <DialogueAdm
          cible="question"
          referentiels={referentiels}
          admDisponible={adm?.disponible ?? false}
          onFermer={() => setDialogueAdm(false)}
          onEnregistre={(m) => { setMessage(m); setDialogueAdm(false); base.invalider(); }}
        />
      )}

      {creation && (
        <FormulaireQuestion
          referentiels={referentiels}
          projets={projets.data ?? []}
          onFermer={() => setCreation(false)}
          onEnregistrer={(corps) => { base.creer.mutate(corps); setCreation(false); }}
        />
      )}
    </>
  );
}

function FormulaireQuestion({
  referentiels,
  projets,
  onFermer,
  onEnregistrer,
}: {
  referentiels: NonNullable<ReturnType<typeof useReferentiels>['data']>;
  projets: Projet[];
  onFermer: () => void;
  onEnregistrer: (corps: unknown) => void;
}) {
  const sombre = useThemeSombre();
  const [libelle, setLibelle] = useState('');
  const [axes, setAxes] = useState<number[]>([]);
  const [piloteId, setPiloteId] = useState<number | null>(null);
  const [projetsChoisis, setProjetsChoisis] = useState<number[]>([]);
  const [problematiqueId, setProblematiqueId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const valide = libelle.trim().length > 0 && axes.length > 0;

  return (
    <Modale
      titre="Nouvelle question de recherche"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button
            type="button"
            className="btn btn-primaire"
            disabled={!valide}
            onClick={() =>
              onEnregistrer({
                libelle: libelle.trim(),
                axes,
                pilote_id: piloteId,
                projets: projetsChoisis,
                problematique_id: problematiqueId,
                notes: notes.trim() || null,
              })
            }
          >
            Créer
          </button>
        </>
      }
    >
      <label className="champ">
        <span>Question <span className="requis">*</span></span>
        <textarea value={libelle} onChange={(e) => setLibelle(e.target.value)} rows={3} autoFocus />
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
          <span>Pilote</span>
          <SaisieAssistee
            valeur={piloteId}
            options={referentiels.personnes.map((p) => ({ id: p.id, libelle: p.nom }))}
            onChoisir={setPiloteId}
            onCreer={async (nom) => {
              const c = await api.creerReference('personnes', { libelle: nom });
              return { id: c.id, libelle: c.nom ?? nom };
            }}
            placeholder="Aucun"
          />
        </label>
        <label className="champ">
          <span>Problématique</span>
          <SaisieAssistee
            valeur={problematiqueId}
            options={referentiels.problematiques.map((x) => ({ id: x.id, libelle: x.libelle }))}
            onChoisir={setProblematiqueId}
            onCreer={async (libelle) => {
              const c = await api.creerReference('problematiques', { libelle });
              return { id: c.id, libelle: c.libelle ?? libelle };
            }}
            placeholder="Aucune"
          />
        </label>
      </div>

      <label className="champ">
        <span>Projets qui travaillent cette question</span>
        <ChoixMultiple
          valeurs={projetsChoisis}
          options={projets.map((p) => ({ id: p.id, libelle: p.acronyme }))}
          onChanger={setProjetsChoisis}
        />
      </label>

      <label className="champ">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
    </Modale>
  );
}
