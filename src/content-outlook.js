/**
 * Outlook Web-specific email data extraction and button injection.
 */
const OutlookExtractor = {
  isOutlook() {
    return location.hostname.includes('outlook.live.com') ||
           location.hostname.includes('outlook.office.com') ||
           location.hostname.includes('outlook.office365.com');
  },

  /**
   * Extract sender info from the currently open email.
   */
  extractSenderInfo() {
    let name = '';
    let email = '';

    // Outlook reading pane sender
    const senderEl = document.querySelector('[data-testid="ComposeSenderPersona"]') ||
                     document.querySelector('.lpc-hoverTarget') ||
                     document.querySelector('[autoid="_pe_b"]') ||
                     document.querySelector('.XbIp4.jGG6V');

    if (senderEl) {
      name = senderEl.textContent.trim();
      // Email might be in a tooltip or aria-label
      const ariaLabel = senderEl.getAttribute('aria-label') || '';
      const emailMatch = ariaLabel.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
      if (emailMatch) email = emailMatch[0];
    }

    // Try to find email from expanded sender details
    if (!email) {
      const emailEls = document.querySelectorAll('[autoid="_pe_b1"], .OZZZK, [data-testid="PersonaCardEmail"]');
      for (const el of emailEls) {
        const text = el.textContent.trim();
        if (text.includes('@')) {
          email = text;
          break;
        }
      }
    }

    // Broader search for email in the header area
    if (!email) {
      const headerArea = document.querySelector('[role="main"]') || document.body;
      const allSpans = headerArea.querySelectorAll('span, a[href^="mailto:"]');
      for (const span of allSpans) {
        const text = span.textContent.trim();
        const href = span.getAttribute('href') || '';
        if (href.startsWith('mailto:')) {
          email = href.replace('mailto:', '').split('?')[0];
          if (!name) name = text;
          break;
        }
        if (/^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(text)) {
          email = text;
          break;
        }
      }
    }

    return { name, email };
  },

  /**
   * Extract the signature HTML from the email body.
   */
  extractSignatureHtml() {
    // Outlook email body
    const bodyEl = document.querySelector('[aria-label="Message body"]') ||
                   document.querySelector('.XbIp4.jGG6V') ||
                   document.querySelector('[role="document"]') ||
                   document.querySelector('.rps_ad09');

    if (!bodyEl) return '';

    const html = bodyEl.innerHTML;

    // Look for signature delimiters
    const delimiterPatterns = [
      /--\s*<br/i,
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

    // Take the last portion of the email
    const lines = html.split('<br');
    if (lines.length > 6) {
      return lines.slice(Math.floor(lines.length * 0.6)).join('<br');
    }

    return html;
  },

  /**
   * Find a toolbar area to inject the vCard button.
   */
  getButtonContainer() {
    return document.querySelector('[data-testid="ReadingPaneToolbar"]') ||
           document.querySelector('.jb_V4') ||
           document.querySelector('[role="toolbar"]');
  },

  /**
   * Observe for email open events.
   */
  observe(callback) {
    const observer = new MutationObserver(() => {
      const bodyEl = document.querySelector('[aria-label="Message body"]') ||
                     document.querySelector('[role="document"]');
      if (bodyEl) {
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
