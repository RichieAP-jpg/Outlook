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

    // Strategy 1: Look for sender name in the reading pane header
    // Outlook shows "Name <email>" or just "Name" near the top
    const senderSelectors = [
      '.lpc-hoverTarget',                // Live Persona Card hover target
      '[data-testid="SenderPersona"]',   // New Outlook
      '[role="heading"] span',           // Heading area
      '.IjQyB',                          // Sender name class
      '.OZZZK',                          // Alternative sender class
    ];

    for (const sel of senderSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text && text.length < 80 && !text.includes('@')) {
          name = text;
          break;
        }
      }
    }

    // Strategy 2: Find email from "Name <email@domain>" header text
    const headerEl = document.querySelector('[role="main"]');
    if (headerEl) {
      // Look for mailto links
      const mailtoLinks = headerEl.querySelectorAll('a[href^="mailto:"]');
      for (const link of mailtoLinks) {
        const href = link.getAttribute('href') || '';
        const mailto = href.replace('mailto:', '').split('?')[0];
        if (mailto.includes('@')) {
          email = mailto;
          if (!name) {
            const linkText = link.textContent.trim();
            if (linkText && !linkText.includes('@')) {
              name = linkText;
            }
          }
          break;
        }
      }

      // Fallback: search for email pattern in header spans
      if (!email) {
        const spans = headerEl.querySelectorAll('span');
        for (const span of spans) {
          const text = span.textContent.trim();
          if (/^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(text)) {
            email = text;
            break;
          }
          // "Name <email>" pattern
          const angleMatch = text.match(/<([\w.+-]+@[\w.-]+\.\w{2,})>/);
          if (angleMatch) {
            email = angleMatch[1];
            if (!name) name = text.replace(/<.*>/, '').trim();
            break;
          }
        }
      }
    }

    // Strategy 3: Extract name from the email header display
    // Look for the sender name shown as "Charles Petracco<C.Petracco@lek.com>"
    if (!name && email) {
      const allEls = document.querySelectorAll('button, span, div');
      for (const el of allEls) {
        const text = el.textContent.trim();
        if (text.includes(email) && text.length < 120) {
          const namePart = text.replace(email, '').replace(/[<>]/g, '').trim();
          if (namePart && namePart.length > 1 && namePart.length < 60) {
            name = namePart;
            break;
          }
        }
      }
    }

    console.log('[vCard Outlook] Sender:', { name, email });
    return { name, email };
  },

  /**
   * Extract the signature HTML from the email body.
   */
  extractSignatureHtml() {
    // Outlook email body - try multiple selectors
    const bodyEl = document.querySelector('[aria-label="Corps du message"]') ||
                   document.querySelector('[aria-label="Message body"]') ||
                   document.querySelector('[role="document"]') ||
                   document.querySelector('div[class*="Body"]');

    if (!bodyEl) {
      console.log('[vCard Outlook] No email body found');
      return '';
    }

    const html = bodyEl.innerHTML;

    // Look for the sign-off line and take everything after
    const signoffPatterns = [
      /(?:charles|cordialement|regards|best regards|kind regards|bien [àa] vous|cdlt|sincèrement|bonne)[^<]*/i
    ];

    for (const pattern of signoffPatterns) {
      const match = html.search(pattern);
      if (match !== -1) {
        return html.substring(match);
      }
    }

    // Look for signature delimiters
    const delimiterPatterns = [
      /--\s*<br/i,
      /--\s*<\/div/i,
    ];

    for (const pattern of delimiterPatterns) {
      const match = html.search(pattern);
      if (match !== -1) {
        return html.substring(match);
      }
    }

    // Fallback: take the last portion of the email
    const lines = html.split(/<br|<div|<p/i);
    if (lines.length > 4) {
      return lines.slice(Math.floor(lines.length * 0.5)).join('<br');
    }

    return html;
  },

  getButtonContainer() {
    return null; // We always use the floating button now
  },

  observe(callback) {
    // Not used anymore since we inject immediately
    return null;
  }
};
