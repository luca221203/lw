/* Kleine Oberflächen-Hilfen: Auswahl, Escaping, Hinweis, Dialoge, Fehlertexte. */
window.LW = window.LW || {};
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Kurzer Hinweis unten. err = true für Fehler (bleibt länger stehen). */
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = err ? 'zeigen fehler' : 'zeigen';
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.className = err ? 'fehler' : ''; }, err ? 6000 : 2600);
  }

  /* Englische Supabase-Meldungen und Netzfehler in verständliches Deutsch. */
  function fehlerText(e) {
    const m = (e && e.message) || String(e || '');
    if (/invalid login credentials|invalid_credentials|invalid email or password/i.test(m)) return 'E-Mail oder Passwort stimmt nicht. Bitte erneut eingeben oder „Passwort vergessen?“ nutzen.';
    if (/email not confirmed/i.test(m)) return 'Diese E-Mail-Adresse ist noch nicht bestätigt. Bitte den Link in der Bestätigungs-Mail öffnen.';
    if (/rate limit|too many requests|only request this after|security purposes/i.test(m)) return 'Zu viele Versuche. Bitte eine Minute warten und es dann erneut versuchen.';
    if (/should be different from the old/i.test(m)) return 'Das neue Passwort muss sich vom alten unterscheiden.';
    if (/password should be at least|password is too short|weak password/i.test(m)) return 'Das Passwort ist zu kurz. Bitte mindestens 8 Zeichen verwenden.';
    if (/unable to validate email|invalid format|email address .* is invalid/i.test(m)) return 'Diese E-Mail-Adresse ist nicht gültig. Bitte die Schreibweise prüfen.';
    if (/user not found/i.test(m)) return 'Zu dieser E-Mail-Adresse gibt es kein Konto. Bitte die Schreibweise prüfen.';
    if (/JWT|session.*(missing|expired|not found)|not authenticated|auth session/i.test(m)) return 'Deine Sitzung ist abgelaufen. Bitte melde dich neu an.';
    if (/Failed to fetch|NetworkError|Load failed|network request failed/i.test(m)) return 'Keine Verbindung. Bitte Internet prüfen und es erneut versuchen.';
    return m;
  }

  /* ---------- Dialog (ein gemeinsames <dialog>) ---------- */
  let vorherFokus = null;
  function dlg() { return $('#dlg'); }
  function openDlg(html, breit) {
    const d = dlg();
    if (!d.open && !vorherFokus) vorherFokus = document.activeElement; // gesetzt = vorheriger Dialog schließt gerade erst
    d.className = breit ? 'breit' : '';
    d.innerHTML = html;
    if (!d.open) d.showModal();
    const erstes = d.querySelector('[autofocus], input:not([type=hidden]), select, textarea, button.primary, button');
    if (erstes) erstes.focus();
    return d;
  }
  function closeDlg() {
    const d = dlg();
    if (d.open) d.close();
  }
  function aufraeumen() {
    const d = dlg();
    if (d.open) return; // schon wieder geöffnet (Folgedialog direkt nach dem Schließen): neuen Inhalt behalten
    d.innerHTML = '';
    d.oncancel = null;
    delete d.dataset.pflicht;
    const f = vorherFokus; vorherFokus = null;
    if (f && document.contains(f) && typeof f.focus === 'function') f.focus({ preventScroll: true });
  }

  /* Rückfrage. ok = Text der Bestätigen-Taste (Verb), danger = rote Taste. */
  function confirmDlg(titel, text, ok, danger) {
    return new Promise(res => {
      let antwort = false;
      const d = openDlg(`<div class="dlg"><h2>${esc(titel)}</h2><p class="sub">${text}</p>
        <div class="aktionen"><button type="button" class="btn" data-x="nein">Abbrechen</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-x="ja">${esc(ok || 'Bestätigen')}</button></div></div>`);
      d.querySelector('[data-x=nein]').focus(); // Abbrechen ist die sichere Vorgabe
      d.querySelector('[data-x=nein]').onclick = () => closeDlg();
      d.querySelector('[data-x=ja]').onclick = () => { antwort = true; closeDlg(); };
      d.addEventListener('close', () => res(antwort), { once: true });
    });
  }

  /* Führt fn aus; bei Fehler Hinweis statt Absturz. Gibt das Ergebnis zurück (undefined bei Fehler). */
  async function guard(fn, okMsg) {
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      return r;
    } catch (e) {
      console.error(e);
      toast(fehlerText(e), true);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const d = dlg();
    d.addEventListener('close', aufraeumen);
    // Klick auf den Hintergrund schließt (außer bei Pflicht-Dialogen)
    d.addEventListener('mousedown', e => { d._aussen = e.target === d; });
    d.addEventListener('click', e => { if (e.target === d && d._aussen && !d.dataset.pflicht) closeDlg(); });
  });

  window.LW.ui = { $, $$, esc, toast, fehlerText, openDlg, closeDlg, confirmDlg, guard };
})();
