// src/config/contactInfo.ts
//
// Replaces a resume's contact details with tags before its text leaves the
// server. It runs in this order, so an email is gone before a name inside it
// could be half-replaced:
//
//   [EMAIL]    addresses, including mailto: and a space either side of @
//   [URL]      anything with http(s):// or www., LinkedIn, GitHub and other
//              profile sites, a domain followed by a path, and a bare personal
//              domain (.com .dev .me .io .site .page .xyz .tech .app)
//   [PHONE]    North American numbers in any common layout, and + numbers
//              of 8 to 15 digits
//   [ADDRESS]  a numbered street with its suffix and unit, "City, ST 12345"
//              with or without a comma before the zip, and PO boxes
//   [NAME]     each part of the names passed in, as whole words, any case
//
// Names cannot be recognised in general, so the caller passes the candidate's
// own (the Candidates row). A different person named in the text, such as a
// reference, is not removed. A part of a name that is also a word, like "May",
// is removed wherever it appears: the stripper errs towards removing.

export const TAGS = {
  email: '[EMAIL]',
  url: '[URL]',
  phone: '[PHONE]',
  address: '[ADDRESS]',
  name: '[NAME]',
} as const;

const EMAIL =
  /(?:mailto:)?[\p{L}\p{N}._%+-]+\s?@\s?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/giu;

const URL_WITH_SCHEME = /(?:https?:\/\/|www\.)[^\s<>"|]+/giu;
const PROFILE_SITE =
  /(?<![\p{L}\p{N}.-])(?:[\p{L}\p{N}-]+\.)*(?:linkedin\.com|github\.com|github\.io|gitlab\.com|bitbucket\.org|behance\.net|dribbble\.com|medium\.com|twitter\.com|x\.com|kaggle\.com|leetcode\.com|stackoverflow\.com)(?:\/[^\s<>"|]*)?/giu;
const DOMAIN_WITH_PATH =
  /(?<![\p{L}\p{N}.-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|org|net|io|dev|me|co|app|ai|site|page|tech|xyz|info|us|uk)\/[^\s<>"|]*/giu;
// Not .net, .org or .js without a path: ASP.NET and Node.js are skills.
const PERSONAL_DOMAIN =
  /(?<![\p{L}\p{N}.-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|dev|me|io|site|page|xyz|tech|app)(?![\p{L}\p{N}.-])/giu;
// Skills spelled like a domain.
const NOT_A_SITE = new Set(['socket.io']);

const NORTH_AMERICAN_PHONE =
  /(?<![\d+])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;
const INTL_PHONE = /\+\d{1,3}(?:[\s.-]?\(?\d{1,5}\)?){2,5}(?!\d)/g;

const STREET_SUFFIXES = [
  'Street',
  'St',
  'Avenue',
  'Ave',
  'Road',
  'Rd',
  'Boulevard',
  'Blvd',
  'Drive',
  'Dr',
  'Lane',
  'Ln',
  'Way',
  'Court',
  'Ct',
  'Place',
  'Pl',
  'Terrace',
  'Ter',
  'Parkway',
  'Pkwy',
  'Highway',
  'Hwy',
  'Square',
  'Sq',
  'Circle',
  'Cir',
  'Row',
  'Plaza',
];
const SUFFIX = STREET_SUFFIXES.flatMap((suffix) => [suffix, suffix.toUpperCase()]).join('|');
const STREET = new RegExp(
  `\\b\\d{1,6}[A-Za-z]?\\s+(?:[A-Z0-9][\\w'.-]*\\s+){0,4}(?:${SUFFIX})\\b\\.?` +
    `(?:,?\\s*(?:Apt|APT|Apartment|Unit|UNIT|Suite|Ste|#)\\.?\\s*[\\w-]+)?`,
  'g'
);
const CITY_STATE_ZIP =
  /\b[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,2},\s*[A-Z]{2},?\s+\d{5}(?:-\d{4})?\b/g;
const PO_BOX = /\bP\.?\s?O\.?\s*Box\s+\d+\b/gi;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const digitCount = (text: string) => text.replace(/\D/g, '').length;

// "[NAME] Q. [NAME]" or "[ADDRESS], [ADDRESS]" are one detail, so one tag.
const collapse = (text: string, tag: string) => {
  const t = escapeRegExp(tag);
  return text.replace(new RegExp(`${t}(?:[\\s,]*(?:\\p{Lu}\\.\\s*)?${t})+`, 'gu'), tag);
};

/**
 * Resume text with its contact details replaced by tags. Only
 * stripContactInfo makes one, so a function that takes StrippedText cannot be
 * handed the raw text by mistake.
 */
export class StrippedText {
  // A private member makes tsc compare StrippedText by class, not by shape;
  // without it, a plain { text: rawResume } would pass for one.
  private readonly stripped = true;

  private constructor(readonly text: string) {}

  /** The same as stripContactInfo. */
  static strip(text: string, names: readonly string[]): StrippedText {
    let out = text.replace(EMAIL, TAGS.email);

    out = out
      .replace(URL_WITH_SCHEME, TAGS.url)
      .replace(PROFILE_SITE, TAGS.url)
      .replace(DOMAIN_WITH_PATH, TAGS.url)
      .replace(PERSONAL_DOMAIN, (domain) =>
        NOT_A_SITE.has(domain.toLowerCase()) ? domain : TAGS.url
      );

    out = out.replace(NORTH_AMERICAN_PHONE, TAGS.phone).replace(INTL_PHONE, (phone) => {
      const digits = digitCount(phone);
      return digits >= 8 && digits <= 15 ? TAGS.phone : phone;
    });

    out = collapse(
      out
        .replace(STREET, TAGS.address)
        .replace(CITY_STATE_ZIP, TAGS.address)
        .replace(PO_BOX, TAGS.address),
      TAGS.address
    );

    const parts = new Set(
      names
        .flatMap((name) => name.split(/\s+/))
        .filter((part) => part.replace(/\W/g, '').length >= 2)
    );
    for (const part of parts) {
      out = out.replace(
        new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(part)}(?![\\p{L}\\p{N}])`, 'giu'),
        TAGS.name
      );
    }
    return new StrippedText(collapse(out, TAGS.name));
  }
}

/** The resume text with names, emails, phones, addresses and links replaced by tags. */
export const stripContactInfo = (text: string, names: readonly string[]): StrippedText =>
  StrippedText.strip(text, names);
