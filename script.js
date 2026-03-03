/* ═══════════════════════════════════════
   LCL — VIREMENT EXPRESS — script.js
   ═══════════════════════════════════════ */

/* ─── CONFIG EMAILJS ───────────────────
   1. Créez un compte sur emailjs.com
   2. Créez un Service (Gmail)
   3. Créez 2 templates :
      - Template virement reçu  → EJ_TPL_VIREMENT
      - Template virement bloqué → EJ_TPL_BLOCAGE
   4. Remplacez les valeurs ci-dessous
─────────────────────────────────────── */
const EJ_PUBLIC_KEY   = 'WdAj7hc_pjO1ypT1v';
const EJ_SERVICE_ID   = 'service_7q7dpkc';
const EJ_TPL_VIREMENT = 'template_r2tvcru';
const EJ_TPL_BLOCAGE  = 'template_m3xbkc4';

/* ─── ÉTAT DE L'APPLICATION ─── */
let virements = [];       // liste de tous les virements
let virementActif = null; // virement sélectionné dans le modal détail

/* ─── INITIALISATION ─── */
document.addEventListener('DOMContentLoaded', () => {
  // Init EmailJS si configuré
  if (EJ_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
    emailjs.init(EJ_PUBLIC_KEY);
  }

  // Écouter le formulaire virement
  document.getElementById('virement-form')
    .addEventListener('submit', soumettreVirement);

  // Écouter le formulaire annulation/blocage
  document.getElementById('annulation-form')
    .addEventListener('submit', soumettreBlockage);

  // Injecter le modal détail dans le DOM
  creerModalDetail();

  // Fermer modals en cliquant sur l'overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });
});

/* ══════════════════════════════════════
   MODALS — OUVRIR / FERMER
══════════════════════════════════════ */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* ══════════════════════════════════════
   SOUMETTRE UN VIREMENT
══════════════════════════════════════ */
async function soumettreVirement(e) {
  e.preventDefault();

  const nomEmetteur  = document.getElementById('nom-emetteur').value.trim();
  const nomProprietaire = document.getElementById('nom-proprio').value.trim();
  const emailDest    = document.getElementById('email-dest').value.trim();
  const ibanDest     = document.getElementById('iban-dest').value.trim();
  const montant      = parseFloat(document.getElementById('montant-virement').value);

  // Validations
  if (!nomEmetteur || !nomProprietaire || !emailDest || !ibanDest || isNaN(montant) || montant <= 0) {
    showToast('⚠️ Veuillez remplir tous les champs.', 'error');
    return;
  }

  // Générer une référence unique
  const ref = 'LCL-' + Date.now().toString().slice(-9);
  const dateNow = new Date().toLocaleString('fr-FR');

  const virement = {
    ref,
    nomEmetteur,
    nomProprietaire,
    emailDest,
    ibanDest,
    montant,
    date: dateNow,
    statut: 'envoyé',
    montantBlockage: null
  };

  // Afficher spinner
  showSpinner(true);

  // Envoyer email au destinataire
  await envoyerEmailVirement(virement);

  // Sauvegarder
  virements.unshift(virement);
  renderHistorique();

  // Fermer modal + reset form
  closeModal('virement-modal');
  document.getElementById('virement-form').reset();

  showSpinner(false);
  showToast('✅ Virement envoyé ! Email transmis au destinataire.', 'success');
}

/* ══════════════════════════════════════
   SOUMETTRE UN BLOCAGE
══════════════════════════════════════ */
async function soumettreBlockage(e) {
  e.preventDefault();

  if (!virementActif) return;

  const montantBlockage = parseFloat(document.getElementById('montant-deblocage').value);

  if (isNaN(montantBlockage) || montantBlockage <= 0) {
    showToast('⚠️ Saisissez un montant valide.', 'error');
    return;
  }

  showSpinner(true);

  // Mettre à jour le virement
  virementActif.statut = 'bloqué';
  virementActif.montantBlockage = montantBlockage;

  // Envoyer email de blocage
  await envoyerEmailBlockage(virementActif);

  // Rafraîchir l'affichage
  renderHistorique();

  // Fermer les modals
  closeModal('annulation-modal');
  closeModal('detail-modal');
  document.getElementById('annulation-form').reset();

  virementActif = null;

  showSpinner(false);
  showToast('🔒 Virement bloqué ! Email envoyé au destinataire.', 'info');
}

/* ══════════════════════════════════════
   AFFICHER L'HISTORIQUE
══════════════════════════════════════ */
function renderHistorique() {
  const liste = document.getElementById('transaction-list');

  if (virements.length === 0) {
    liste.innerHTML = '<div class="empty-state">Aucun virement récent</div>';
    return;
  }

  liste.innerHTML = virements.map(v => `
    <div class="transaction-item" onclick="ouvrirDetail('${v.ref}')">
      <div class="t-icon ${v.statut === 'bloqué' ? 'blocked' : 'sent'}">
        <i class="fas ${v.statut === 'bloqué' ? 'fa-lock' : 'fa-paper-plane'}"></i>
      </div>
      <div class="t-info">
        <div class="t-name">${escapeHtml(v.nomProprietaire)}</div>
        <div class="t-ref">${v.ref} · ${v.date.split(' ')[0]}</div>
      </div>
      <div class="t-right">
        <div class="t-amount ${v.statut === 'bloqué' ? 'blocked-amt' : ''}">
          ${formaterMontant(v.montant)}
        </div>
        <span class="t-badge ${v.statut === 'bloqué' ? 'badge-blocked' : 'badge-sent'}">
          ${v.statut === 'bloqué' ? '🔒 BLOQUÉ' : '✓ ENVOYÉ'}
        </span>
      </div>
    </div>
  `).join('');
}

