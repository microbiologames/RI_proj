import donneesInitiales from './donnees.json';

/**
 * Serveur en mémoire pour la démonstration.
 *
 * L'application est celle du dépôt, sans modification : seul `fetch` est
 * intercepté. Les lectures viennent d'un instantané de la base réelle ; les
 * écritures s'appliquent à cet instantané, en mémoire, et disparaissent au
 * rechargement de la page. La bannière de la démo le dit à l'utilisateur.
 *
 * L'intérêt de passer par `fetch` plutôt que par un jeu de données figé :
 * l'interface, ses filtres, ses recalculs et sa propagation d'axes sont
 * exactement ceux qui tourneront sur le serveur.
 */

type Ligne = Record<string, any>;
const base: Record<string, any> = JSON.parse(JSON.stringify(donneesInitiales));

/** Chemin d'API → clé dans l'instantané. */
const LISTES: Record<string, string> = {
  questions: '/questions',
  idees: '/idees',
  projets: '/projets',
  partenaires: '/partenaires',
  transferts: '/transferts',
  grappes: '/grappes',
  problematiques: '/problematiques',
};

/** Liaisons éditables : nom du champ → référentiel et forme de l'objet rendu. */
const LIAISONS: Record<string, { source: string; forme: (o: Ligne) => Ligne }> = {
  axes: { source: 'axes', forme: (a) => a },
  pilotes: { source: 'personnes', forme: (p) => ({ id: p.id, nom: p.nom }) },
  expertises: { source: 'expertises', forme: (e) => ({ id: e.id, libelle: e.libelle, domaine: e.domaine ?? null }) },
  financements: { source: 'financements', forme: (f) => ({ id: f.id, libelle: f.libelle }) },
  labellisations: { source: 'labellisations', forme: (l) => ({ id: l.id, libelle: l.libelle }) },
};

function referentiel(nom: string): Ligne[] {
  return base['/referentiels'][nom] ?? [];
}

