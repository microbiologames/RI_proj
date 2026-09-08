import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Idee, Partenaire, StatutIdee } from '../lib/types';
import { COULEURS_STATUT_IDEE, LIBELLES_STATUT_IDEE } from '../lib/types';
import { couleurAxe, formaterDateHeure, useThemeSombre } from '../lib/utils';
import { Bandeau, ChoixMultiple, Modale, SaisieAssistee } from '../components/Base';
import { EditionTexte, Tableau, type Colonne } from '../components/Tableau';
import { appliquerFiltres, BarreFiltres, type EtatFiltres, type Facette } from '../components/Filtres';
import { DialogueAdm } from '../components/DialogueAdm';
import { BoutonExcel, EntetePage, EtatChargement, useBase, useEtatAdm, useOptions, useReferentiels } from './commun';
import { BarreGrappage } from './Grappage';

export function PageIdees() {
  const sombre = useThemeSombre();
  const base = useBase<Idee>('idees');
  const { data: referentiels } = useReferentiels();
  const { data: adm } = useEtatAdm();
  const options = useOptions(referentiels);
  const partenaires = useQuery({ queryKey: ['partenaires'], queryFn: () => api.lister<Partenaire>('partenaires') });
  const grappes = useQuery({ queryKey: ['grappes'], queryFn: api.grappes });

  const [filtres, setFiltres] = useState<EtatFiltres>({});
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<number[]>([]);
  const [dialogueAdm, setDialogueAdm] = useState(false);
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const facettes: Facette<Idee>[] = useMemo(
    () => [
      {
        cle: 'axes',
        etiquette: 'Axes',
        valeurs: (i) => i.axes.map((a) => ({ id: `a${a.id}`, libelle: a.code, couleur: couleurAxe(a, sombre) })),
      },
      {
        cle: 'pilote',
        etiquette: 'Pilote',
        valeurs: (i) => (i.pilote ? [{ id: `p${i.pilote.id}`, libelle: i.pilote.nom }] : [{ id: 'p0', libelle: 'Sans pilote' }]),
      },
      {
        cle: 'partenaire',
        etiquette: 'Partenaire',
        valeurs: (i) =>
          i.partenaire ? [{ id: `pt${i.partenaire.id}`, libelle: i.partenaire.nom }] : [{ id: 'pt0', libelle: 'Sans partenaire' }],
      },
      {
        cle: 'statut',
        etiquette: 'Statut',
        valeurs: (i) => [{ id: i.statut, libelle: LIBELLES_STATUT_IDEE[i.statut], couleur: COULEURS_STATUT_IDEE[i.statut] }],
      },
      {
        cle: 'qualification',
        etiquette: 'Axes',
        valeurs: (i) => (i.axes.length === 0 ? [{ id: 'x0', libelle: 'À qualifier' }] : []),
      },
      {
        cle: 'maturite',
        etiquette: 'Maturité',
        valeurs: (i) =>
          i.projet_id
            ? [{ id: 'm2', libelle: 'Devenue projet' }]
            : i.grappe_id
              ? [{ id: 'm1', libelle: 'En grappe' }]
              : [{ id: 'm0', libelle: 'Isolée' }],
      },
    ],
    [sombre],
  );

  const visibles = useMemo(
    () =>
      appliquerFiltres(base.lignes, facettes, filtres, recherche, (i) => [
        i.libelle,
        i.notes,
        i.pilote?.nom,
        i.partenaire?.nom,
      ]),
    [base.lignes, facettes, filtres, recherche],
  );

  const colonnes: Colonne<Idee>[] = [
    {
      cle: 'libelle',
      entete: 'Idée brute',
      rendu: (i) => (
        <>
          {i.libelle}
          {i.titre && i.titre !== i.libelle && (
            <span className="attenue petit tronque-lignes" style={{ display: '-webkit-box' }} title={i.titre}>
              {i.titre}
            </span>
          )}
        </>
      ),
      edition: (i, fin) => (
        <EditionTexte valeur={i.libelle} terminer={fin} multiligne onValider={(v) => base.majChamp(i.id, 'libelle', v)} />
      ),
    },
    {
      cle: 'statut',
      entete: 'Statut',
      largeur: '175px',
      valeur: (i) => LIBELLES_STATUT_IDEE[i.statut],
      rendu: (i) => (
        <span className="pastille-statut">
          <span className="point" style={{ background: COULEURS_STATUT_IDEE[i.statut] }} />
          {LIBELLES_STATUT_IDEE[i.statut]}
        </span>
      ),
      edition: (i, fin) => (
        <select
          autoFocus
          defaultValue={i.statut}
          onChange={(e) => { base.majChamp(i.id, 'statut', e.target.value as StatutIdee); fin(); }}
          onBlur={fin}
        >
          {Object.entries(LIBELLES_STATUT_IDEE).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      ),
    },
    {
      cle: 'pilote',
      entete: 'Pilote',
      largeur: '150px',
      valeur: (i) => i.pilote?.nom ?? '',
      rendu: (i) => i.pilote?.nom ?? <span className="attenue">—</span>,
      edition: (i, fin) => (
        <SaisieAssistee
          valeur={i.pilote_id}
          options={options.personnes}
          onChoisir={(id) => { base.majChamp(i.id, 'pilote_id', id); fin(); }}
          onCreer={async (nom) => {
            const c = await api.creerReference('personnes', { libelle: nom });
            return { id: c.id, libelle: c.nom ?? nom };
          }}
        />
      ),
    },
    {
      cle: 'partenaire',
      entete: 'Partenaire',
      largeur: '160px',
      valeur: (i) => i.partenaire?.nom ?? '',
      rendu: (i) => i.partenaire?.nom ?? <span className="attenue">—</span>,
      edition: (i, fin) => (
        <SaisieAssistee
          valeur={i.partenaire_id}
          options={(partenaires.data ?? []).map((p) => ({ id: p.id, libelle: p.nom }))}
          onChoisir={(id) => { base.majChamp(i.id, 'partenaire_id', id); fin(); }}
        />
      ),
    },
    {
      cle: 'axes',
      entete: 'Axes',
      largeur: '120px',
      valeur: (i) => i.axes.map((a) => a.code).join(' '),
      rendu: (i) =>
        i.axes.length === 0 ? (
          <span className="a-qualifier" title="Axe non renseigné — voir la page Qualification">
            à qualifier
          </span>
        ) : (
          <div className="etiquettes">
            {i.axes.map((a) => (
              <span key={a.id} className="chip chip-lecture" title={a.libelle}>
                <span className="pastille" style={{ background: couleurAxe(a, sombre) }} />
                {a.code}
              </span>
            ))}
          </div>
        ),
      edition: (i, fin) => (
        <>
          <ChoixMultiple
            valeurs={i.axes.map((a) => a.id)}
            options={options.axes}
            couleurs={Object.fromEntries((referentiels?.axes ?? []).map((a) => [a.id, couleurAxe(a, sombre)]))}
            onChanger={(ids) => ids.length > 0 && base.majChamp(i.id, 'axes', ids)}
          />
          <button type="button" className="btn btn-s" style={{ marginTop: 6 }} onClick={fin}>Terminer</button>
        </>
      ),
    },
    {
      cle: 'devenir',
      entete: 'Devenir',
      largeur: '150px',
      valeur: (i) => i.projet?.acronyme ?? i.grappe?.nom ?? '',
      rendu: (i) =>
        i.projet ? (
          <span className="chip chip-lecture">→ {i.projet.acronyme}</span>
        ) : i.grappe ? (
          <span className="chip chip-lecture">⧉ {i.grappe.nom}</span>
        ) : (
          <span className="attenue">—</span>
        ),
    },
    {
      cle: 'maj_le',
      entete: 'Modifiée',
      secondaire: true,
      largeur: '115px',
      valeur: (i) => i.maj_le,
      rendu: (i) => <span className="attenue petit">{formaterDateHeure(i.maj_le)}</span>,
    },
  ];

  if (!referentiels) return <p className="attenue">Chargement…</p>;

  return (
    <>
      <EntetePage
        titre="Idées brutes"
        sousTitre="Même structure que les projets, informations manquantes assumées. Une idée mûre — seule ou en grappe — se bascule en projet « en préparation »."
        actions={
          <>
            <BoutonExcel lignes={visibles} colonnes={colonnes} nom="Idées brutes" />
            <button type="button" className="btn" onClick={() => setDialogueAdm(true)}>✦ Acquisition de données</button>
            <button type="button" className="btn btn-primaire" onClick={() => setCreation(true)}>+ Nouvelle idée</button>
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
        placeholderRecherche="Rechercher dans les idées…"
      />

      <BarreGrappage
        typeEntite="idee"
        ressource="idees"
        selection={selection}
        onSelection={setSelection}
        grappes={grappes.data ?? []}
        lignes={base.lignes}
        onFait={(m) => { setMessage(m); base.invalider(); }}
      />

      <Tableau
        lignes={visibles}
        colonnes={colonnes}
        cleColonnes="idees"
        selection={selection}
        onSelection={setSelection}
        onDeposer={(source, cible) => setSelection([...new Set([...selection, source, cible])])}
        onBasculerVerrou={base.basculerVerrou}
        onSupprimer={(i) => confirm(`Supprimer « ${i.libelle.slice(0, 60)} » ?`) && base.supprimer.mutate(i.id)}
      />

      {dialogueAdm && (
        <DialogueAdm
          cible="idee"
          referentiels={referentiels}
          admDisponible={adm?.disponible ?? false}
          onFermer={() => setDialogueAdm(false)}
          onEnregistre={(m) => { setMessage(m); setDialogueAdm(false); base.invalider(); }}
        />
      )}

      {creation && (
        <FormulaireIdee
          referentiels={referentiels}
          partenaires={partenaires.data ?? []}
          onFermer={() => setCreation(false)}
          onEnregistrer={(corps) => { base.creer.mutate(corps); setCreation(false); }}
        />
      )}
    </>
  );
}

function FormulaireIdee({
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
  const [libelle, setLibelle] = useState('');
  const [statut, setStatut] = useState<StatutIdee>('brute');
  const [axes, setAxes] = useState<number[]>([]);
  const [piloteId, setPiloteId] = useState<number | null>(null);
  const [partenaireId, setPartenaireId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  return (
    <Modale
      titre="Nouvelle idée brute"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button
            type="button"
            className="btn btn-primaire"
            disabled={!libelle.trim() || axes.length === 0}
            onClick={() =>
              onEnregistrer({
                libelle: libelle.trim(),
                statut,
                axes,
                pilote_id: piloteId,
                partenaire_id: partenaireId,
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
        <span>Idée <span className="requis">*</span> <span className="attenue">— une phrase</span></span>
        <textarea value={libelle} onChange={(e) => setLibelle(e.target.value)} rows={2} autoFocus />
      </label>

      <label className="champ">
        <span>Statut <span className="requis">*</span></span>
        <select value={statut} onChange={(e) => setStatut(e.target.value as StatutIdee)}>
          {Object.entries(LIBELLES_STATUT_IDEE).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <span className="attenue petit">
          Une idée reste brute tant que le CODIR ne l'a pas validée ; elle devient ensuite un projet « en préparation ».
        </span>
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
          <span>Partenaire</span>
          <SaisieAssistee
            valeur={partenaireId}
            options={partenaires.map((p) => ({ id: p.id, libelle: p.nom }))}
            onChoisir={setPartenaireId}
            placeholder="Aucun"
          />
        </label>
      </div>

      <label className="champ">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
    </Modale>
  );
}
