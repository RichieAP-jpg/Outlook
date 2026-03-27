/**
 * Parses email signatures to extract contact information.
 */
const SignatureParser = {
  /**
   * Extract contact info from an email signature text block.
   * Returns: { name, email, phone, mobile, company, title, address, website }
   */
  parse(signatureHtml, fallbackName, fallbackEmail) {
    const result = {
      name: fallbackName || '',
      email: fallbackEmail || '',
      phone: '',
      mobile: '',
      company: '',
      title: '',
      address: '',
      website: ''
    };

    if (!signatureHtml) return result;

    // Convert HTML to text while preserving line breaks
    const text = this._htmlToText(signatureHtml);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Extract email (may differ from sender)
    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    if (emailMatch) {
      result.email = emailMatch[0];
    }

    // Extract phone numbers
    const phonePatterns = [
      /(?:t[eé]l|phone|tel|ph|fax)\s*[.:]\s*([+\d\s().-]{7,})/i,
      /(?:mobile|mob|cell|portable|gsm)\s*[.:]\s*([+\d\s().-]{7,})/i,
      /(\+?\d[\d\s().-]{6,}\d)/
    ];

    const mobileKeywords = /mobile|mob|cell|portable|gsm/i;

    for (const line of lines) {
      for (const pattern of phonePatterns) {
        const match = line.match(pattern);
        if (match) {
          const number = match[1] || match[0];
          const cleaned = number.replace(/[^\d+() .-]/g, '').trim();
          if (cleaned.length >= 7) {
            if (mobileKeywords.test(line)) {
              if (!result.mobile) result.mobile = cleaned;
            } else {
              if (!result.phone) result.phone = cleaned;
            }
          }
        }
      }
    }

    // Extract website
    const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/\S*)?)/i);
    if (urlMatch) {
      let url = urlMatch[0];
      // Exclude email domains
      if (!url.includes('@')) {
        if (!url.startsWith('http')) url = 'https://' + url;
        result.website = url;
      }
    }

    // Extract company and title from first lines (common signature format)
    // Usually: Name\nTitle\nCompany or Name\nTitle | Company
    if (lines.length >= 2) {
      // First line often has the name (if different from sender name)
      const firstLine = lines[0];
      if (!this._looksLikeContactInfo(firstLine) && firstLine.length < 60) {
        // Could be the name
        if (!result.name || result.name === fallbackEmail) {
          result.name = firstLine;
        }
      }

      // Look for title/company patterns
      for (let i = 0; i < Math.min(lines.length, 6); i++) {
        const line = lines[i];

        // Skip lines that are clearly contact info
        if (this._looksLikeContactInfo(line)) continue;

        // Pipe or dash separator: "Title | Company" or "Title - Company"
        const sepMatch = line.match(/^(.+?)\s*[|–—-]\s*(.+)$/);
        if (sepMatch && !result.title && sepMatch[1].length < 50 && sepMatch[2].length < 50) {
          result.title = sepMatch[1].trim();
          result.company = sepMatch[2].trim();
          continue;
        }

        // Common title keywords
        if (!result.title && /^(directeur|director|manager|ingénieur|engineer|consultant|ceo|cto|cfo|vp|chef|head|lead|président|president|fondateur|founder|responsable|associate|partner|analyst|developer|designer)/i.test(line) && line.length < 60) {
          result.title = line;
          continue;
        }

        // Company indicators
        if (!result.company && /(?:sarl|sas|sa\b|gmbh|ltd|llc|inc|corp|group|cabinet|agence|agency)/i.test(line) && line.length < 60) {
          result.company = line;
        }
      }
    }

    // Extract address - look for patterns with numbers, street keywords
    const addressPatterns = [
      /\d+[\s,]+(?:rue|avenue|av\.|boulevard|blvd|street|st\.|road|rd\.|place|allée|chemin|impasse|route)[^,\n]*/i,
      /(?:bp|boîte postale|po box)\s*\d+/i,
      /\d{4,5}\s+[A-Za-zÀ-ÿ\s-]+(?:cedex)?/i  // Postal code + city
    ];

    const addressParts = [];
    for (const line of lines) {
      for (const pattern of addressPatterns) {
        if (pattern.test(line) && line.length < 100) {
          addressParts.push(line);
          break;
        }
      }
    }
    if (addressParts.length > 0) {
      result.address = addressParts.join(', ');
    }

    return result;
  },

  _looksLikeContactInfo(line) {
    return /[@]/.test(line) ||
           /(?:tel|phone|fax|mobile|www\.|http)/i.test(line) ||
           /^[+\d\s().-]{7,}$/.test(line);
  },

  _htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = html;

    // Replace <br> and block elements with newlines
    div.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    div.querySelectorAll('p, div, tr, li').forEach(el => {
      el.prepend(document.createTextNode('\n'));
    });

    return div.textContent || div.innerText || '';
  }
};
