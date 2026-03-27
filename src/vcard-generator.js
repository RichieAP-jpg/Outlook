/**
 * Generates vCard 3.0 (.vcf) files from contact info.
 */
const VCardGenerator = {
  /**
   * Generate a vCard string from contact data.
   * @param {Object} contact - { name, email, phone, mobile, company, title, address, website }
   * @returns {string} vCard formatted string
   */
  generate(contact) {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0'
    ];

    // Name
    const name = (contact.name || '').trim();
    if (name) {
      const parts = name.split(/\s+/);
      const lastName = parts.length > 1 ? parts.pop() : '';
      const firstName = parts.join(' ');
      lines.push(`N:${this._escape(lastName)};${this._escape(firstName)};;;`);
      lines.push(`FN:${this._escape(name)}`);
    }

    // Email
    if (contact.email) {
      lines.push(`EMAIL;TYPE=INTERNET:${this._escape(contact.email)}`);
    }

    // Phone
    if (contact.phone) {
      lines.push(`TEL;TYPE=WORK,VOICE:${this._escape(contact.phone)}`);
    }

    // Mobile
    if (contact.mobile) {
      lines.push(`TEL;TYPE=CELL:${this._escape(contact.mobile)}`);
    }

    // Company
    if (contact.company) {
      lines.push(`ORG:${this._escape(contact.company)}`);
    }

    // Title
    if (contact.title) {
      lines.push(`TITLE:${this._escape(contact.title)}`);
    }

    // Address
    if (contact.address) {
      lines.push(`ADR;TYPE=WORK:;;${this._escape(contact.address)};;;;`);
    }

    // Website
    if (contact.website) {
      lines.push(`URL:${this._escape(contact.website)}`);
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
  },

  /**
   * Download a vCard as a .vcf file.
   */
  download(vcardString, filename) {
    const blob = new Blob([vcardString], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'contact.vcf';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  _escape(str) {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }
};
