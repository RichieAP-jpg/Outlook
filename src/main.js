/**
 * Main entry point - orchestrates button injection and vCard generation.
 */
(function () {
  'use strict';

  const BUTTON_ID = 'vcard-ext-btn';
  let currentExtractor = null;

  // Determine which email client we're on
  if (GmailExtractor.isGmail()) {
    currentExtractor = GmailExtractor;
  } else if (OutlookExtractor.isOutlook()) {
    currentExtractor = OutlookExtractor;
  } else {
    return;
  }

  console.log('[vCard Extension] Loaded on', location.hostname);

  // Button icon
  const ICON_URL = chrome.runtime.getURL('icons/button-icon.png');

  /**
   * Create the floating vCard button.
   */
  function createButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'vcard-btn vcard-btn--floating';

    const img = document.createElement('img');
    img.src = ICON_URL;
    img.alt = '';
    img.className = 'vcard-btn-icon';
    btn.appendChild(img);

    const span = document.createElement('span');
    span.textContent = 'Créer vCard';
    btn.appendChild(span);

    btn.title = 'Créer une fiche contact vCard depuis cet email';
    btn.addEventListener('click', handleClick);
    return btn;
  }

  /**
   * Show a preview modal with extracted info.
   */
  function showPreviewModal(contact) {
    const fields = [
      { key: 'name', label: 'Nom' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Téléphone' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'company', label: 'Société' },
      { key: 'title', label: 'Fonction' },
      { key: 'address', label: 'Adresse' },
      { key: 'website', label: 'Site web' }
    ];

    const overlay = document.createElement('div');
    overlay.className = 'vcard-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'vcard-modal';

    let fieldsHtml = '';
    for (const f of fields) {
      fieldsHtml += `
        <div class="vcard-modal-field">
          <label>${f.label}</label>
          <input type="text" data-field="${f.key}" value="${escapeAttr(contact[f.key] || '')}"/>
        </div>`;
    }

    modal.innerHTML = `
      <h3>Créer un contact vCard</h3>
      ${fieldsHtml}
      <div class="vcard-modal-actions">
        <button class="vcard-btn-cancel">Annuler</button>
        <button class="vcard-btn-download">Télécharger .vcf</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on Escape key
    const onEscape = (e) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEscape); }
    };
    document.addEventListener('keydown', onEscape);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    modal.querySelector('.vcard-btn-cancel').addEventListener('click', () => {
      overlay.remove();
    });

    modal.querySelector('.vcard-btn-download').addEventListener('click', () => {
      const edited = {};
      for (const f of fields) {
        const input = modal.querySelector(`input[data-field="${f.key}"]`);
        edited[f.key] = input ? input.value.trim() : '';
      }

      const vcard = VCardGenerator.generate(edited);
      const filename = (edited.name || 'contact').replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '_') + '.vcf';
      VCardGenerator.download(vcard, filename);

      overlay.remove();
      showToast('Contact téléchargé !');
    });

    const firstInput = modal.querySelector('input');
    if (firstInput) firstInput.focus();
  }

  /**
   * Handle vCard button click.
   */
  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();

    console.log('[vCard Extension] Button clicked');

    try {
      const { name, email } = currentExtractor.extractSenderInfo();
      const signatureHtml = currentExtractor.extractSignatureHtml();
      const contact = SignatureParser.parse(signatureHtml, name, email);

      if (!contact.email && email) contact.email = email;
      if (!contact.name && name) contact.name = name;

      console.log('[vCard Extension] Extracted:', contact);

      showPreviewModal(contact);
    } catch (err) {
      console.error('[vCard Extension]', err);
      showPreviewModal({
        name: '', email: '', phone: '', mobile: '',
        company: '', title: '', address: '', website: ''
      });
    }
  }

  /**
   * Show a toast notification.
   */
  function showToast(message) {
    let toast = document.querySelector('.vcard-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'vcard-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('vcard-toast--visible');

    setTimeout(() => {
      toast.classList.remove('vcard-toast--visible');
    }, 3000);
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Always inject the floating button immediately
  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const btn = createButton();
    document.body.appendChild(btn);
    console.log('[vCard Extension] Button injected');
  }

  if (document.body) {
    injectButton();
  } else {
    document.addEventListener('DOMContentLoaded', injectButton);
  }
})();
