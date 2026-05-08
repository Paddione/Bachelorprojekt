<!-- website/src/components/inbox/InboxDetail.svelte
     Right-hand pane. Shared header (avatar, title, meta, ↑↓ nav) +
     per-type body block + footer with actions. -->
<script lang="ts">
  import type { InboxItem, InboxType, Message } from '../../lib/messaging-db';
  import { TYPE_META, initialsOf } from './type-meta';

  interface Props {
    item: InboxItem | null;
    counts: Record<string, number>;
    busy: boolean;
    error: string | null;
    threadMessages: Message[];
    threadLoading: boolean;
    replyBody: string;
    replySending: boolean;
    bugNote: string;
    bindReplyTextarea?: (el: HTMLTextAreaElement | null) => void;
    onPrev: () => void;
    onNext: () => void;
    onPrimary: () => void;
    onSecondary: () => void;
    /** Hard-delete escape hatch — visible on every row regardless of status
     *  so admins can clear rows that already left the `pending` queue. */
    onDelete: () => void;
    onReplyChange: (v: string) => void;
    onSendReply: () => void;
    onBugNoteChange: (v: string) => void;
  }

  const {
    item, counts, busy, error,
    threadMessages, threadLoading, replyBody, replySending, bugNote,
    bindReplyTextarea,
    onPrev, onNext, onPrimary, onSecondary, onDelete,
    onReplyChange, onSendReply, onBugNoteChange,
  }: Props = $props();

  let replyEl: HTMLTextAreaElement | null = $state(null);
  $effect(() => {
    bindReplyTextarea?.(replyEl);
    return () => bindReplyTextarea?.(null);
  });

  function p<T = string>(item: InboxItem, key: string): T | undefined {
    const v = (item.payload ?? {}) as Record<string, unknown>;
    return v[key] as T | undefined;
  }

  function fmtDate(s: string | undefined | null): string {
    if (!s) return '—';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s ?? '—';
    return d.toLocaleString('de-DE', {
      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function relative(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (sec < 60) return 'gerade eben';
    const m = Math.floor(sec / 60);
    if (m < 60)   return `vor ${m} Min`;
    const h = Math.floor(m / 60);
    if (h < 24)   return `vor ${h} Std`;
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function header(it: InboxItem): { title: string; subtitle: string; email: string | null } {
    const email = (p<string>(it, 'email') ?? p<string>(it, 'reporterEmail') ?? p<string>(it, 'customerEmail')) || null;
    switch (it.type) {
      case 'registration':
        return {
          title: `${p(it, 'firstName') ?? ''} ${p(it, 'lastName') ?? ''}`.trim() || (email ?? 'Anfrage'),
          subtitle: 'Registrierungsanfrage',
          email,
        };
      case 'booking':
        return {
          title: p<string>(it, 'name') ?? 'Buchung',
          subtitle: p<string>(it, 'typeLabel') ?? 'Buchung',
          email,
        };
      case 'contact':
        return {
          title: p<string>(it, 'name') ?? (email ?? 'Kontakt'),
          subtitle: p<string>(it, 'subject') || 'Kontaktanfrage',
          email,
        };
      case 'bug':
        return {
          title: p<string>(it, 'ticketId') ?? `Bug #${it.id}`,
          subtitle: 'Bug-Report',
          email,
        };
      case 'meeting_finalize':
        return {
          title: p<string>(it, 'customerName') ?? 'Meeting',
          subtitle: p<string>(it, 'meetingType') ?? 'Meeting',
          email,
        };
      case 'user_message':
        return {
          title: p<string>(it, 'senderName') ?? 'Nutzer',
          subtitle: 'Direktnachricht',
          email,
        };
      default:
        return { title: it.type, subtitle: '', email };
    }
  }

  function avatarChars(it: InboxItem): { glyph: string; isInitials: boolean } {
    const meta = TYPE_META[it.type];
    if (meta.avatarGlyph) return { glyph: meta.avatarGlyph, isInitials: false };
    if (it.type === 'registration') {
      return { glyph: initialsOf(`${p(it, 'firstName') ?? ''} ${p(it, 'lastName') ?? ''}`), isInitials: true };
    }
    if (it.type === 'booking')      return { glyph: initialsOf(p<string>(it, 'name')), isInitials: true };
    if (it.type === 'contact')      return { glyph: initialsOf(p<string>(it, 'name')), isInitials: true };
    if (it.type === 'user_message') return { glyph: initialsOf(p<string>(it, 'senderName') ?? '?'), isInitials: true };
    return { glyph: '?', isInitials: true };
  }

  function pendingSummary(): string {
    const reg  = counts['registration']     ?? 0;
    const bk   = counts['booking']          ?? 0;
    const bug  = counts['bug']              ?? 0;
    const msg  = counts['user_message']     ?? 0;
    const meet = counts['meeting_finalize'] ?? 0;
    const ctc  = counts['contact']          ?? 0;
    const total = reg + bk + bug + msg + meet + ctc;
    if (total === 0) return 'Aktuell sind keine offenen Einträge vorhanden.';
    const parts: string[] = [];
    if (reg)  parts.push(`${reg} ${reg === 1 ? 'Anfrage' : 'Anfragen'}`);
    if (bk)   parts.push(`${bk} ${bk === 1 ? 'Buchung' : 'Buchungen'}`);
    if (bug)  parts.push(`${bug} ${bug === 1 ? 'Bug' : 'Bugs'}`);
    if (msg)  parts.push(`${msg} ${msg === 1 ? 'Nachricht' : 'Nachrichten'}`);
    if (meet) parts.push(`${meet} ${meet === 1 ? 'Meeting' : 'Meetings'}`);
    if (ctc)  parts.push(`${ctc} ${ctc === 1 ? 'Kontakt' : 'Kontakte'}`);
    return `Offen: ${parts.join(' · ')}`;
  }
</script>

<section
  class="detail"
  data-testid="inbox-detail"
  data-type={item?.type ?? 'empty'}
>
  {#if !item}
    <div class="empty" data-testid="inbox-detail-empty">
      <span class="pulse" aria-hidden="true"></span>
      <p class="empty-title">Wähle einen Eintrag aus der Liste</p>
      <p class="empty-sub">{pendingSummary()}</p>
    </div>
  {:else}
    {@const meta = TYPE_META[item.type]}
    {@const h = header(item)}
    {@const av = avatarChars(item)}
    <header class="head">
      <div
        class="avatar {av.isInitials ? 'avatar-initials' : 'avatar-glyph'}"
        style:background={meta.avatarBg}
        style:color={meta.avatarFg}
        aria-hidden="true"
      >{av.glyph}</div>

      <div class="head-text">
        <h2 class="title">{h.title}</h2>
        <div class="meta">
          <span
            class="pill"
            style:background={meta.pillBg}
            style:color={meta.pillFg}
          >{meta.label}</span>
          {#if h.email}
            <a class="meta-link" href={`mailto:${h.email}`}>{h.email}</a>
          {/if}
          <span class="meta-time">{relative(item.created_at)}</span>
          {#if item.type === 'registration' && p(item, 'company')}
            <span class="meta-extra">{p(item, 'company')}</span>
          {/if}
          {#if item.type === 'booking' && p(item, 'serviceKey')}
            <span class="meta-extra">{p(item, 'serviceKey')}</span>
          {/if}
        </div>
      </div>

      <div class="nav-buttons">
        <button
          type="button"
          class="nav-btn"
          data-testid="inbox-nav-prev"
          aria-label="Vorheriger Eintrag"
          onclick={onPrev}
        >↑</button>
        <button
          type="button"
          class="nav-btn"
          data-testid="inbox-nav-next"
          aria-label="Nächster Eintrag"
          onclick={onNext}
        >↓</button>
      </div>
    </header>

    <div class="body">
      {#if item.type === 'registration'}
        <dl class="fields">
          <div><dt>Telefon</dt><dd>{p(item, 'phone') ?? '—'}</dd></div>
          <div><dt>Firma</dt><dd>{p(item, 'company') ?? '—'}</dd></div>
          <div><dt>Quelle</dt><dd>Kontaktformular · /kontakt</dd></div>
        </dl>

      {:else if item.type === 'booking'}
        {@const slot   = (p<string>(item, 'slotDisplay') ?? '').trim()}
        {@const tlabel = (p<string>(item, 'typeLabel') ?? '').trim()}
        {@const date   = p<string>(item, 'date')}
        <dl class="fields">
          <div><dt>Termin</dt><dd>
            {tlabel || '—'}
            {#if slot} · {slot}{/if}
            {#if date} · {date}{/if}
          </dd></div>
          <div><dt>Telefon</dt><dd>{p(item, 'phone') ?? '—'}</dd></div>
          <div><dt>E-Mail</dt><dd>
            {#if h.email}<a href={`mailto:${h.email}`}>{h.email}</a>{:else}—{/if}
          </dd></div>
          <div><dt>Service</dt><dd>{p(item, 'serviceKey') ?? p(item, 'leistungKey') ?? '—'}</dd></div>
        </dl>

      {:else if item.type === 'contact'}
        <dl class="fields">
          <div><dt>E-Mail</dt><dd>
            {#if h.email}<a href={`mailto:${h.email}`}>{h.email}</a>{:else}—{/if}
          </dd></div>
          <div><dt>Telefon</dt><dd>{p(item, 'phone') ?? '—'}</dd></div>
          <div><dt>Betreff</dt><dd>{p(item, 'subject') ?? '—'}</dd></div>
        </dl>
        <div class="body-block">{p(item, 'message') ?? ''}</div>

      {:else if item.type === 'bug'}
        <dl class="fields">
          <div><dt>Pfad</dt><dd class="mono">{p(item, 'path') ?? '—'}</dd></div>
          <div><dt>Browser</dt><dd class="mono small">{p(item, 'userAgent') ?? '—'}</dd></div>
          <div><dt>Reporter</dt><dd>
            {p(item, 'reporterName') ?? '—'}
            {#if p(item, 'reporterEmail')}
              · <a href={`mailto:${p(item, 'reporterEmail')}`}>{p(item, 'reporterEmail')}</a>
            {/if}
          </dd></div>
          {#if p(item, 'brand')}<div><dt>Brand</dt><dd>{p(item, 'brand')}</dd></div>{/if}
        </dl>
        <div class="body-block">{p(item, 'description') ?? ''}</div>

        <div class="bug-note">
          <label class="bug-note-label" for={`inbox-bug-note-${item.id}`}>
            Auflösungs-Notiz <span class="bug-note-counter">{bugNote.length}/500</span>
          </label>
          <textarea
            id={`inbox-bug-note-${item.id}`}
            class="bug-note-input"
            data-testid="inbox-detail-bug-note"
            rows="3"
            maxlength="500"
            placeholder="Was wurde gemacht? (max. 500 Zeichen)"
            value={bugNote}
            oninput={(e) => onBugNoteChange(e.currentTarget.value)}
          ></textarea>
        </div>

      {:else if item.type === 'meeting_finalize'}
        {@const customerEmail = p<string>(item, 'customerEmail')}
        {@const roomToken     = p<string>(item, 'roomToken')}
        {@const projectId     = p<string>(item, 'projectId')}
        <dl class="fields">
          <div><dt>Kunde</dt><dd>
            {p(item, 'customerName') ?? '—'}
            {#if customerEmail}
              · <a href={`/admin/clients?email=${encodeURIComponent(customerEmail)}`}>{customerEmail}</a>
            {/if}
          </dd></div>
          <div><dt>Termin-Typ</dt><dd>{p(item, 'meetingType') ?? '—'}</dd></div>
          <div><dt>Datum</dt><dd>{fmtDate(p<string>(item, 'meetingDate'))}</dd></div>
          {#if roomToken}
            <div><dt>Talk-Raum</dt><dd>
              <a href={`/portal/talk?token=${encodeURIComponent(roomToken)}`} target="_blank" rel="noopener">Raum öffnen ↗</a>
            </dd></div>
          {/if}
          {#if projectId}
            <div><dt>Projekt</dt><dd>
              <a href={`/admin/projekte/${encodeURIComponent(projectId)}`}>Projekt öffnen ↗</a>
            </dd></div>
          {/if}
        </dl>

      {:else if item.type === 'user_message'}
        <div class="thread-wrap" data-testid="inbox-thread">
          {#if threadLoading}
            <p class="thread-loading">Lade Konversation…</p>
          {:else if threadMessages.length === 0}
            <p class="thread-loading">Noch keine Nachrichten in diesem Thread.</p>
          {:else}
            <ol class="thread">
              {#each threadMessages as msg (msg.id)}
                {@const isAdmin = msg.sender_role === 'admin'}
                <li
                  class="bubble {isAdmin ? 'bubble-admin' : 'bubble-user'}"
                  data-testid="inbox-thread-msg"
                  data-role={isAdmin ? 'admin' : 'user'}
                >
                  <div class="bubble-meta">
                    <span class="bubble-who">{isAdmin ? 'Admin' : 'Nutzer'}</span>
                    <span class="bubble-time">{relative(msg.created_at)}</span>
                  </div>
                  <p class="bubble-body">{msg.body}</p>
                </li>
              {/each}
            </ol>
          {/if}
        </div>

        <div class="reply-row">
          <textarea
            bind:this={replyEl}
            class="reply"
            data-testid="inbox-reply"
            rows="3"
            placeholder="Antwort an den Kunden…"
            value={replyBody}
            disabled={replySending}
            oninput={(e) => onReplyChange(e.currentTarget.value)}
          ></textarea>
          <button
            type="button"
            class="btn btn-primary"
            data-testid="inbox-reply-send"
            disabled={replySending || !replyBody.trim()}
            onclick={onSendReply}
          >
            {replySending ? '…' : 'Senden'}
            <span class="ksk">⌘⏎</span>
          </button>
        </div>
      {/if}
    </div>

    {#if error}<p class="error">{error}</p>{/if}

    <footer class="foot">
      {#if item.type === 'registration'}
        <button type="button" class="btn btn-ok" data-testid="inbox-action-primary"
                disabled={busy} onclick={onPrimary}>
          ✓ Freischalten <span class="ksk">A</span>
        </button>
        <button type="button" class="btn btn-no" data-testid="inbox-action-secondary"
                disabled={busy} onclick={onSecondary}>
          ✗ Ablehnen <span class="ksk">D</span>
        </button>
        <span class="spacer"></span>

      {:else if item.type === 'booking'}
        <button type="button" class="btn btn-ok" data-testid="inbox-action-primary"
                disabled={busy} onclick={onPrimary}>
          ✓ Bestätigen <span class="ksk">A</span>
        </button>
        <button type="button" class="btn btn-no" data-testid="inbox-action-secondary"
                disabled={busy} onclick={onSecondary}>
          ✗ Ablehnen <span class="ksk">D</span>
        </button>
        <span class="spacer"></span>

      {:else if item.type === 'contact'}
        <button type="button" class="btn btn-no" data-testid="inbox-action-primary"
                disabled={busy} onclick={onPrimary}>
          Archivieren <span class="ksk">E</span>
        </button>
        <span class="spacer"></span>
        {#if h.email}
          <a class="btn btn-ghost" href={`mailto:${h.email}?subject=${encodeURIComponent(`Re: ${p(item, 'subject') ?? 'Ihre Anfrage'}`)}`}>
            Antworten per Mail ↗
          </a>
        {/if}

      {:else if item.type === 'bug'}
        <button type="button" class="btn btn-ok" data-testid="inbox-action-primary"
                disabled={busy || !bugNote.trim()} onclick={onPrimary}>
          ✓ Erledigt <span class="ksk">⏎</span>
        </button>
        <span class="spacer"></span>
        {#if p(item, 'ticketId')}
          <a class="btn btn-ghost" href={`/admin/bugs?ticket=${encodeURIComponent(p<string>(item, 'ticketId') ?? '')}`}>
            Im Ticket öffnen ↗
          </a>
        {/if}

      {:else if item.type === 'meeting_finalize'}
        <button type="button" class="btn btn-ok" data-testid="inbox-action-primary"
                disabled={busy} onclick={onPrimary}>
          ▶ Finalisieren <span class="ksk">⏎</span>
        </button>
        <span class="spacer"></span>
        {#if p(item, 'roomToken')}
          <a class="btn btn-ghost" href={`/portal/talk?token=${encodeURIComponent(p<string>(item, 'roomToken') ?? '')}`} target="_blank" rel="noopener">
            Im Termin öffnen ↗
          </a>
        {/if}

      {:else if item.type === 'user_message'}
        <button type="button" class="btn btn-ok" data-testid="inbox-action-primary"
                disabled={busy} onclick={onPrimary}>
          ✓ Erledigt <span class="ksk">E</span>
        </button>
        <span class="spacer"></span>
        {#if h.email}
          <a class="btn btn-ghost" href={`/admin/clients?email=${encodeURIComponent(h.email)}`}>
            Profil anzeigen ↗
          </a>
        {/if}
      {/if}

      <!-- Universal hard-delete escape hatch. Visible on every row regardless
           of status so admins can clear rows stuck in `actioned`/`archived`
           that have no other path to deletion. Confirms via the parent's
           window.confirm() before firing. -->
      <button
        type="button"
        class="btn btn-danger"
        data-testid="inbox-action-delete"
        disabled={busy}
        onclick={onDelete}
        title="Diesen Eintrag dauerhaft löschen"
      >
        🗑 Löschen
      </button>
    </footer>
  {/if}
</section>

<style>
  .detail {
    flex: 1;
    min-width: 0;
    background: var(--ink-900);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  /* Empty state */
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: var(--mute);
    text-align: center;
    padding: 24px;
  }
  .pulse {
    width: 12px; height: 12px;
    border-radius: 50%;
    background: var(--brass);
    box-shadow: 0 0 0 0 oklch(0.80 0.09 75 / 0.4);
    animation: pulse 1.6s ease-out infinite;
  }
  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 oklch(0.80 0.09 75 / 0.45); }
    70%  { box-shadow: 0 0 0 12px oklch(0.80 0.09 75 / 0); }
    100% { box-shadow: 0 0 0 0 oklch(0.80 0.09 75 / 0); }
  }
  .empty-title {
    font: 500 15px var(--font-serif);
    color: var(--fg);
    margin: 0;
  }
  .empty-sub {
    font: 400 12px var(--font-sans);
    color: var(--mute);
    margin: 0;
    max-width: 380px;
  }

  /* Header */
  .head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 18px 22px 14px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font: 600 13px var(--font-sans);
  }
  .avatar-glyph { font-size: 18px; }
  .head-text { flex: 1; min-width: 0; }
  .title {
    margin: 0 0 4px;
    font: 500 19px var(--font-serif);
    color: var(--fg);
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font: 400 11px var(--font-sans);
    color: var(--mute);
  }
  .pill {
    font: 600 10px var(--font-mono);
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .meta-link {
    color: var(--fg-soft);
    text-decoration: none;
    border-bottom: 1px dashed var(--line-2);
  }
  .meta-link:hover { color: var(--brass); border-bottom-color: var(--brass); }
  .meta-time { font-family: var(--font-mono); font-size: 10.5px; }
  .meta-extra { color: var(--fg-soft); }

  .nav-buttons {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .nav-btn {
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid var(--line-2);
    border-radius: 6px;
    color: var(--mute);
    font: 600 13px var(--font-mono);
    cursor: pointer;
    transition: color 0.1s ease, border-color 0.1s ease;
  }
  .nav-btn:hover { color: var(--brass); border-color: var(--brass); }

  /* Body */
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 18px 22px 16px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .fields {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 8px 14px;
    margin: 0;
  }
  .fields > div {
    display: contents;
  }
  .fields dt {
    font: 500 11px var(--font-mono);
    color: var(--mute-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
    padding-top: 1px;
  }
  .fields dd {
    margin: 0;
    color: var(--fg);
    font: 400 13px var(--font-sans);
    word-break: break-word;
  }
  .fields dd a { color: var(--brass); text-decoration: none; }
  .fields dd a:hover { text-decoration: underline; }
  .fields dd.mono { font-family: var(--font-mono); font-size: 12px; color: var(--fg-soft); }
  .fields dd.mono.small { font-size: 11px; color: var(--mute); }

  .body-block {
    background: var(--ink-850);
    border-left: 3px solid var(--brass);
    border-radius: 6px;
    padding: 10px 14px;
    color: var(--fg-soft);
    font: 400 13px var(--font-sans);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.55;
  }

  /* Bug note */
  .bug-note {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bug-note-label {
    font: 500 11px var(--font-mono);
    color: var(--mute-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .bug-note-counter {
    font: 400 10px var(--font-mono);
    color: var(--mute-2);
    text-transform: none;
    letter-spacing: 0;
  }
  .bug-note-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--fg);
    font: 400 13px var(--font-sans);
    padding: 8px 10px;
    resize: vertical;
    min-height: 60px;
    outline: none;
  }
  .bug-note-input:focus { border-color: var(--brass); }

  /* Thread + reply */
  .thread-wrap {
    background: var(--ink-850);
    border-radius: 8px;
    padding: 12px;
    min-height: 80px;
  }
  .thread-loading {
    color: var(--mute);
    font: 400 12px var(--font-sans);
    text-align: center;
    margin: 12px 0;
  }
  .thread {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .bubble {
    max-width: 78%;
    padding: 8px 12px;
    border-radius: 10px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
  }
  .bubble-user {
    align-self: flex-start;
    background: var(--ink-800);
    color: var(--fg);
  }
  .bubble-admin {
    align-self: flex-end;
    background: oklch(0.80 0.09 75 / 0.14);
    color: var(--fg);
  }
  .bubble-meta {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font: 600 9.5px var(--font-mono);
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 3px;
  }
  .bubble-body {
    margin: 0;
    font: 400 13px var(--font-sans);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .reply-row {
    display: flex;
    gap: 10px;
    align-items: stretch;
  }
  .reply {
    flex: 1;
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--fg);
    font: 400 13px var(--font-sans);
    padding: 8px 10px;
    resize: vertical;
    min-height: 64px;
    outline: none;
  }
  .reply:focus { border-color: var(--brass); }

  /* Footer + buttons */
  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 22px 16px;
    border-top: 1px solid var(--line);
    background: var(--ink-900);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .spacer { flex: 1; }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-radius: 7px;
    font: 600 12px var(--font-sans);
    cursor: pointer;
    border: 1px solid transparent;
    text-decoration: none;
    transition: opacity 0.1s ease;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ok {
    background: oklch(0.80 0.06 160);
    color: var(--ink-900);
  }
  .btn-no {
    background: rgba(255, 255, 255, 0.06);
    color: var(--fg);
    border-color: var(--line-2);
  }
  .btn-no:hover:not(:disabled) { background: rgba(255, 255, 255, 0.10); }

  .btn-primary {
    background: var(--brass);
    color: var(--ink-900);
    align-self: flex-end;
  }

  .btn-ghost {
    background: transparent;
    color: var(--mute);
    padding: 7px 10px;
  }
  .btn-ghost:hover { color: var(--brass); }

  /* Hard-delete escape hatch — muted red so it's clearly destructive but
     not visually competing with the per-type primary action. */
  .btn-danger {
    background: transparent;
    color: oklch(0.75 0.13 25);
    border: 1px solid oklch(0.55 0.12 25 / 0.5);
  }
  .btn-danger:hover:not(:disabled) {
    background: oklch(0.55 0.13 25 / 0.16);
    color: oklch(0.85 0.13 25);
    border-color: oklch(0.65 0.13 25);
  }

  .ksk {
    font: 600 9.5px var(--font-mono);
    opacity: 0.65;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.2);
  }

  .error {
    color: oklch(0.85 0.1 25);
    font: 500 12px var(--font-sans);
    padding: 0 22px;
    margin: 0;
  }

  /* Mobile detail tweaks */
  @media (max-width: 767px) {
    .head { padding: 14px; gap: 10px; }
    .body { padding: 14px; }
    .foot { padding: 10px 14px 12px; gap: 8px; }
    .fields { grid-template-columns: 1fr; gap: 2px 0; }
    .fields > div { display: block; padding-bottom: 8px; }
    .reply-row { flex-direction: column; }
    .btn-primary { align-self: stretch; justify-content: center; }
    .nav-btn { width: 30px; height: 30px; }
  }
</style>
