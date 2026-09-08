import { useEffect } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import { useMemoLocal } from './lib/utils';
import { PageQuestions } from './pages/Questions';
import { PageIdees } from './pages/Idees';
import { PageProjets } from './pages/Projets';
import { PagePartenaires } from './pages/Partenaires';
import { PageTransferts } from './pages/Transferts';
import { PageJournal } from './pages/Journal';
import { PageReglages } from './pages/Reglages';

type Theme = 'clair' | 'sombre' | 'systeme';

const PAGES = [
  { chemin: '/questions', libelle: 'Questions de recherche', icone: '❓', ressource: 'questions' },
  { chemin: '/idees', libelle: 'Idées brutes', icone: '💡', ressource: 'idees' },
  { chemin: '/projets', libelle: 'Projets', icone: '📁', ressource: 'projets' },
  { chemin: '/partenaires', libelle: 'Partenaires', icone: '🤝', ressource: 'partenaires' },
  { chemin: '/transferts', libelle: 'Transferts', icone: '📣', ressource: 'transferts' },
] as const;

export function App() {
  const [theme, setTheme] = useMemoLocal<Theme>('ri.theme', 'systeme');
  const [emplacement] = useLocation();

  useEffect(() => {
    const racine = document.documentElement;
    if (theme === 'systeme') delete racine.dataset.theme;
    else racine.dataset.theme = theme === 'sombre' ? 'dark' : 'light';
  }, [theme]);

  // Effectifs affichés dans la navigation : un aperçu du volume de chaque base.
  const effectifs = useQuery({
    queryKey: ['effectifs'],
    queryFn: async () => {
      const listes = await Promise.all(PAGES.map((p) => api.lister<{ id: number }>(p.ressource)));
      return Object.fromEntries(PAGES.map((p, i) => [p.ressource, listes[i]!.length]));
    },
    staleTime: 15_000,
  });

  return (
    <div className="appli">
      <nav className="barre-laterale">
        <div className="marque">
          <strong>Pilotage R&amp;I</strong>
          <span>Projets, questions et transferts</span>
        </div>

        {PAGES.map((p) => (
          <Link
            key={p.chemin}
            href={p.chemin}
            className="lien-nav"
            aria-current={emplacement.startsWith(p.chemin) ? 'page' : undefined}
          >
            <span aria-hidden="true">{p.icone}</span>
            {p.libelle}
            <span className="compte">{effectifs.data?.[p.ressource] ?? ''}</span>
          </Link>
        ))}

        <hr style={{ border: 'none', borderTop: '1px solid var(--bordure)', margin: '10px 4px' }} />

        <Link href="/journal" className="lien-nav" aria-current={emplacement === '/journal' ? 'page' : undefined}>
          <span aria-hidden="true">🕘</span> Journal
        </Link>
        <Link href="/reglages" className="lien-nav" aria-current={emplacement === '/reglages' ? 'page' : undefined}>
          <span aria-hidden="true">⚙️</span> Réglages
        </Link>

        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <div className="ligne" role="group" aria-label="Thème">
            {(
              [
                ['clair', '☀︎', 'Thème clair'],
                ['sombre', '☾', 'Thème sombre'],
                ['systeme', '◐', 'Suivre le système'],
              ] as const
            ).map(([v, icone, titre]) => (
              <button
                key={v}
                type="button"
                className="btn btn-s"
                aria-pressed={theme === v}
                title={titre}
                style={theme === v ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                onClick={() => setTheme(v)}
              >
                {icone}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="contenu">
        <Switch>
          <Route path="/questions" component={PageQuestions} />
          <Route path="/idees" component={PageIdees} />
          <Route path="/projets" component={PageProjets} />
          <Route path="/partenaires" component={PagePartenaires} />
          <Route path="/transferts" component={PageTransferts} />
          <Route path="/journal" component={PageJournal} />
          <Route path="/reglages" component={PageReglages} />
          <Route component={PageProjets} />
        </Switch>
      </main>
    </div>
  );
}
