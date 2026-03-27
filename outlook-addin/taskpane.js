/**
 * Outlook Add-in Taskpane - Uses Office.js to read email data and generate vCards.
 */
(function () {
  'use strict';

  // Field mapping: form id -> contact key
  const FIELDS = [
    { id: 'f-name', key: 'name' },
    { id: 'f-email', key: 'email' },
    { id: 'f-phone', key: 'phone' },
    { id: 'f-mobile', key: 'mobile' },
    { id: 'f-company', key: 'company' },
    { id: 'f-title', key: 'title' },
    { id: 'f-address', key: 'address' },
    { id: 'f-website', key: 'website' }
  ];

  const $loading = document.getElementById('loading');
  const $error = document.getElementById('error');
  const $errorMsg = document.getElementById('error-message');
  const $form = document.getElementById('contact-form');
  const $btnDownload = document.getElementById('btn-download');
  const $btnCopy = document.getElementById('btn-copy');
  const $toast = document.getElementById('toast');

  /**
   * Initialize Office.js and extract contact info.
   */
  Office.onReady(function (info) {
    if (info.host === Office.HostType.Outlook) {
      extractContact();
    } else {
      showError('Ce complément fonctionne uniquement dans Outlook.');
    }
  });

  /**
   * Extract sender info and email body, then parse signature.
   */
  window.extractContact = function extractContact() {
    showLoading();

    var item = Office.context.mailbox.item;

    if (!item) {
      showError('Aucun email sélectionné.');
      return;
    }

    // Gather sender info from Office.js API
    var senderName = '';
    var senderEmail = '';

    var sender = item.from || item.sender;
    if (sender) {
      senderName = sender.displayName || '';
      senderEmail = sender.emailAddress || '';
    }

    // Get email body as HTML to parse the signature
    item.body.getAsync(Office.CoercionType.Html, function (result) {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        var bodyHtml = result.value || '';
        var signatureHtml = extractSignatureFromBody(bodyHtml);
        var contact = SignatureParser.parse(signatureHtml, senderName, senderEmail);

        // Ensure we have at least the sender basics
        if (!contact.email && senderEmail) contact.email = senderEmail;
        if (!contact.name && senderName) contact.name = senderName;

        populateForm(contact);
        showForm();
      } else {
        // Fallback: use sender info without signature parsing
        var contact = {
          name: senderName,
          email: senderEmail,
          phone: '', mobile: '', company: '', title: '',
          address: '', website: ''
        };
        populateForm(contact);
        showForm();
      }
    });
  };

  /**
   * Extract signature portion from the full email body HTML.
   */
  function extractSignatureFromBody(html) {
    // Try to find signature delimiters
    var delimiterPatterns = [
      /--\s*<br/i,
      /cordialement/i,
      /regards/i,
      /best regards/i,
      /kind regards/i,
      /sincèrement/i,
      /bien [àa] vous/i,
      /sent from/i
    ];

    for (var i = 0; i < delimiterPatterns.length; i++) {
      var match = html.search(delimiterPatterns[i]);
      if (match !== -1) {
        return html.substring(match);
      }
    }

    // Fallback: take the last portion of the email
    var lines = html.split('<br');
    if (lines.length > 6) {
      return lines.slice(Math.floor(lines.length * 0.6)).join('<br');
    }

    return html;
  }

  /**
   * Populate form fields with contact data.
   */
  function populateForm(contact) {
    for (var i = 0; i < FIELDS.length; i++) {
      var input = document.getElementById(FIELDS[i].id);
      if (input) {
        input.value = contact[FIELDS[i].key] || '';
      }
    }
  }

  /**
   * Read current form values into a contact object.
   */
  function readForm() {
    var contact = {};
    for (var i = 0; i < FIELDS.length; i++) {
      var input = document.getElementById(FIELDS[i].id);
      contact[FIELDS[i].key] = input ? input.value.trim() : '';
    }
    return contact;
  }

  /**
   * Download button handler.
   */
  $btnDownload.addEventListener('click', function () {
    var contact = readForm();
    if (!contact.name && !contact.email) {
      showToast('Veuillez remplir au moins le nom ou l\'email.');
      return;
    }

    var vcard = VCardGenerator.generate(contact);
    var filename = (contact.name || 'contact').replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '_') + '.vcf';

    // Download via Blob
    var blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Contact téléchargé !');
  });

  /**
   * Copy vCard to clipboard.
   */
  $btnCopy.addEventListener('click', function () {
    var contact = readForm();
    var vcard = VCardGenerator.generate(contact);

    navigator.clipboard.writeText(vcard).then(function () {
      showToast('vCard copiée dans le presse-papier !');
    }).catch(function () {
      // Fallback for environments where clipboard API is restricted
      var textarea = document.createElement('textarea');
      textarea.value = vcard;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('vCard copiée !');
    });
  });

  // -- UI state helpers --

  function showLoading() {
    $loading.classList.remove('hidden');
    $error.classList.add('hidden');
    $form.classList.add('hidden');
  }

  function showError(msg) {
    $loading.classList.add('hidden');
    $error.classList.remove('hidden');
    $form.classList.add('hidden');
    $errorMsg.textContent = msg;
  }

  function showForm() {
    $loading.classList.add('hidden');
    $error.classList.add('hidden');
    $form.classList.remove('hidden');
  }

  function showToast(msg) {
    $toast.textContent = msg;
    $toast.classList.remove('hidden');
    setTimeout(function () {
      $toast.classList.add('hidden');
    }, 3000);
  }
})();
