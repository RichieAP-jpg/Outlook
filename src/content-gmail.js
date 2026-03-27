/**
 * Gmail-specific email data extraction and button injection.
 */
const GmailExtractor = {
  isGmail() {
    return location.hostname === 'mail.google.com';
  },

  /**
   * Extract sender info from the currently open email.
   */
  extractSenderInfo() {
    // Sender name and email from the header
    const senderEl = document.querySelector('.gD[email]') ||
                     document.querySelector('[data-hovercard-id]') ||
                     document.querySelector('.go');

    let name = '';
    let email = '';

    if (senderEl) {
      email = senderEl.getAttribute('email') ||
              senderEl.getAttribute('data-hovercard-id') || '';
      name = senderEl.getAttribute('name') ||
             senderEl.textContent.trim() || '';
    }

    // Fallback: look in "From" line
    if (!email) {
      const fromSpans = document.querySelectorAll('span[email]');
      if (fromSpans.length > 0) {
        const lastFrom = fromSpans[fromSpans.length - 1];
        email = lastFrom.getAttribute('email') || '';
        name = name || lastFrom.textContent.trim();
      }
    }

    return { name, email };
  },

  /**
   * Extract the signature HTML from the email body.
   */
  extractSignatureHtml() {
    // Gmail often wraps signatures in a div with class "gmail_signature"
    const sigEl = document.querySelector('.gmail_signature');
    if (sigEl) return sigEl.innerHTML;

    // Fallback: get the email body and try to find signature after "--" or last block
    const bodyEl = document.querySelector('.a3s.aiL') ||
                   document.querySelector('.ii.gt div');
    if (!bodyEl) return '';

    const html = bodyEl.innerHTML;

    // Look for common signature delimiters
    const delimiterPatterns = [
      /--\s*<br/i,
      /<div class="gmail_signature/i,
      /cordialement/i,
      /regards/i,
      /best regards/i,
      /sincèrement/i,
      /sent from/i
    ];

    for (const pattern of delimiterPatterns) {
      const match = html.search(pattern);
      if (match !== -1) {
        return html.substring(match);
      }
    }

    // Last resort: take the last third of the email
    const lines = html.split('<br');
    if (lines.length > 6) {
      return lines.slice(Math.floor(lines.length * 0.6)).join('<br');
    }

    return html;
  },

  /**
   * Find the toolbar area to inject the vCard button.
   */
  getButtonContainer() {
    // Gmail action bar (reply/forward area at top of email)
    return document.querySelector('.ade') ||     // Action icons row
           document.querySelector('.amn') ||     // Top toolbar
           document.querySelector('.bAo');       // Alternative toolbar
  },

  /**
   * Observe for email open events to inject button.
   */
  observe(callback) {
    const observer = new MutationObserver(() => {
      // Check if an email is open (has sender element)
      const senderEl = document.querySelector('.gD[email]') ||
                       document.querySelector('span[email]');
      if (senderEl) {
        callback();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }
};
