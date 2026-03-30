/**
 * Main entry point - orchestrates button injection and vCard generation.
 */
(function () {
  'use strict';

  const BUTTON_ID = 'vcard-ext-btn';
  let currentExtractor = null;
  let debounceTimer = null;

  // Determine which email client we're on
  if (GmailExtractor.isGmail()) {
    currentExtractor = GmailExtractor;
  } else if (OutlookExtractor.isOutlook()) {
    currentExtractor = OutlookExtractor;
  } else {
    return; // Not a supported email client
  }

  // Button icon - uses custom image from icons/button-icon.png
  const ICON_URL = chrome.runtime.getURL('icons/button-icon.png');
  const BUTTON_ICON_HTML = `<img src="${ICON_URL}" alt="vCard" class="vcard-btn-icon"/>`;

  /**
   * Create the vCard button element.
   */
  function createButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'vcard-btn';
    btn.innerHTML = `${BUTTON_ICON_HTML} <span>vCard</span>`;
    btn.title = 'Create a vCard contact from this email';
    btn.addEventListener('click', handleClick);
    return btn;
  }

  /**
   * Show a preview modal with extracted info, allowing edits before download.
   */
  function showPreviewModal(contact) {
    const fields = [
      { key: 'name', label: 'Nom / Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Téléphone / Phone' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'company', label: 'Société / Company' },
      { key: 'title', label: 'Fonction / Title' },
      { key: 'address', label: 'Adresse / Address' },
      { key: 'website', label: 'Site web / Website' }
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
      <h3>${BUTTON_ICON_HTML} Créer un contact vCard</h3>
      ${fieldsHtml}
      <div class="vcard-modal-actions">
        <button class="vcard-btn-cancel">Annuler</button>
        <button class="vcard-btn-download">Télécharger .vcf</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Cancel button
    modal.querySelector('.vcard-btn-cancel').addEventListener('click', () => {
      overlay.remove();
    });

    // Download button
    modal.querySelector('.vcard-btn-download').addEventListener('click', () => {
      const edited = {};
      for (const f of fields) {
        const input = modal.querySelector(`input[data-field="${f.key}"]`);
        edited[f.key] = input ? input.value.trim() : '';
      }

      const vcard = VCardGenerator.generate(edited);
      const filename = (edited.name || 'contact').replace(/[^a-zA-Z0-9À-ÿ ]/g, '_') + '.vcf';
      VCardGenerator.download(vcard, filename);

      overlay.remove();
      showToast('Contact téléchargé !');
    });

    // Focus first input
    const firstInput = modal.querySelector('input');
    if (firstInput) firstInput.focus();
  }

  /**
   * Handle vCard button click.
   */
  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();

    try {
      const { name, email } = currentExtractor.extractSenderInfo();
      const signatureHtml = currentExtractor.extractSignatureHtml();
      const contact = SignatureParser.parse(signatureHtml, name, email);

      // Ensure we at least have the email
      if (!contact.email && email) contact.email = email;
      if (!contact.name && name) contact.name = name;

      if (!contact.email && !contact.name) {
        showToast('Impossible d\'extraire les informations du mail.');
        return;
      }

      showPreviewModal(contact);
    } catch (err) {
      console.error('[vCard Extension]', err);
      showToast('Erreur lors de l\'extraction.');
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

  /**
   * Inject the button into the page.
   */
  function injectButton() {
    // Don't inject if already present
    if (document.getElementById(BUTTON_ID)) return;

    const container = currentExtractor.getButtonContainer();

    if (container) {
      const btn = createButton();
      container.appendChild(btn);
    } else {
      // Fallback: floating button
      const btn = createButton();
      btn.classList.add('vcard-btn--floating');
      document.body.appendChild(btn);
    }
  }

  /**
   * Remove existing button (for re-injection on navigation).
   */
  function removeButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
  }

  /**
   * Debounced check for email view changes.
   */
  function onMutation() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const hasEmail = currentExtractor.extractSenderInfo().email ||
                       currentExtractor.extractSenderInfo().name;
      if (hasEmail) {
        injectButton();
      } else {
        removeButton();
      }
    }, 500);
  }

  // Escape HTML attributes
  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Start observing
  currentExtractor.observe(onMutation);

  // Initial check
  setTimeout(onMutation, 1500);
})();
