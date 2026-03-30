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

    console.log('[vCard Parser] Lines:', lines);

    // Extract email from signature (may differ from sender)
    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    if (emailMatch) {
      result.email = emailMatch[0];
    }

    // Extract phone numbers — detect "M:" or "T:" prefixes too
    for (const line of lines) {
      // Mobile patterns: "M:", "M :", "Mobile:", "Mob:", "Cell:", "Portable:", "+33 6..."
      const mobileMatch = line.match(/(?:^M\s*[.:]\s*|(?:mobile|mob|cell|portable|gsm)\s*[.:]\s*)([+\d\s().-]{7,})/i);
      if (mobileMatch && !result.mobile) {
        result.mobile = mobileMatch[1].replace(/[^\d+() .-]/g, '').trim();
        continue;
      }

      // Phone patterns: "T:", "Tel:", "Phone:", "Ph:", "Tél:"
      const phoneMatch = line.match(/(?:^T\s*[.:]\s*|(?:t[eé]l|phone|tel|ph)\s*[.:]\s*)([+\d\s().-]{7,})/i);
      if (phoneMatch && !result.phone) {
        result.phone = phoneMatch[1].replace(/[^\d+() .-]/g, '').trim();
        continue;
      }

      // Generic phone number on its own line (not already captured)
      if (!result.phone && !result.mobile) {
        const genericMatch = line.match(/^[+]?\d[\d\s().-]{6,}\d$/);
        if (genericMatch) {
          // If starts with +33 6 or +33 7 → mobile, else phone
          if (/\+?33\s*[67]|^0[67]/.test(line)) {
            result.mobile = line.trim();
          } else {
            result.phone = line.trim();
          }
        }
      }
    }

    // Extract website — must contain "www." or be an explicit URL, NOT an email
    const urlMatch = text.match(/(?:https?:\/\/)?www\.[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/\S*)?/i);
    if (urlMatch) {
      let url = urlMatch[0];
      if (!url.startsWith('http')) url = 'https://' + url;
      result.website = url;
    } else {
      // Look for explicit http(s) URLs
      const httpMatch = text.match(/https?:\/\/[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/\S*)?/i);
      if (httpMatch && !httpMatch[0].includes('@')) {
        result.website = httpMatch[0];
      }
    }

    // Extract name, title, company from signature structure
    // Typical format:
    //   Charles Petracco     ← name (same as sender, skip)
    //   Principal            ← title
    //   L.E.K. Consulting    ← company
    //   2, rue Paul...       ← address
    this._extractNameTitleCompany(lines, result, fallbackName);

    // Extract address
    const addressParts = [];
    for (const line of lines) {
      if (this._looksLikeAddress(line)) {
        addressParts.push(line);
      }
    }
    if (addressParts.length > 0) {
      result.address = addressParts.join(', ');
    }

    return result;
  },

  /**
   * Extract name, title and company from the first lines of the signature.
   */
  _extractNameTitleCompany(lines, result, fallbackName) {
    // Find signature start: look for the sender name in the lines
    let sigStartIndex = -1;

    // The signature usually starts with the person's name
    if (fallbackName) {
      const nameLower = fallbackName.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        // Check if line contains the sender's name (or vice versa)
        if (lineLower.includes(nameLower) || nameLower.includes(lineLower)) {
          sigStartIndex = i;
          break;
        }
        // Check first/last name match
        const nameParts = fallbackName.split(/\s+/);
        if (nameParts.length >= 2 && nameParts.every(p => lineLower.includes(p.toLowerCase()))) {
          sigStartIndex = i;
          break;
        }
      }
    }

    // If we found the name line, look at the next lines for title/company
    if (sigStartIndex >= 0) {
      for (let i = sigStartIndex + 1; i < Math.min(lines.length, sigStartIndex + 5); i++) {
        const line = lines[i];
        if (!line || this._looksLikeContactInfo(line) || this._looksLikeAddress(line)) continue;
        if (line.length > 60) continue;

        // Pipe/dash separator: "Title | Company"
        const sepMatch = line.match(/^(.+?)\s*[|–—]\s*(.+)$/);
        if (sepMatch && !result.title) {
          result.title = sepMatch[1].trim();
          result.company = sepMatch[2].trim();
          continue;
        }

        // First non-contact line after name = title
        if (!result.title) {
          result.title = line;
          continue;
        }

        // Second non-contact line = company
        if (!result.company) {
          result.company = line;
          break;
        }
      }
    } else {
      // Fallback: scan first lines for title/company keywords
      for (let i = 0; i < Math.min(lines.length, 8); i++) {
        const line = lines[i];
        if (this._looksLikeContactInfo(line) || this._looksLikeAddress(line)) continue;
        if (line.length > 60) continue;

        // Skip greetings
        if (this._looksLikeGreeting(line)) continue;

        // Title keywords
        if (!result.title && this._looksLikeTitle(line)) {
          result.title = line;
          continue;
        }

        // Company keywords
        if (!result.company && this._looksLikeCompany(line)) {
          result.company = line;
        }
      }
    }
  },

  _looksLikeGreeting(line) {
    return /^(hello|hi|bonjour|dear|cher|chère|bonsoir|salut|hey)\b/i.test(line) ||
           /^(bonne|cordialement|regards|best|merci|thank)/i.test(line);
  },

  _looksLikeTitle(line) {
    return /^(directeur|director|manager|ingénieur|engineer|consultant|ceo|cto|cfo|coo|vp|chef|head|lead|président|president|fondateur|founder|responsable|associate|partner|analyst|developer|designer|principal|senior|junior|vice|assistant|gérant|avocat|architecte|comptable)/i.test(line);
  },

  _looksLikeCompany(line) {
    return /(?:sarl|sas|sa\b|sasu|gmbh|ltd|llc|inc|corp|group|cabinet|agence|agency|consulting|conseil|partners|&\s*(?:co|cie)|s\.?a\.?s|s\.?a\.?r\.?l)/i.test(line);
  },

  _looksLikeContactInfo(line) {
    return /[@]/.test(line) ||
           /(?:^T\s*[.:]|^M\s*[.:]|tel|phone|fax|mobile|www\.|http)/i.test(line) ||
           /^[+\d\s().-]{7,}$/.test(line);
  },

  _looksLikeAddress(line) {
    return /\d+[\s,]+(?:rue|avenue|av\.|boulevard|blvd|street|st\.|road|rd\.|place|allée|chemin|impasse|route)/i.test(line) ||
           /(?:bp|boîte postale|po box)\s*\d+/i.test(line) ||
           (/\d{4,5}\s+[A-Za-z\u00C0-\u024F]/.test(line) && line.length < 80);
  },

  _htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;

    body.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    body.querySelectorAll('p, div, tr, li').forEach(el => {
      el.prepend(document.createTextNode('\n'));
    });

    return body.textContent || body.innerText || '';
  }
};
