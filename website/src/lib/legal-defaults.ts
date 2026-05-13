/**
 * Zentrale Standardtexte für die rechtlichen Seiten.
 * Werden sowohl in den öffentlichen Seiten als auch im Admin als Vorschau verwendet.
 * Änderungen hier wirken auf beide Stellen gleichzeitig.
 */
import { config } from '../config/index';

function c() {
  return config.contact;
}
function l() {
  return config.legal;
}

export function getDefaultDatenschutz(): string {
  const contact = c(); const legal = l();
  return `<h1>Datenschutzerklärung</h1>
<h2>1. Verantwortlicher</h2>
<p>Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
<p><strong>${contact.name}</strong><br>${legal.tagline}<br>${contact.city}<br>E-Mail: <a href="mailto:${contact.email}">${contact.email}</a>${contact.phone ? `<br>Telefon: ${contact.phone}` : ''}</p>
<h2>2. Grundsätze der Datenverarbeitung</h2>
<p>Wir verarbeiten personenbezogene Daten nur, soweit dies zur Bereitstellung unserer Dienste erforderlich ist. Alle Daten verbleiben vollständig auf eigener Infrastruktur (On-Premises). Es findet keine Übermittlung an Cloud-Anbieter oder Dritte statt.</p>
<p>Rechtsgrundlagen der Verarbeitung: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung und vorvertragliche Maßnahmen), Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Verpflichtung), Art. 6 Abs. 1 lit. f DSGVO (berechtigte Interessen).</p>
<h2>3. Datenerfassung auf dieser Website</h2>
<h3>Server-Log-Dateien</h3>
<p>Beim Aufruf dieser Website werden automatisch technische Zugriffsdaten erfasst: IP-Adresse, Browsertyp, Betriebssystem, Referrer-URL, aufgerufene Seite, Zeitpunkt des Zugriffs. Diese Daten werden nach 7 Tagen automatisch gelöscht.</p>
<p>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren Betrieb der Website).</p>
<h3>Cookies</h3>
<p>Diese Website verwendet ausschließlich technisch notwendige Cookies. Es werden keine Tracking-, Analyse- oder Werbe-Cookies eingesetzt. Technisch notwendige Cookies erfordern keine Einwilligung (§ 25 Abs. 2 TTDSG).</p>
<h3>Kontaktformular und Terminbuchung</h3>
<p>Wenn Sie das Kontaktformular nutzen oder einen Termin buchen, werden Ihr Name, Ihre E-Mail-Adresse sowie der Nachrichteninhalt verarbeitet. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Speicherdauer Kontaktdaten: 3 Jahre.</p>
<h3>Hosting</h3>
<p>Diese Website wird auf Servern der <strong>Hetzner Online GmbH</strong> (Deutschland) betrieben. Alle Daten verbleiben innerhalb der Europäischen Union. Es werden keine Dienste von Google, Meta, Zoom oder sonstigen US-Anbietern eingesetzt.</p>
<h2>4. Ihre Rechte als betroffene Person</h2>
<p>Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenportabilität (Art. 20), Widerspruch (Art. 21), Widerruf (Art. 7 Abs. 3 DSGVO).</p>
<p>Zur Ausübung Ihrer Rechte: <a href="mailto:${contact.email}">${contact.email}</a> oder <a href="/meine-daten">Datenverwaltungsseite</a>.</p>
<h2>5. Keine automatisierten Entscheidungen</h2>
<p>Es finden keine automatisierten Entscheidungen im Sinne von Art. 22 DSGVO statt. Es wird kein Profiling betrieben.</p>
<h2>6. Beschwerderecht</h2>
<p>Sie haben das Recht, sich bei der zuständigen Datenschutz-Aufsichtsbehörde zu beschweren: <a href="https://www.bfdi.bund.de" target="_blank" rel="noopener">www.bfdi.bund.de</a></p>
<h2>7. Aktualität</h2>
<p>Stand: April 2026.</p>`;
}

export function getDefaultAgb(): string {
  const contact = c(); const legal = l();
  return `<h1>Allgemeine Geschäftsbedingungen</h1>
<h2>1. Geltungsbereich</h2>
<p>Diese Allgemeinen Geschäftsbedingungen gelten für alle Leistungen von <strong>${contact.name}</strong>, ${legal.tagline}, ${contact.city}.</p>
<h2>2. Vertragsschluss</h2>
<p>Ein Vertrag kommt durch schriftliche Bestätigung (E-Mail) zustande. Angebote sind freibleibend.</p>
<h2>3. Leistungserbringung</h2>
<p>Die Leistungen werden nach bestem Wissen und Gewissen erbracht. Coaching und Beratung ersetzen keine medizinische, rechtliche oder steuerliche Beratung.</p>
<h2>4. Preise und Zahlung</h2>
<p>Alle Preise sind Nettopreise gemäß § 19 UStG (Kleinunternehmerregelung). Zahlungen sind innerhalb von 14 Tagen nach Rechnungsstellung fällig.</p>
<h2>5. Stornierung</h2>
<p>Stornierungen bis 48 Stunden vor dem Termin sind kostenfrei. Bei späterer Stornierung wird die vereinbarte Vergütung fällig.</p>
<h2>6. Haftung</h2>
<p>Die Haftung ist auf Vorsatz und grobe Fahrlässigkeit beschränkt. Eine Haftung für mittelbare Schäden ist ausgeschlossen.</p>
<h2>7. Datenschutz</h2>
<p>Es gilt die <a href="/datenschutz">Datenschutzerklärung</a>.</p>
<h2>8. Gerichtsstand</h2>
<p>Es gilt deutsches Recht. Gerichtsstand ist ${contact.city}.</p>
<p><small>Stand: April 2026</small></p>`;
}

export function getDefaultBarrierefreiheit(): string {
  const contact = c(); const legal = l();
  return `<h1>Erklärung zur Barrierefreiheit</h1>
<h2>Stand der Vereinbarkeit mit den Anforderungen</h2>
<p><strong>${contact.name}</strong> (${legal.tagline}) ist bemüht, seine Website im Einklang mit den nationalen Rechtsvorschriften zur Umsetzung der Richtlinie (EU) 2016/2102 des Europäischen Parlaments und des Rates barrierefrei zugänglich zu machen.</p>
<p>Diese Erklärung zur Barrierefreiheit gilt für <strong>mentolder.de</strong>.</p>
<h2>Nicht barrierefreie Inhalte</h2>
<p>Die folgenden Inhalte sind nicht barrierefrei: Einige ältere PDF-Dokumente erfüllen möglicherweise nicht alle Anforderungen der WCAG 2.1.</p>
<h2>Erstellung dieser Erklärung</h2>
<p>Diese Erklärung wurde am 1. April 2026 erstellt.</p>
<h2>Feedback und Kontakt</h2>
<p>Wenn Sie Mängel in Bezug auf die Einhaltung der Barrierefreiheitsanforderungen feststellen, wenden Sie sich bitte an: <a href="mailto:${contact.email}">${contact.email}</a></p>
<h2>Durchsetzungsverfahren</h2>
<p>Wenn Sie auf Ihre Mitteilung keine zufriedenstellende Antwort erhalten haben, können Sie die Durchsetzungsstelle einschalten: <a href="https://www.schlichtungsstelle-bgg.de" target="_blank" rel="noopener">Schlichtungsstelle BGG</a></p>`;
}

export function getDefaultImpressumZusatz(): string {
  return '';
}
