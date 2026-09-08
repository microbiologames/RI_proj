import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { installerServeurMemoire } from './serveur-memoire';
import { App } from '../src/App';
import '../src/theme.css';
import './demo.css';

// Le serveur est remplacé avant tout rendu : l'application ne sait pas
// qu'elle ne parle pas à une vraie API.
installerServeurMemoire();

/**
 * Le bac à sable de la page publiée bloque tout téléchargement lancé par la
 * page. Les boutons d'export resteraient donc sans effet, ce qui laisserait
 * croire à une panne : on intercepte le clic pour dire ce qu'il en est.
 */
function expliquerExportsIndisponibles(): void {
  const clicOrigine = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (!this.hasAttribute('download')) return clicOrigine.call(this);
    message(
      this.download.endsWith('.png')
        ? "L'export PNG est bloqué sur cette page de démonstration."
        : "L'export Excel est bloqué sur cette page de démonstration.",
      'Il fonctionne normalement dans l’outil installé : le fichier est produit par votre navigateur.',
    );
  };
}

function message(titre: string, detail: string): void {
  document.querySelector('.message-demo')?.remove();
  const boite = document.createElement('div');
  boite.className = 'message-demo';
  boite.setAttribute('role', 'status');
  boite.innerHTML = `<strong></strong><span></span>`;
  boite.querySelector('strong')!.textContent = titre;
  boite.querySelector('span')!.textContent = detail;
  document.body.append(boite);
  setTimeout(() => boite.remove(), 6000);
}

expliquerExportsIndisponibles();

// La page publiée vit dans un bac à sable où l'historique du navigateur peut
// être restreint : la navigation reste donc en mémoire, ce qui la rend
// indépendante de l'URL sous laquelle la démonstration est servie.
const { hook } = memoryLocation({ path: '/projets', record: true });

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false, retry: 0 } },
});

function Banniere() {
  return (
    <div className="banniere-demo" role="note">
      <strong>Démonstration</strong>
      <span>
        Données réelles au 8 septembre 2026. Tout est manipulable — filtres, édition, qualification des axes — mais
        <strong> rien n'est enregistré</strong> : un rechargement de la page rétablit l'état initial.
      </span>
      <details>
        <summary>Ce qui diffère de l'outil installé</summary>
        <ul>
          <li>Les modifications vivent dans votre navigateur et disparaissent au rechargement.</li>
          <li>Les exports Excel et PNG sont désactivés par le bac à sable de cette page ; ils fonctionnent dans l'outil installé.</li>
          <li>Le fond des cartes ne se charge pas ici ; les points restent positionnés correctement.</li>
          <li>Le module d'acquisition de données par IA est inactif : il demande une clé côté serveur.</li>
        </ul>
      </details>
    </div>
  );
}

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <Banniere />
      <Router hook={hook}>
        <App />
      </Router>
    </QueryClientProvider>
  </StrictMode>,
);
