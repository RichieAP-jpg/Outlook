/**
 * Parses email signatures to extract contact information.
 * Shared module used by both the browser extension and the Office Add-in.
 */
var SignatureParser = {
  /**
   * Extract contact info from an email signature text block.
   * @param {string} signatureHtml - HTML of the signature area
   * @param {string} fallbackName - Sender name from email header
   * @param {string} fallbackEmail - Sender email from email header
   * @returns {{ name, email, phone, mobile, company, title, address, website }}
   */
  parse: function (signatureHtml, fallbackName, fallbackEmail) {
    var result = {
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

    var text = this._htmlToText(signatureHtml);
    var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);

    // Extract email
    var emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    if (emailMatch) {
      result.email = emailMatch[0];
    }

    // Extract phone numbers
    var phonePatterns = [
      /(?:t[eé]l|phone|tel|ph|fax)\s*[.:]\s*([+\d\s().-]{7,})/i,
      /(?:mobile|mob|cell|portable|gsm)\s*[.:]\s*([+\d\s().-]{7,})/i,
      /(\+?\d[\d\s().-]{6,}\d)/
    ];
    var mobileKeywords = /mobile|mob|cell|portable|gsm/i;

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      for (var pi = 0; pi < phonePatterns.length; pi++) {
        var match = line.match(phonePatterns[pi]);
        if (match) {
          var number = match[1] || match[0];
          var cleaned = number.replace(/[^\d+() .-]/g, '').trim();
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
    var urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/\S*)?)/i);
    if (urlMatch) {
      var url = urlMatch[0];
      if (url.indexOf('@') === -1) {
        if (url.indexOf('http') !== 0) url = 'https://' + url;
        result.website = url;
      }
    }

    // Extract company and title
    if (lines.length >= 2) {
      var firstLine = lines[0];
      if (!this._looksLikeContactInfo(firstLine) && firstLine.length < 60) {
        if (!result.name || result.name === fallbackEmail) {
          result.name = firstLine;
        }
      }

      for (var i = 0; i < Math.min(lines.length, 6); i++) {
        var ln = lines[i];
        if (this._looksLikeContactInfo(ln)) continue;

        // Separator: "Title | Company"
        var sepMatch = ln.match(/^(.+?)\s*[|–—-]\s*(.+)$/);
        if (sepMatch && !result.title && sepMatch[1].length < 50 && sepMatch[2].length < 50) {
          result.title = sepMatch[1].trim();
          result.company = sepMatch[2].trim();
          continue;
        }

        // Title keywords
        if (!result.title && /^(directeur|director|manager|ingénieur|engineer|consultant|ceo|cto|cfo|vp|chef|head|lead|président|president|fondateur|founder|responsable|associate|partner|analyst|developer|designer|senior|junior|principal)/i.test(ln) && ln.length < 60) {
          result.title = ln;
          continue;
        }

        // Company indicators
        if (!result.company && /(?:sarl|sas|sa\b|gmbh|ltd|llc|inc|corp|group|cabinet|agence|agency)/i.test(ln) && ln.length < 60) {
          result.company = ln;
        }
      }
    }

    // Extract address
    var addressPatterns = [
      /\d+[\s,]+(?:rue|avenue|av\.|boulevard|blvd|street|st\.|road|rd\.|place|allée|chemin|impasse|route)[^,\n]*/i,
      /(?:bp|boîte postale|po box)\s*\d+/i,
      /\d{4,5}\s+[A-Za-z\u00C0-\u024F\s-]+(?:cedex)?/i
    ];

    var addressParts = [];
    for (var ai = 0; ai < lines.length; ai++) {
      var addrLine = lines[ai];
      for (var ap = 0; ap < addressPatterns.length; ap++) {
        if (addressPatterns[ap].test(addrLine) && addrLine.length < 100) {
          addressParts.push(addrLine);
          break;
        }
      }
    }
    if (addressParts.length > 0) {
      result.address = addressParts.join(', ');
    }

    return result;
  },

  _looksLikeContactInfo: function (line) {
    return /[@]/.test(line) ||
           /(?:tel|phone|fax|mobile|www\.|http)/i.test(line) ||
           /^[+\d\s().-]{7,}$/.test(line);
  },

  _htmlToText: function (html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var body = doc.body;

    // Replace <br> and block elements with newlines
    body.querySelectorAll('br').forEach(function (el) {
      el.replaceWith('\n');
    });
    body.querySelectorAll('p, div, tr, li').forEach(function (el) {
      el.prepend(document.createTextNode('\n'));
    });

    return body.textContent || body.innerText || '';
  }
};
