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

    // Strategy 1: Find the FIRST mailto: link in the reading pane
    // In Outlook, the sender name/email appears as a mailto link at the top of the email
    const readingPane = document.querySelector('[role="main"]') ||
                        document.querySelector('[data-app-section="ReadingPane"]') ||
                        document.body;

    // Look for the sender line: "Name <email>" shown near the top
    // The sender's mailto link is typically one of the first in the reading pane
    const mailtoLinks = readingPane.querySelectorAll('a[href^="mailto:"]');
    for (const link of mailtoLinks) {
      const href = link.getAttribute('href') || '';
      const mailto = href.replace('mailto:', '').split('?')[0].trim();
      if (mailto.includes('@')) {
        email = mailto;
        // The link text might be the name or the email
        const linkText = link.textContent.trim();
        if (linkText && !linkText.includes('@') && linkText.length < 60) {
          name = linkText;
        }
        break;
      }
    }

    // Strategy 2: Look for "From:" / "De:" pattern or sender persona elements
    if (!email) {
      const spans = readingPane.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        // Match email pattern in a small span (likely a sender display)
        if (/^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(text) && text.length < 80) {
          email = text;
          break;
        }
        // "Name <email>" pattern
        const angleMatch = text.match(/^([^<]+)<([\w.+-]+@[\w.-]+\.\w{2,})>$/);
        if (angleMatch) {
          name = angleMatch[1].trim();
          email = angleMatch[2];
          break;
        }
      }
    }

    // Strategy 3: If we found email but no name, try to derive from email
    if (email && !name) {
      // Try to find a span/button near the email that contains a name
      const allEls = readingPane.querySelectorAll('span, button');
      for (const el of allEls) {
        const text = el.textContent.trim();
        // Look for elements that contain the email and more text (like "Jordan Ohayon <johayon@...>")
        if (text.includes(email) && text.length > email.length + 2 && text.length < 120) {
          const namePart = text.replace(email, '').replace(/[<>]/g, '').trim();
          if (namePart && namePart.length > 1 && namePart.length < 60) {
            name = namePart;
            break;
          }
        }
      }

      // Last resort: derive name from email (johayon → J. Ohayon)
      if (!name) {
        const localPart = email.split('@')[0];
        // Common patterns: j.ohayon, johayon, jordan.ohayon
        const dotParts = localPart.split('.');
        if (dotParts.length >= 2) {
          name = dotParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
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

    // Look for common sign-off keywords and take everything after
    const signoffPatterns = [
      /cordialement/i,
      /regards/i,
      /best regards/i,
      /kind regards/i,
      /bien [àa] vous/i,
      /cdlt/i,
      /sincèrement/i,
      /bonne fin de/i,
      /bonne journ/i,
      /à bientôt/i,
      /à très bientôt/i,
      /--\s*<br/i,
      /--\s*<\/div/i,
    ];

    for (const pattern of signoffPatterns) {
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
    return null;
  },

  observe(callback) {
    return null;
  }
};
