import { useRef, useState } from 'react';
import { MediaviewerWidget } from '../MediaviewerWidget';
import { MediaviewerState } from '../MediaviewerState';
import { VideoPlayer } from '@videovault-player';
import type { MediaviewerHandle, VideoSource } from '@videovault-player';
import './dev.css';

/** Inline SVG poster so the demo looks alive offline (no CDN images). */
function poster(hue: number, label: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue} 55% 22%)"/>
          <stop offset="1" stop-color="hsl(${hue + 30} 60% 12%)"/>
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#g)"/>
      <g fill="hsl(${hue} 80% 70%)" opacity="0.9">
        <circle cx="160" cy="90" r="26" fill="none" stroke="hsl(${hue} 80% 75%)" stroke-width="2"/>
        <path d="M152 78l22 12-22 12z"/>
      </g>
      <text x="16" y="166" fill="rgba(255,255,255,0.7)" font-family="monospace" font-size="13">${label}</text>
    </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}

const exampleVideos: VideoSource[] = [
  {
    id: 'v1',
    url: '',
    title: 'Erste Schritte mit VideoVault',
    duration: 64,
    poster: poster(28, 'INTRO'),
    tags: ['Onboarding', 'Basics'],
  },
  {
    id: 'v2',
    url: '',
    title: 'Kategorien & Tags verwalten',
    duration: 142,
    poster: poster(190, 'TAGS'),
    tags: ['Kategorien'],
  },
  {
    id: 'v3',
    url: '',
    title: 'Videos schneiden mit dem Splitter',
    duration: 95,
    tags: ['Editing', 'FFmpeg'],
  },
  {
    id: 'v4',
    url: '',
    title: 'Stapelverarbeitung & Bulk-Aktionen',
    duration: 210,
    poster: poster(280, 'BULK'),
  },
  { id: 'v5', url: '', title: 'Duplikate aufspüren', duration: 58 },
  {
    id: 'v6',
    url: '',
    title: 'Filter-Engine im Detail',
    duration: 176,
    poster: poster(140, 'FILTER'),
    tags: ['Suche', 'Filter', 'Advanced'],
  },
];

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const widgetRef = useRef<MediaviewerHandle>(null);

  const playRandom = () => {
    const v = exampleVideos[Math.floor(Math.random() * exampleVideos.length)];
    widgetRef.current?.playVideo(v.id);
  };

  return (
    <div className="host" data-theme={theme}>
      <nav className="host__rail" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
      </nav>

      <main className="host__main">
        <div className="host__crumb">Workspace · brainstorm-session</div>
        <h1 className="host__title">Companion-Host</h1>
        <p className="host__lede">
          Diese Spalte simuliert die k8s-Workspace-Oberfläche. Rechts sitzt das Mediaviewer-Widget
          als eingebettetes Companion-Panel — token-getrieben, ohne CSS in den Host zu lecken.
        </p>
        <div className="host__skeleton" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </main>

      <aside className="host__panel">
        <div className="host__panel-head">
          <h2>Companion</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="host__toggle" onClick={playRandom}>
              handle.playVideo()
            </button>
            <button
              className="host__toggle"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? '☾ dark' : '☀ light'}
            </button>
          </div>
        </div>

        <div className="host__slot">
          <MediaviewerWidget
            ref={widgetRef}
            videos={exampleVideos}
            onSelect={(id) => console.log('select', id)}
            onEnded={(id) => console.log('ended', id)}
            onError={(id, msg) => console.warn('error', id, msg)}
          />
        </div>

        <section className="gallery">
          <h3>Player-Chrome</h3>
          <div className="mv-root" data-theme={theme} style={{ height: 200, marginBottom: 18 }}>
            <div className="mv-widget__stage" style={{ aspectRatio: 'auto', height: '100%' }}>
              <VideoPlayer
                source={{ ...exampleVideos[0], poster: poster(28, 'INTRO') }}
                showControls
              />
            </div>
          </div>
        </section>

        <section className="gallery">
          <h3>State-Assets</h3>
          <div className="gallery__grid">
            {(['loading', 'buffering', 'error', 'empty'] as const).map((kind) => (
              <div className="gallery__cell" key={kind}>
                <span className="gallery__tag">{kind}</span>
                <div className="mv-root" data-theme={theme} style={{ height: '100%' }}>
                  <div className="mv-widget__stage" style={{ aspectRatio: 'auto', height: '100%' }}>
                    <MediaviewerState
                      kind={kind}
                      onRetry={kind === 'error' ? () => {} : undefined}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
