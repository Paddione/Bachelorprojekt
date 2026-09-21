// Bewerbungs-Cockpit Client Script (T900233, Phase 4)
// Standalone cockpit — reads from website internal API, renders Kanban + Detail Panel.
import { browserLogger } from '../../lib/browser-logger';

type ApplicationCard = {
  id: number;
  company: string;
  role_title: string;
  status: ApplicationStatus;
  dossier_count: number;
  match_score?: number | null;
  match_evidence_ids?: string[] | null;
  source_url?: string | null;
  requirements?: string | null;
  raw_text?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ApplicationStatus = 'found' | 'drafting' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn';

type ApplicationsData = Record<ApplicationStatus, ApplicationCard[]>;

interface TimelineEvent {
  id: number;
  job_id: number;
  event_type: string;
  notes?: string;
  created_at: string;
}

interface DossierEntry {
  id: number;
  job_id: number;
  artifact_path: string;
  kind: 'resume' | 'cover_letter';
  created_at: string;
}

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  found: 'Gefunden',
  drafting: 'In Erstellung',
  applied: 'Beworben',
  interviewing: 'Interview',
  offered: 'Angebot',
  rejected: 'Abgelehnt',
  withdrawn: 'Zurückgezogen',
};

const STATUS_ORDER: ApplicationStatus[] = ['found', 'drafting', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'];

// --- API helpers ---

async function fetchApplications(): Promise<ApplicationsData> {
  const res = await fetch('/api/internal/applications/list');
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

async function fetchJobDetail(jobId: number): Promise<ApplicationCard> {
  const res = await fetch(`/api/internal/applications/${jobId}/detail`);
  if (!res.ok) throw new Error(`detail failed: ${res.status}`);
  return res.json();
}

async function updateStatus(jobId: number, status: ApplicationStatus): Promise<void> {
  const res = await fetch(`/api/internal/applications/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`status update failed: ${res.status}`);
}

async function fetchTimeline(jobId: number): Promise<TimelineEvent[]> {
  const res = await fetch(`/api/internal/applications/${jobId}/timeline`);
  if (!res.ok) throw new Error(`timeline failed: ${res.status}`);
  return res.json();
}

async function fetchDossiers(jobId: number): Promise<DossierEntry[]> {
  const res = await fetch(`/api/internal/applications/${jobId}/dossiers`);
  if (!res.ok) throw new Error(`dossiers failed: ${res.status}`);
  return res.json();
}

async function addTimelineEvent(jobId: number, eventType: string, notes: string): Promise<void> {
  const res = await fetch('/api/internal/applications/timeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, event_type: eventType, notes }),
  });
  if (!res.ok) throw new Error(`timeline add failed: ${res.status}`);
}

// --- Rendering ---

let selectedJobId: number | null = null;
let currentData: ApplicationsData = {} as ApplicationsData;

function renderBoard(): void {
  const kanban = document.getElementById('kanban');
  if (!kanban) return;
  kanban.innerHTML = '';
  kanban.classList.toggle('with-detail', selectedJobId !== null);

  for (const status of STATUS_ORDER) {
    const cards = currentData[status] ?? [];
    const column = document.createElement('div');
    column.className = 'kanban-column';
    column.dataset.status = status;

    const title = document.createElement('h2');
    title.innerHTML = `${STATUS_LABEL[status]} <span class="count">${cards.length}</span>`;
    column.appendChild(title);

    for (const card of cards) {
      column.appendChild(createCard(card));
    }

    kanban.appendChild(column);
  }
}

function createCard(card: ApplicationCard): HTMLElement {
  const el = document.createElement('div');
  el.className = 'kanban-card';
  if (card.id === selectedJobId) el.classList.add('selected');

  const title = document.createElement('h3');
  title.textContent = card.company;
  el.appendChild(title);

  const role = document.createElement('div');
  role.className = 'role';
  role.textContent = card.role_title;
  el.appendChild(role);

  // Match score
  if (card.match_score !== null && card.match_score !== undefined) {
    const score = document.createElement('span');
    score.className = `match-score ${getScoreClass(card.match_score)}`;
    score.textContent = `${Math.round(card.match_score)}%`;
    el.appendChild(score);
  } else {
    const noScore = document.createElement('span');
    noScore.className = 'match-score none';
    noScore.textContent = '—';
    el.appendChild(noScore);
  }

  // Meta
  const meta = document.createElement('div');
  meta.className = 'meta';
  const dossierCount = document.createElement('span');
  dossierCount.textContent = `${card.dossier_count} Dossiers`;
  meta.appendChild(dossierCount);
  if (card.source_url) {
    const link = document.createElement('span');
    link.textContent = '🔗 Quelle';
    link.style.cursor = 'pointer';
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      if (card.source_url) window.open(card.source_url, '_blank');
    });
    meta.appendChild(link);
  }
  el.appendChild(meta);

  el.addEventListener('click', () => selectJob(card.id));
  return el;
}

function getScoreClass(score: number): string {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

async function selectJob(jobId: number): Promise<void> {
  if (selectedJobId === jobId) {
    // Deselect
    selectedJobId = null;
    document.getElementById('detail-panel')?.setAttribute('hidden', '');
    renderBoard();
    return;
  }

  selectedJobId = jobId;
  renderBoard();
  await showDetailPanel(jobId);
}

async function showDetailPanel(jobId: number): Promise<void> {
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  if (!panel || !content) return;

  panel.removeAttribute('hidden');
  content.innerHTML = '<div class="loading">Laden...</div>';

  try {
    const [job, timeline, dossiers] = await Promise.all([
      fetchJobDetail(jobId),
      fetchTimeline(jobId),
      fetchDossiers(jobId),
    ]);

    content.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'detail-section';
    header.innerHTML = `
      <h3>${job.company}</h3>
      <p>${job.role_title}</p>
      ${job.source_url ? `<p><a href="${job.source_url}" target="_blank" rel="noopener">🔗 Quellen-URL öffnen</a></p>` : ''}
    `;
    content.appendChild(header);

    // Status Switcher
    const statusSection = document.createElement('div');
    statusSection.className = 'detail-section';
    const statusTitle = document.createElement('h3');
    statusTitle.textContent = 'Status';
    statusSection.appendChild(statusTitle);
    const statusSwitcher = document.createElement('div');
    statusSwitcher.className = 'status-switcher';

    for (const status of STATUS_ORDER) {
      const btn = document.createElement('button');
      btn.className = `status-btn${job.status === status ? ' active' : ''}`;
      btn.textContent = STATUS_LABEL[status];
      btn.addEventListener('click', async () => {
        try {
          await updateStatus(jobId, status);
          // Refresh
          await refreshData();
          // Re-show detail
          showDetailPanel(jobId);
        } catch (err) {
          browserLogger.error({ err }, 'Status update failed');
          alert('Status-Wechsel fehlgeschlagen');
        }
      });
      statusSwitcher.appendChild(btn);
    }
    statusSection.appendChild(statusSwitcher);
    content.appendChild(statusSection);

    // Match Score
    if (job.match_score !== null && job.match_score !== undefined && job.match_score > 0) {
      const scoreSection = document.createElement('div');
      scoreSection.className = 'detail-section';
      const scoreTitle = document.createElement('h3');
      scoreTitle.textContent = `Match Score: ${Math.round(job.match_score)}%`;
      scoreSection.appendChild(scoreTitle);

      if (job.match_evidence_ids && job.match_evidence_ids.length > 0) {
        const evidenceDiv = document.createElement('div');
        for (const id of job.match_evidence_ids) {
          const tag = document.createElement('span');
          tag.className = 'evidence-tag';
          tag.textContent = `ID ${id}`;
          evidenceDiv.appendChild(tag);
        }
        scoreSection.appendChild(evidenceDiv);
      }
      content.appendChild(scoreSection);
    }

    // Timeline
    const timelineSection = document.createElement('div');
    timelineSection.className = 'detail-section';
    const timelineTitle = document.createElement('h3');
    timelineTitle.textContent = `Timeline (${timeline.length})`;
    timelineSection.appendChild(timelineTitle);

    // Timeline form
    const form = document.createElement('form');
    form.style.display = 'grid';
    form.style.gap = '8px';
    const eventType = document.createElement('input');
    eventType.type = 'text';
    eventType.placeholder = 'Ereignis (z.B. interview_feedback)';
    eventType.required = true;
    eventType.maxLength = 100;
    const notes = document.createElement('textarea');
    notes.placeholder = 'Notiz';
    notes.rows = 2;
    notes.maxLength = 10000;
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Hinzufügen';
    submit.style.padding = '6px 12px';
    submit.style.background = 'var(--cockpit-accent)';
    submit.style.color = 'var(--cockpit-bg)';
    submit.style.border = 'none';
    submit.style.borderRadius = '4px';
    submit.style.cursor = 'pointer';
    form.append(eventType, notes, submit);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await addTimelineEvent(jobId, eventType.value, notes.value);
        form.reset();
        // Refresh timeline
        showDetailPanel(jobId);
      } catch (err) {
        browserLogger.error({ err }, 'Timeline add failed');
        alert('Timeline-Eintrag fehlgeschlagen');
      }
    });
    timelineSection.appendChild(form);

    for (const event of timeline) {
      const entry = document.createElement('div');
      entry.className = 'timeline-entry';
      entry.innerHTML = `
        <div class="event-type">${event.event_type}</div>
        ${event.notes ? `<div class="notes">${escapeHtml(event.notes)}</div>` : ''}
        <div class="date">${new Date(event.created_at).toLocaleString('de-DE')}</div>
      `;
      timelineSection.appendChild(entry);
    }

    content.appendChild(timelineSection);

    // Dossiers
    if (dossiers.length > 0) {
      const dossierSection = document.createElement('div');
      dossierSection.className = 'detail-section';
      const dossierTitle = document.createElement('h3');
      dossierTitle.textContent = `Dossiers (${dossiers.length})`;
      dossierSection.appendChild(dossierTitle);

      for (const d of dossiers) {
        const item = document.createElement('div');
        item.className = 'timeline-entry';
        item.innerHTML = `
          <div class="event-type">${d.kind === 'resume' ? '📄 Lebenslauf' : '✉️ Anschreiben'}</div>
          <div class="notes">${escapeHtml(d.artifact_path)}</div>
          <div class="date">${new Date(d.created_at).toLocaleString('de-DE')}</div>
        `;
        dossierSection.appendChild(item);
      }
      content.appendChild(dossierSection);
    }

    // Job metadata
    if (job.created_at) {
      const metaSection = document.createElement('div');
      metaSection.className = 'detail-section';
      metaSection.innerHTML = `<h3>Erstellt</h3><p>${new Date(job.created_at).toLocaleString('de-DE')}</p>`;
      if (job.updated_at && job.updated_at !== job.created_at) {
        metaSection.innerHTML += `<p>Aktualisiert: ${new Date(job.updated_at).toLocaleString('de-DE')}</p>`;
      }
      content.appendChild(metaSection);
    }

  } catch (err) {
    content.innerHTML = `<div class="error">Detail-Ansicht konnte nicht geladen werden.</div>`;
    browserLogger.error({ err }, 'Detail load failed');
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function refreshData(): Promise<void> {
  try {
    currentData = await fetchApplications();
    renderBoard();
    if (selectedJobId) {
      showDetailPanel(selectedJobId);
    }
  } catch (err) {
    browserLogger.error({ err }, 'Data refresh failed');
  }
}

// --- Init ---

function init(): void {
  const closeBtn = document.getElementById('close-detail');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      selectedJobId = null;
      document.getElementById('detail-panel')?.setAttribute('hidden', '');
      renderBoard();
    });
  }

  // Auto-refresh every 30 seconds
  refreshData();
  setInterval(refreshData, 30_000);
}

document.addEventListener('DOMContentLoaded', init);
