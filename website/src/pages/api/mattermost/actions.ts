import type { APIRoute } from 'astro';
import { updatePost, replyToPost, getFirstTeamId, getOrCreateCustomerChannel, postToChannel, postInteractiveMessage, openDialog } from '../../../lib/mattermost';
import { archiveBugTicket } from '../../../lib/meetings-db';
import { createUser, sendPasswordResetEmail } from '../../../lib/keycloak';
import { createCalendarEvent } from '../../../lib/caldav';
import { createTalkRoom, inviteGuestByEmail } from '../../../lib/talk';
import { scheduleReminder } from '../../../lib/reminders';
import { sendRegistrationApproved, sendRegistrationDeclined, sendEmail } from '../../../lib/email';
import { getOrCreateClient, createInvoice, SERVICES } from '../../../lib/invoiceninja';
import type { ServiceKey } from '../../../lib/invoiceninja';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const PROD_DOMAIN = process.env.PROD_DOMAIN || '';

// Mattermost sends POST requests here when interactive buttons are clicked.
// The payload includes: post_id, channel_id, context (our custom data), user_id (who clicked).
export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();
    const { post_id, channel_id, context, trigger_id } = payload;
    const action = context?.action;

    if (!action || !post_id) {
      return new Response(JSON.stringify({ error: 'Invalid action payload' }), { status: 400 });
    }

    switch (action) {
      case 'approve_registration': {
        const { email, firstName, lastName, phone, company } = context;
        const fullName = `${firstName} ${lastName}`;
        const statusParts: string[] = [];

        // 1. Create Keycloak user
        const result = await createUser({ email, firstName, lastName, phone, company });

        if (result.success && result.userId) {
          await sendPasswordResetEmail(result.userId);
          await sendRegistrationApproved(email, fullName);
          statusParts.push(':key: Keycloak-Benutzer erstellt');
          statusParts.push(':email: Passwort-Reset-E-Mail versendet');
        } else {
          await replyToPost(post_id, channel_id, `:warning: Fehler beim Anlegen von **${fullName}**: ${result.error}`);
          return new Response(JSON.stringify({ update: { message: `### :warning: Registrierung fehlgeschlagen\n\n**${fullName}** (${email})\n\n${result.error}`, props: { attachments: [] } } }));
        }

        // 2. Create InvoiceNinja client for billing
        const inClient = await getOrCreateClient({
          name: fullName,
          email,
          phone,
          company,
        });
        if (inClient) {
          statusParts.push(`:receipt: InvoiceNinja-Kunde erstellt (#${inClient.number})`);
        } else {
          statusParts.push(':information_source: InvoiceNinja-Kunde nicht erstellt (API nicht konfiguriert)');
        }

        const statusText = statusParts.map((s) => `- ${s}`).join('\n');
        await updatePost(post_id, `### :white_check_mark: Registrierung freigeschaltet\n\n**${fullName}** (${email})\n\n${statusText}`);
        await replyToPost(post_id, channel_id, `:white_check_mark: **${fullName}** freigeschaltet — SSO + Billing eingerichtet.`);

        return new Response(JSON.stringify({ update: { message: `### :white_check_mark: Registrierung freigeschaltet\n\n**${fullName}** (${email})\n\n${statusText}`, props: { attachments: [] } } }));
      }

      case 'decline_registration': {
        const { email, firstName, lastName } = context;
        const fullName = `${firstName} ${lastName}`;

        // Notify user
        await sendRegistrationDeclined(email, fullName);

        // Update Mattermost post
        await updatePost(post_id, `### :x: Registrierung abgelehnt\n\n**${fullName}** (${email}) wurde abgelehnt.\nBenachrichtigung per E-Mail versendet.`);

        return new Response(JSON.stringify({ update: { message: `### :x: Registrierung abgelehnt\n\n**${fullName}** (${email})`, props: { attachments: [] } } }));
      }

      case 'reply_contact': {
        // Admin wants to reply to a contact form submission
        // This action opens a dialog — handled by Mattermost's dialog system
        // For now, we just acknowledge
        return new Response(JSON.stringify({ ephemeral_text: 'Antwort-Funktion wird in einer zukunftigen Version verfugbar.' }));
      }

      case 'archive_contact': {
        const { senderName, senderEmail } = context;
        await updatePost(post_id, `### :file_cabinet: Archiviert\n\nAnfrage von **${senderName}** (${senderEmail}) wurde archiviert.`);
        return new Response(JSON.stringify({ update: { message: `### :file_cabinet: Archiviert\n\nAnfrage von **${senderName}** (${senderEmail})`, props: { attachments: [] } } }));
      }

      case 'approve_booking': {
        const { name: bName, email: bEmail, phone: bPhone, typeLabel, slotStart, slotEnd, slotDisplay, date: bDate, serviceKey: bServiceKey } = context;
        const meetingStart = new Date(slotStart);
        const meetingEnd = new Date(slotEnd);
        const dateFormatted = new Date(bDate + 'T00:00:00').toLocaleDateString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        });

        const statusParts: string[] = [];

        // 1. Create Nextcloud Talk room
        const room = await createTalkRoom({
          name: `${typeLabel}: ${bName}`,
          description: `${typeLabel} mit ${bName} (${bEmail}) am ${dateFormatted}, ${slotDisplay}`,
        });
        if (room) {
          statusParts.push(`:video_camera: Talk-Raum erstellt: ${room.url}`);
          await inviteGuestByEmail(room.token, bEmail);
        } else {
          statusParts.push(':warning: Talk-Raum konnte nicht erstellt werden');
        }

        // 2. Create calendar event with meeting link
        const eventCreated = await createCalendarEvent({
          summary: `${typeLabel}: ${bName}`,
          description: `Termin mit ${bName} (${bEmail})\\nTyp: ${typeLabel}${room ? `\\nMeeting: ${room.url}` : ''}`,
          start: meetingStart,
          end: meetingEnd,
          attendeeEmail: bEmail,
          attendeeName: bName,
        });
        statusParts.push(eventCreated ? ':calendar: Kalendereintrag erstellt' : ':warning: Kalendereintrag fehlgeschlagen');

        // 3. Create or get customer Mattermost channel
        const teamId = await getFirstTeamId();
        if (teamId) {
          const channel = await getOrCreateCustomerChannel(teamId, bName);
          if (channel) {
            const meetingInfo = `### :calendar: ${typeLabel}\n\n**${dateFormatted}** um **${slotDisplay}**\n\nKunde: ${bName} (${bEmail})${room ? `\n\n:video_camera: **Meeting-Link:** ${room.url}` : ''}\n\n---\n_Artefakte, Notizen und Ergebnisse dieses Termins werden hier gesammelt._`;
            await postToChannel(channel.id, meetingInfo);

            // Post finalize button (admin clicks after meeting to trigger pipeline)
            await postInteractiveMessage({
              channelId: channel.id,
              text: ':point_down: _Nach dem Meeting: Artefakte finalisieren und an Claude Code ubergeben._',
              actions: [
                { id: 'finalize_meeting', name: 'Meeting abschliessen', style: 'primary' },
              ],
              context: {
                customerName: bName,
                customerEmail: bEmail,
                meetingType: typeLabel,
                meetingDate: dateFormatted,
                customerChannelId: channel.id,
                roomToken: room?.token,
              },
            });

            statusParts.push(`:speech_balloon: Kundenkanal \`${channel.name}\`${channel.created ? ' erstellt' : ' aktualisiert'}`);
          }
        }

        // 4. Schedule reminder email 10 min before
        if (room) {
          await scheduleReminder({
            email: bEmail,
            name: bName,
            meetingStart,
            meetingUrl: room.url,
            meetingType: typeLabel,
          });
          statusParts.push(':bell: Erinnerung geplant (10 Min. vorher)');
        }

        // 5. Create invoice if a paid service was booked
        if (bServiceKey && bServiceKey in SERVICES) {
          const inClient = await getOrCreateClient({ name: bName, email: bEmail, phone: bPhone });
          if (inClient) {
            const invoice = await createInvoice({
              clientId: inClient.id,
              serviceKey: bServiceKey as ServiceKey,
              sendEmail: true,
            });
            if (invoice) {
              statusParts.push(`:receipt: Rechnung #${invoice.number} erstellt (${invoice.amount} EUR)`);
            } else {
              statusParts.push(':warning: Rechnung konnte nicht erstellt werden');
            }
          }
        }

        // 6. Send confirmation email with meeting link
        const meetingLinkText = room ? `\n\nIhr Meeting-Link:\n${room.url}\n\nSie erhalten 10 Minuten vor dem Termin eine Erinnerung mit dem Link.` : '';
        await sendEmail({
          to: bEmail,
          subject: `Termin bestätigt: ${typeLabel} am ${dateFormatted}`,
          text: `Hallo ${bName},\n\nIhr Termin wurde bestätigt!\n\n  Typ:     ${typeLabel}\n  Datum:   ${dateFormatted}\n  Uhrzeit: ${slotDisplay}${meetingLinkText}\n\nWir freuen uns auf das Gespräch.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
          html: `<p>Hallo ${bName},</p><p><strong>Ihr Termin wurde bestätigt!</strong></p><table style="border-collapse:collapse;margin:16px 0"><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Typ</td><td style="color:#e8e8f0">${typeLabel}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Datum</td><td style="color:#e8e8f0">${dateFormatted}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Uhrzeit</td><td style="color:#e8e8f0">${slotDisplay}</td></tr></table>${room ? `<p><a href="${room.url}" style="display:inline-block;background:#e8c870;color:#0f1623;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Zum Meeting beitreten</a></p><p style="color:#aabbcc;font-size:14px">Sie erhalten 10 Minuten vor dem Termin eine Erinnerung.</p>` : ''}<p>Mit freundlichen Grüßen<br>${BRAND_NAME}</p>`,
        });
        statusParts.push(':email: Bestätigungs-E-Mail versendet');

        // Update Mattermost post
        const statusText = statusParts.map((s) => `- ${s}`).join('\n');
        await updatePost(post_id, `### :white_check_mark: Termin bestätigt\n\n**${bName}** (${bEmail})\n${typeLabel} am ${dateFormatted}, ${slotDisplay}\n\n${statusText}`);
        await replyToPost(post_id, channel_id, `:white_check_mark: Termin mit **${bName}** bestätigt — alle Systeme eingerichtet.`);

        return new Response(JSON.stringify({ update: { message: `### :white_check_mark: Termin bestätigt\n\n**${bName}** — ${typeLabel} am ${dateFormatted}, ${slotDisplay}\n\n${statusText}`, props: { attachments: [] } } }));
      }

      case 'decline_booking': {
        const { name: dName, email: dEmail, typeLabel: dType, slotDisplay: dSlot, date: dDate } = context;
        const dDateFormatted = new Date(dDate + 'T00:00:00').toLocaleDateString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        });

        await sendEmail({
          to: dEmail,
          subject: `Zu Ihrer Terminanfrage bei ${BRAND_NAME}`,
          text: `Hallo ${dName},\n\nleider können wir den angefragten Termin (${dType} am ${dDateFormatted}, ${dSlot}) nicht bestätigen.\n\nBitte wählen Sie einen alternativen Termin unter https://web.${PROD_DOMAIN}/termin oder kontaktieren Sie uns direkt.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
        });

        await updatePost(post_id, `### :x: Termin abgelehnt\n\n**${dName}** (${dEmail})\n${dType} am ${dDateFormatted}, ${dSlot}\n\nAbsage per E-Mail versendet.`);

        return new Response(JSON.stringify({ update: { message: `### :x: Termin abgelehnt\n\n**${dName}** — ${dType} am ${dDateFormatted}`, props: { attachments: [] } } }));
      }

      case 'finalize_meeting': {
        const { customerName: fName, customerEmail: fEmail, meetingType: fType, meetingDate: fDate, customerChannelId, roomToken: fRoomToken } = context;

        // Call the finalize endpoint (with roomToken for recording/whiteboard fetch)
        const SITE_URL = process.env.SITE_URL || (PROD_DOMAIN ? `https://web.${PROD_DOMAIN}` : '');
        const finalizeRes = await fetch(`${SITE_URL}/api/meeting/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: fName,
            customerEmail: fEmail,
            meetingType: fType,
            meetingDate: fDate,
            channelId: customerChannelId,
            roomToken: fRoomToken,
          }),
        });

        if (finalizeRes.ok) {
          const data = await finalizeRes.json();
          const resultLines = (data.results || []).map((r: string) => `- ${r}`).join('\n');
          await updatePost(post_id, `### :white_check_mark: Meeting abgeschlossen\n\n**${fName}** — ${fType}\n\n${resultLines}`);
          return new Response(JSON.stringify({ update: { message: `### :white_check_mark: Meeting abgeschlossen\n\n**${fName}** — ${fType}\n\n${resultLines}`, props: { attachments: [] } } }));
        } else {
          await replyToPost(post_id, channel_id, ':warning: Meeting-Finalisierung fehlgeschlagen. Bitte manuell prüfen.');
          return new Response(JSON.stringify({ ephemeral_text: 'Finalisierung fehlgeschlagen.' }));
        }
      }

      case 'erledigt_bug': {
        if (!trigger_id) {
          return new Response(
            JSON.stringify({ ephemeral_text: ':warning: Kein trigger_id im Payload — Dialog kann nicht geöffnet werden.' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const state = JSON.stringify({
          postId: post_id ?? '',
          channelId: channel_id ?? '',
          ticketId: context.ticketId ?? '(kein Ticket)',
          category: context.category ?? 'fehler',
          categoryLabel: context.categoryLabel ?? 'Fehler',
          reporterEmail: context.reporterEmail ?? 'unbekannt',
          description: context.description ?? '',
          url: context.url ?? 'unbekannt',
          userAgent: context.userAgent ?? 'unbekannt',
          viewport: context.viewport ?? 'unbekannt',
          brand: context.brand ?? 'mentolder',
        });

        const siteUrl = process.env.SITE_URL || 'http://localhost:4321';

        const opened = await openDialog({
          triggerId: trigger_id,
          url: `${siteUrl}/api/mattermost/dialog-submit`,
          dialog: {
            callback_id: 'erledigt_bug',
            title: `${context.ticketId}: Als erledigt markieren`,
            introduction_text: `**Kategorie:** ${context.categoryLabel}\n**Reporter:** ${context.reporterEmail}`,
            elements: [
              {
                display_name: 'Was hast du gemacht?',
                name: 'note',
                type: 'textarea',
                max_length: 500,
                placeholder: 'Kurze Beschreibung der Lösung...',
              },
            ],
            submit_label: 'Erledigt',
            notify_on_cancel: false,
            state,
          },
        });

        if (!opened) {
          return new Response(
            JSON.stringify({ ephemeral_text: ':warning: Dialog konnte nicht geöffnet werden. Siehe Logs.' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      case 'archive_bug': {
        const ticketId = context.ticketId ?? '(kein Ticket)';
        const reporter = context.reporterEmail ?? 'unbekannt';
        await updatePost(
          post_id,
          `### :file_cabinet: ${ticketId} · Archiviert\n\nReporter: ${reporter}`
        );
        // Update ticket status in DB (best-effort)
        try {
          await archiveBugTicket(ticketId);
        } catch (err) {
          console.warn('[actions] archive DB update failed (non-fatal):', err);
        }
        return new Response(
          JSON.stringify({
            update: {
              message: `### :file_cabinet: ${ticketId} · Archiviert\n\nReporter: ${reporter}`,
              props: { attachments: [] },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(JSON.stringify({ ephemeral_text: `Unbekannte Aktion: ${action}` }));
    }
  } catch (err) {
    console.error('Mattermost action error:', err);
    return new Response(
      JSON.stringify({ ephemeral_text: 'Interner Serverfehler bei der Verarbeitung der Aktion.' }),
      { status: 200 } // Mattermost expects 200 even on errors
    );
  }
};