/* ══════════════════════════════════════
   MODAL DÉTAIL D'UN VIREMENT
══════════════════════════════════════ */
function creerModalDetail() {
  const div = document.createElement('div');
  div.id = 'detail-modal';
  div.className = 'modal-overlay';
  div.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <h3>Détails du virement</h3>
        <button onclick="closeModal('detail-modal')">&times;</button>
      </div>
      <div id="detail-content"></div>
    </div>
  `;
  div.addEventListener('click', (e) => {
    if (e.target === div) closeModal('detail-modal');
  });
  document.body.appendChild(div);
}

function ouvrirDetail(ref) {
  virementActif = virements.find(v => v.ref === ref);
  if (!virementActif) return;

  const v = virementActif;
  const estBloque = v.statut === 'bloqué';

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-ref">Réf. ${v.ref}</div>
    <div class="detail-row">
      <span class="dl">Émetteur</span>
      <span class="dv">${escapeHtml(v.nomEmetteur)}</span>
    </div>
    <div class="detail-row">
      <span class="dl">Bénéficiaire</span>
      <span class="dv">${escapeHtml(v.nomProprietaire)}</span>
    </div>
    <div class="detail-row">
      <span class="dl">Email</span>
      <span class="dv">${escapeHtml(v.emailDest)}</span>
    </div>
    <div class="detail-row">
      <span class="dl">IBAN</span>
      <span class="dv">${escapeHtml(v.ibanDest)}</span>
    </div>
    <div class="detail-row">
      <span class="dl">Montant</span>
      <span class="dv big-amount">${formaterMontant(v.montant)}</span>
    </div>
    <div class="detail-row">
      <span class="dl">Date</span>
      <span class="dv">${v.date}</span>
    </div>
    <div class="detail-row">
      <span class="dl">Statut</span>
      <span class="dv ${estBloque ? 'red' : ''}">${estBloque ? '🔒 Bloqué' : '✓ Envoyé'}</span>
    </div>
    ${estBloque && v.montantBlockage ? `
    <div class="detail-row">
      <span class="dl">Frais de déblocage</span>
      <span class="dv red">${formaterMontant(v.montantBlockage)}</span>
    </div>` : ''}
    <button
      class="btn-block-virement ${estBloque ? 'already-blocked' : ''}"
      onclick="${estBloque ? '' : 'ouvrirBlockage()'}"
      ${estBloque ? 'disabled' : ''}
    >
      <i class="fas fa-lock"></i>
      ${estBloque ? 'VIREMENT DÉJÀ BLOQUÉ' : 'BLOQUER CE VIREMENT'}
    </button>
  `;

  openModal('detail-modal');
}

function ouvrirBlockage() {
  closeModal('detail-modal');
  openModal('annulation-modal');
}

/* ══════════════════════════════════════
   ENVOI EMAILS VIA EMAILJS
══════════════════════════════════════ */
async function envoyerEmailVirement(v) {
  try {
    // Les noms des variables correspondent EXACTEMENT aux {{variables}} du template
    await emailjs.send(EJ_SERVICE_ID, EJ_TPL_VIREMENT, {
      to_email: v.emailDest,           // adresse email du destinataire
      nom:      v.nomProprietaire,     // {{nom}}
      emetteur: v.nomEmetteur,         // {{emetteur}}
      montant:  v.montant.toFixed(2),  // {{montant}}
      iban:     v.ibanDest,            // {{iban}}
      date:     v.date                 // {{date}}
    });
    console.log('Email virement envoye a', v.emailDest);
  } catch (err) {
    console.error('Erreur EmailJS (virement) :', err);
    showToast('Email non envoye. Verifiez EmailJS.', 'error');
  }
}

async function envoyerEmailBlockage(v) {
  try {
    // Les noms des variables correspondent EXACTEMENT aux {{variables}} du template
    await emailjs.send(EJ_SERVICE_ID, EJ_TPL_BLOCAGE, {
      to_email:          v.emailDest,                  // adresse email du destinataire
      nom:               v.nomProprietaire,            // {{nom}}
      emetteur:          v.nomEmetteur,                // {{emetteur}}
      montant:           v.montant.toFixed(2),         // {{montant}}
      montant_deblocage: v.montantBlockage.toFixed(2), // {{montant_deblocage}}
      date:              v.date                        // {{date}}
    });
    console.log('Email blocage envoye a', v.emailDest);
  } catch (err) {
    console.error('Erreur EmailJS (blocage) :', err);
    showToast('Email non envoye. Verifiez EmailJS.', 'error');
  }
}

/* ══════════════════════════════════════
   UTILITAIRES
══════════════════════════════════════ */

// Formater un montant en euros
function formaterMontant(n) {
  return Number(n).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' €';
}

// Éviter les injections XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// Toast notification
function showToast(msg, type = 'success') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// Spinner de chargement
function showSpinner(visible) {
  let sp = document.getElementById('app-spinner');
  if (!sp) {
    sp = document.createElement('div');
    sp.id = 'app-spinner';
    sp.className = 'spinner-overlay';
    sp.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(sp);
  }
  sp.classList.toggle('show', visible);
}
