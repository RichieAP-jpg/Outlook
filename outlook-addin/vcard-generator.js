/**
 * Generates vCard 3.0 (.vcf) files from contact info.
 * Shared module used by both the browser extension and the Office Add-in.
 */
var VCardGenerator = {
  /**
   * Generate a vCard string from contact data.
   * @param {{ name, email, phone, mobile, company, title, address, website }} contact
   * @returns {string} vCard formatted string
   */
  generate: function (contact) {
    var lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'PRODID:-//Email to vCard Extension//FR'
    ];

    // Name
    var name = (contact.name || '').trim();
    if (name) {
      var parts = name.split(/\s+/);
      var lastName = parts.length > 1 ? parts.pop() : '';
      var firstName = parts.join(' ');
      lines.push('N:' + this._escape(lastName) + ';' + this._escape(firstName) + ';;;');
      lines.push('FN:' + this._escape(name));
    }

    if (contact.email) {
      lines.push('EMAIL;TYPE=INTERNET:' + this._escape(contact.email));
    }

    if (contact.phone) {
      lines.push('TEL;TYPE=WORK,VOICE:' + this._escape(contact.phone));
    }

    if (contact.mobile) {
      lines.push('TEL;TYPE=CELL:' + this._escape(contact.mobile));
    }

    if (contact.company) {
      lines.push('ORG:' + this._escape(contact.company));
    }

    if (contact.title) {
      lines.push('TITLE:' + this._escape(contact.title));
    }

    if (contact.address) {
      lines.push('ADR;TYPE=WORK:;;' + this._escape(contact.address) + ';;;;');
    }

    if (contact.website) {
      lines.push('URL:' + this._escape(contact.website));
    }

    // Timestamp
    lines.push('REV:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z');

    lines.push('END:VCARD');
    return lines.join('\r\n');
  },

  _escape: function (str) {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }
};