function reponse(corps: unknown, statut = 200): Response {
  return new Response(corps === null ? null : JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Applique une modification partielle à une ligne de l'instantané. */
function appliquer(ressource: string, ligne: Ligne, corps: Ligne): void {
  for (const [champ, valeur] of Object.entries(corps)) {
    const liaison = LIAISONS[champ];
    if (liaison && Array.isArray(valeur)) {
      const source = referentiel(liaison.source);
      ligne[champ] = (valeur as number[])
        .map((id) => source.find((o) => o.id === id))
        .filter(Boolean)
        .map(liaison.forme);
      continue;
    }
    // Les relations vers une autre base : on recompose l'objet imbriqué que
    // les vues du serveur renvoient, pour que l'affichage reste cohérent.
    if (champ === 'projets' && Array.isArray(valeur)) {
      ligne.projets = (valeur as number[])
        .map((id) => base['/projets'].find((p: Ligne) => p.id === id))
        .filter(Boolean)
        .map((p: Ligne) => ({ id: p.id, acronyme: p.acronyme, titre: p.titre, statut: p.statut }));
      continue;
    }
    if (champ === 'pilote_id') {
      ligne.pilote_id = valeur;
      const p = referentiel('personnes').find((x) => x.id === valeur);
      ligne.pilote = p ? { id: p.id, nom: p.nom } : null;
      continue;
    }
    if (champ === 'problematique_id') {
      ligne.problematique_id = valeur;
      const pb = base['/problematiques'].find((x: Ligne) => x.id === valeur);
      ligne.problematique = pb ? { id: pb.id, libelle: pb.libelle, axes_valides: pb.axes_valides } : null;
      continue;
    }
    if (champ === 'transition_id') {
      ligne.transition_id = valeur;
      const t = referentiel('transitions').find((x) => x.id === valeur);
      ligne.transition = t ? { id: t.id, libelle: t.libelle } : null;
      continue;
    }
    if (champ === 'categorie_id') {
      ligne.categorie_id = valeur;
      const c = referentiel('categories_partenaire').find((x) => x.id === valeur);
      ligne.categorie = c ? { id: c.id, libelle: c.libelle } : null;
      continue;
    }
    ligne[champ] = valeur;
  }
  ligne.maj_le = new Date().toISOString();
}

/**
 * Qualification d'une problématique : reproduit la propagation du serveur —
 * les axes de la question sont redéfinis par sa problématique, ceux des
 * projets et idées liés sont ajoutés sans rien retirer.
 */
function qualifier(id: number, corps: Ligne) {
  const pb = base['/problematiques'].find((p: Ligne) => p.id === id);
  if (!pb) return { erreur: 'Problématique introuvable' };

  if (corps.libelle !== undefined) pb.libelle = corps.libelle;
  if (corps.axes_valides !== undefined) pb.axes_valides = corps.axes_valides;

  const propagation = { questions: 0, projets: 0, idees: 0 };
  if (Array.isArray(corps.axes)) {
    pb.axes = corps.axes
      .map((axeId: number) => referentiel('axes').find((a) => a.id === axeId))
      .filter(Boolean);

    for (const q of base['/questions'] as Ligne[]) {
      if (q.problematique_id !== id) continue;
      q.axes = pb.axes.map((a: Ligne) => ({ ...a }));
      propagation.questions += 1;

      for (const lien of q.projets ?? []) {
        const projet = base['/projets'].find((p: Ligne) => p.id === lien.id);
        if (!projet) continue;
        for (const a of pb.axes) {
          if (!projet.axes.some((x: Ligne) => x.id === a.id)) {
            projet.axes.push({ ...a });
            propagation.projets += 1;
          }
        }
      }
      for (const lien of q.idees ?? []) {
        const idee = base['/idees'].find((i: Ligne) => i.id === lien.id);
        if (!idee) continue;
        for (const a of pb.axes) {
          if (!idee.axes.some((x: Ligne) => x.id === a.id)) {
            idee.axes.push({ ...a });
            propagation.idees += 1;
          }
        }
      }
    }
    // Les questions portent la problématique : leur libellé de rattachement suit.
    for (const q of base['/questions'] as Ligne[]) {
      if (q.problematique_id === id && q.problematique) q.problematique.axes_valides = pb.axes_valides;
    }
  }

  recalculerEtat();
  return { ...pb, propagation };
}

function recalculerEtat(): void {
  const sansAxe = (l: Ligne[]) => l.filter((x) => (x.axes ?? []).length === 0).length;
  base['/qualification/etat'] = {
    problematiques: base['/problematiques'].length,
    problematiques_validees: base['/problematiques'].filter((p: Ligne) => p.axes_valides).length,
    problematiques_sans_axe: base['/problematiques'].filter((p: Ligne) => (p.axes ?? []).length === 0).length,
    questions: base['/questions'].length,
    questions_sans_axe: sansAxe(base['/questions']),
    projets: base['/projets'].length,
    projets_sans_axe: sansAxe(base['/projets']),
    idees: base['/idees'].length,
    idees_sans_axe: sansAxe(base['/idees']),
  };
}

function journaliser(resume: string): void {
  base['/journal?limite=300'].unshift({
    id: Date.now(),
    horodatage: new Date().toISOString(),
    entite: 'demo',
    entite_id: null,
    action: 'modification',
    resume,
    details: {},
    auteur: 'démonstration',
  });
}

export function installerServeurMemoire(): void {
  const vrai = window.fetch.bind(window);

  window.fetch = async (entree: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    if (!url.includes('/api/')) return vrai(entree as RequestInfo, options);

    const chemin = url.slice(url.indexOf('/api/') + 4);
    const methode = (options?.method ?? 'GET').toUpperCase();
    const corps = options?.body ? JSON.parse(options.body as string) : {};
    // Un court délai rend le comportement réaliste (états de chargement).
    await new Promise((r) => setTimeout(r, 60));

    if (methode === 'GET') {
      if (chemin.startsWith('/journal')) return reponse(base['/journal?limite=300']);
      if (chemin.startsWith('/equipe/suggestion-pilote')) return reponse(suggestions(chemin));
      const cle = Object.keys(base).find((k) => k === chemin || k === chemin.split('?')[0]);
      if (cle) return reponse(base[cle]);
      if (chemin === '/sante') return reponse({ statut: 'ok', horodatage: new Date().toISOString() });
      return reponse({ erreur: `Route ${chemin} non simulée dans la démonstration` }, 404);
    }

    // ---- Écritures : appliquées à l'instantané, en mémoire uniquement ----
    const qualif = chemin.match(/^\/problematiques\/(\d+)$/);
    if (qualif && methode === 'PATCH') {
      const r = qualifier(Number(qualif[1]), corps);
      journaliser(`Qualification de « ${(r as Ligne).libelle ?? ''} »`);
      return reponse(r);
    }

    if (chemin === '/qualification/valider-tout') {
      let n = 0;
      for (const p of base['/problematiques'] as Ligne[]) {
        if (!p.axes_valides && (p.axes ?? []).length) { p.axes_valides = true; n += 1; }
      }
      recalculerEtat();
      journaliser(`${n} problématique(s) validées en bloc`);
      return reponse({ validees: n });
    }

    const cible = chemin.match(/^\/([a-z_]+)(?:\/(\d+))?$/);
    if (cible) {
      const [, ressource, id] = cible;
      const cle = LISTES[ressource!];
      if (!cle) return reponse({ erreur: 'Action non disponible dans la démonstration.' }, 400);
      const liste = base[cle] as Ligne[];

      if (methode === 'PATCH' && id) {
        const ligne = liste.find((l) => l.id === Number(id));
        if (!ligne) return reponse({ erreur: 'Entrée introuvable' }, 404);
        if (ligne.verrouille && !(Object.keys(corps).length === 1 && 'verrouille' in corps)) {
          return reponse({ erreur: `Cette entrée est verrouillée : déverrouillez-la avant de la modifier.` }, 423);
        }
        appliquer(ressource!, ligne, corps);
        recalculerEtat();
        journaliser(`Modification de ${ressource} #${id} (${Object.keys(corps).join(', ')})`);
        return reponse(ligne);
      }

      if (methode === 'POST') {
        const nouvelle: Ligne = {
          id: Math.max(0, ...liste.map((l) => l.id)) + 1,
          verrouille: false,
          cree_le: new Date().toISOString(),
          maj_le: new Date().toISOString(),
          notes: null,
          axes: [], pilotes: [], partenaires: [], financements: [], labellisations: [],
          questions: [], projets: [], idees: [], expertises: [],
          pilote: null, projet: null, grappe: null, transition: null, problematique: null,
          categorie: null, nb_transferts: 0,
        };
        appliquer(ressource!, nouvelle, corps);
        liste.unshift(nouvelle);
        recalculerEtat();
        journaliser(`Création dans ${ressource}`);
        return reponse(nouvelle, 201);
      }

      if (methode === 'DELETE' && id) {
        const i = liste.findIndex((l) => l.id === Number(id));
        if (i >= 0) {
          if (liste[i]!.verrouille) return reponse({ erreur: 'Entrée verrouillée.' }, 423);
          journaliser(`Suppression dans ${ressource} #${id}`);
          liste.splice(i, 1);
          recalculerEtat();
        }
        return new Response(null, { status: 204 });
      }
    }

    if (chemin.startsWith('/referentiels/')) {
      const nom = chemin.split('/')[2]!;
      const liste = referentiel(nom);
      const cree = { id: Math.max(0, ...liste.map((o: Ligne) => o.id)) + 1, libelle: corps.libelle, nom: corps.libelle };
      liste.push(cree);
      return reponse(cree, 201);
    }

    if (chemin.startsWith('/geocodage')) return reponse({ lat: null, lon: null });
    if (chemin.startsWith('/adm/')) {
      return reponse({ erreur: "Le module d'acquisition n'est pas actif dans la démonstration." }, 503);
    }

    return reponse({ erreur: 'Action non disponible dans la démonstration.' }, 400);
  };
}

/** Suggestion de pilote : même formule que le serveur, sur les données figées. */
function suggestions(chemin: string) {
  const params = new URLSearchParams(chemin.split('?')[1] ?? '');
  const idsExpertises = (params.get('expertises') ?? '').split(',').map(Number).filter(Boolean);
  const idsAxes = (params.get('axes') ?? '').split(',').map(Number).filter(Boolean);

  const personnes = (base['/equipe'] as Ligne[]).filter((p) => p.equipe_ri);
  const chargeMax = Math.max(1, ...personnes.map((p) => p.nb_projets_en_cours));

  return personnes
    .map((p) => {
      const couvertes = (p.expertises ?? []).filter((e: Ligne) => idsExpertises.includes(e.id));
      const couverture = idsExpertises.length ? couvertes.length / idsExpertises.length : 0;
      const surLesAxes = (base['/projets'] as Ligne[]).filter(
        (pr) => pr.pilotes?.some((x: Ligne) => x.id === p.id) && pr.axes?.some((a: Ligne) => idsAxes.includes(a.id)),
      ).length;
      const disponibilite = 1 - p.nb_projets_en_cours / chargeMax;

      const raisons: string[] = [];
      if (couvertes.length) raisons.push(`couvre ${couvertes.length}/${idsExpertises.length} expertise(s)`);
      if (surLesAxes) raisons.push(`${surLesAxes} projet(s) déjà pilotés sur ces axes`);
      raisons.push(p.nb_projets_en_cours === 0 ? 'aucun projet en cours' : `${p.nb_projets_en_cours} projet(s) en cours`);

      return {
        personne: { id: p.id, nom: p.nom, fonction: p.fonction },
        score: Math.round((couverture * 100 + Math.min(surLesAxes, 5) * 6 + disponibilite * 20) * 10) / 10,
        couverture: Math.round(couverture * 100),
        nb_projets_en_cours: p.nb_projets_en_cours,
        experience_axes: surLesAxes,
        raisons,
      };
    })
    .sort((a, b) => b.score - a.score);
}
