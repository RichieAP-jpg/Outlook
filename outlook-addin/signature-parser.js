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

    const text = this._htmlToText(signatureHtml);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    console.log('[vCard Parser] Lines:', lines);

    // Extract email from signature
    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    if (emailMatch) {
      result.email = emailMatch[0];
    }

    // Extract phone numbers
    for (const line of lines) {
      const mobileMatch = line.match(/(?:^M\s*[.:]\s*|(?:mobile|mob|cell|portable|gsm)\s*[.:]\s*)([+\d\s().-]{7,})/i);
      if (mobileMatch && !result.mobile) {
        result.mobile = mobileMatch[1].replace(/[^\d+() .-]/g, '').trim();
        continue;
      }

      const phoneMatch = line.match(/(?:^T\s*[.:]\s*|(?:t[eé]l|phone|tel|ph|direct)\s*[.:]\s*)([+\d\s().-]{7,})/i);
      if (phoneMatch && !result.phone) {
        result.phone = phoneMatch[1].replace(/[^\d+() .-]/g, '').trim();
        continue;
      }

      if (!result.phone && !result.mobile) {
        const genericMatch = line.match(/^[+]?\d[\d\s().-]{6,}\d$/);
        if (genericMatch) {
          if (/\+?33\s*[67]|^0[67]/.test(line)) {
            result.mobile = line.trim();
          } else {
            result.phone = line.trim();
          }
        }
      }
    }

    // Extract website — must contain "www." or explicit http URL
    const urlMatch = text.match(/(?:https?:\/\/)?www\.[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/\S*)?/i);
    if (urlMatch) {
      let url = urlMatch[0];
      if (!url.startsWith('http')) url = 'https://' + url;
      result.website = url;
    } else {
      const httpMatch = text.match(/https?:\/\/[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/\S*)?/i);
      if (httpMatch && !httpMatch[0].includes('@')) {
        result.website = httpMatch[0];
      }
    }

    // Extract name, title, company from signature structure
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
    let sigStartIndex = -1;

    // Try to find the sender's name in the signature lines
    if (fallbackName && !this._looksLikeBadName(fallbackName)) {
      const nameLower = fallbackName.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        if (lineLower.includes(nameLower) || nameLower.includes(lineLower)) {
          sigStartIndex = i;
          break;
        }
        const nameParts = fallbackName.split(/\s+/);
        if (nameParts.length >= 2 && nameParts.every(p => lineLower.includes(p.toLowerCase()))) {
          sigStartIndex = i;
          break;
        }
      }
    }

    // If name from header didn't match, try to find the signature block
    // by looking for a short name-like line followed by a title-like line
    if (sigStartIndex < 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (this._looksLikeGreeting(line)) continue;
        if (this._looksLikeContactInfo(line)) continue;
        if (this._looksLikeAddress(line)) continue;
        if (line.length > 40) continue;

        // A name is typically 2-4 words, no special chars except hyphens/apostrophes
        if (this._looksLikePersonName(line)) {
          // Check if next line looks like a title or company
          const nextLine = lines[i + 1] || '';
          if (this._looksLikeTitle(nextLine) || this._looksLikeCompany(nextLine) ||
              (nextLine.length < 50 && nextLine.length > 1 &&
               !this._looksLikeContactInfo(nextLine) && !this._looksLikeAddress(nextLine) &&
               !this._looksLikeGreeting(nextLine))) {
            sigStartIndex = i;
            result.name = line; // Override the bad name from the header
            break;
          }
        }
      }
    }

    // Extract title and company from lines after the name
    if (sigStartIndex >= 0) {
      for (let i = sigStartIndex + 1; i < Math.min(lines.length, sigStartIndex + 5); i++) {
        const line = lines[i];
        if (!line || this._looksLikeContactInfo(line) || this._looksLikeAddress(line)) continue;
        if (line.length > 60) continue;
        if (this._looksLikeGreeting(line)) continue;

        // Pipe/dash separator: "Title | Company" or "Title - Company"
        const sepMatch = line.match(/^(.+?)\s*[|–—]\s*(.+)$/);
        if (sepMatch && !result.title && sepMatch[1].length < 50 && sepMatch[2].length < 50) {
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
      // Last resort fallback: scan for keyword matches
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i];
        if (this._looksLikeContactInfo(line) || this._looksLikeAddress(line)) continue;
        if (line.length > 60) continue;
        if (this._looksLikeGreeting(line)) continue;

        if (!result.title && this._looksLikeTitle(line)) {
          result.title = line;
          continue;
        }

        if (!result.company && this._looksLikeCompany(line)) {
          result.company = line;
        }
      }
    }
  },

  /**
   * Check if a name looks wrong (like an email subject or conversation name).
   */
  _looksLikeBadName(name) {
    return name.includes(' - ') ||  // "Lafitte - SPA" = subject line
           name.includes('RE:') ||
           name.includes('FW:') ||
           name.includes('TR:') ||
           name.length > 50 ||
           /^\[/.test(name) ||       // "[EXTERNAL] ..."
           /\d{4}/.test(name);       // Contains year = probably subject
  },

  /**
   * Check if a line looks like a person's name (2-4 words, letters only).
   */
  _looksLikePersonName(line) {
    // 2 to 5 words, mostly letters, may contain hyphens/apostrophes
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 5) return false;
    if (line.length > 40) return false;
    // Should be mostly letters
    return /^[A-Za-z\u00C0-\u024F][\w\u00C0-\u024F' -]+$/.test(line) &&
           !/\d/.test(line);
  },

  _looksLikeGreeting(line) {
    return /^(hello|hi|bonjour|dear|cher|ch[èe]re|bonsoir|salut|hey)\b/i.test(line) ||
           /^(bonne|cordialement|regards|best|merci|thank|sent from)/i.test(line);
  },

  _looksLikeTitle(line) {
    return /^(directeur|director|manager|ingénieur|engineer|consultant|ceo|cto|cfo|coo|vp|chef|head|lead|président|president|fondateur|founder|responsable|associate|partner|analyst|developer|designer|principal|senior|junior|vice|assistant|gérant|avocat|attorney|counsel|architect|comptable|auditeur|stagiaire|intern)/i.test(line);
  },

  _looksLikeCompany(line) {
    return /(?:sarl|sas|sasu|sa\b|gmbh|ltd|llc|inc|corp|group|cabinet|agence|agency|consulting|conseil|partners|&\s*(?:co|cie)|s\.?a\.?s|s\.?a\.?r\.?l|avocats|law|legal|bank|capital|invest|tech|solutions)/i.test(line);
  },

  _looksLikeContactInfo(line) {
    return /[@]/.test(line) ||
           /(?:^T\s*[.:]|^M\s*[.:]|^D\s*[.:]|tel|phone|fax|mobile|www\.|http)/i.test(line) ||
           /^[+\d\s().-]{7,}$/.test(line) ||
           /\|.*\|/.test(line); // "C.Petracco@lek.com | www.lek.com" style lines
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
