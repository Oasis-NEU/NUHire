// src/config/contactInfo.ts
//
// Replaces a resume's contact details with tags before its text leaves the
// server. A detail missed here is sent to Gemini, so every rule leans towards
// removing; what that costs is listed at the end.
//
// The text is made plain first. NFKC folds ligatures and full-width forms
// ("ﬁrm.com", "６１７"), and the invisible characters PDFs leave inside words
// (zero-width spaces, soft hyphens) are dropped, so neither can split a match.
// Then, in this order, so an email is gone before a name inside it could be
// half-replaced:
//
//   [EMAIL]    addresses, with mailto:, a space either side of @, or spelled
//              out as "name [at] host [dot] com"
//   [URL]      anything with a scheme or www., including a link that wraps
//              onto the next line after / - or _; profile sites (LinkedIn,
//              GitHub and the others in PROFILE_HOSTS) with or without a path;
//              any domain followed by a path; a bare personal domain; the
//              value after a profile label such as "GitHub:"; an @handle
//   [PHONE]    North American numbers in any layout, with dots, slashes,
//              hyphens or any dash, and spaces around them; + and 00
//              international numbers of 8 to 15 digits after the prefix;
//              national numbers of 10 to 12 digits starting 0; mobile numbers
//              written 5 and 5; any run of 10 to 15 digits
//   [ADDRESS]  a numbered street with its suffix and unit; a numbered street
//              without a suffix when a city and zip follow it; "City, ST
//              12345" or "City, State 12345", commas optional; UK and Canadian
//              postcodes; PO boxes
//   [NAME]     each part of the names passed in, as a whole word, with or
//              without accents, with any apostrophe, and with its letters
//              spaced out ("J O R D A N")
//
// Names cannot be recognised in general, so the caller passes the candidate's
// own (the Candidates row). A different person named in the text, such as a
// reference, is not removed.
//
// What it removes that it should not: a name part that is also a word, like
// "May", wherever it is capitalised (a part of three letters or fewer, or one
// in COMMON_WORDS, is matched only capitalised or in capitals, so "an"
// survives a candidate named An, but other parts match in any case); a company
// written as a domain ("Amazon.com"); a city followed by a zip; a word after
// @, such as a Java annotation ("@Override"); any run of 10 or more digits.

export const TAGS = {
  email: '[EMAIL]',
  url: '[URL]',
  phone: '[PHONE]',
  address: '[ADDRESS]',
  name: '[NAME]',
} as const;

const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u2060\uFEFF]/g;

// A typed hyphen reaches us as any of these once a PDF has been through it.
const DASHES = '\\-\\u2010-\\u2015\\u2212';
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A tag, keeping punctuation that ended the sentence rather than the detail.
const tagKeepingEnd = (tag: string) => (match: string) =>
  tag + (/[.,;:!?]+$/.exec(match)?.[0] ?? '');

// Each pattern that starts with a run of word characters is anchored by a
// lookbehind for that same run, so it is tried once per run, not once per
// character of it. Without the anchor a long run with no @ in it took minutes,
// and Node does nothing else while a regex runs.
const EMAIL =
  /(?<![\p{L}\p{N}._%+-])(?:mailto:)?[\p{L}\p{N}._%+-]+\s?@\s?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/giu;
// A spelled-out "[dot]" may have spaces round it; a real dot must touch both
// words, so "[at] Acme. Built" is not read as an address.
const SPELLED_EMAIL =
  /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+\s*[[({]\s*at\s*[\])}]\s*[\p{L}\p{N}-]+(?:(?:\s*[[({]\s*dot\s*[\])}]\s*|\.)[\p{L}\p{N}-]+)+/giu;

const URL_CHAR = `[^\\s<>"'|()\\[\\]{}]`;
// A link PDF extraction broke across lines, at a / - or _.
const WRAPPED = `(?:(?<=[/_-])\\s*\\n\\s*${URL_CHAR}+)*`;
const NOT_INSIDE_A_WORD = `(?<![\\p{L}\\p{N}.@-])`;

const URL_WITH_SCHEME = new RegExp(
  `(?:(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*://|${NOT_INSIDE_A_WORD}www\\.)${URL_CHAR}+${WRAPPED}`,
  'giu'
);

const PROFILE_HOSTS = (
  'linkedin.com github.com github.io gitlab.com gitlab.io bitbucket.org ' +
  'behance.net dribbble.com medium.com substack.com twitter.com x.com ' +
  'instagram.com facebook.com youtube.com tiktok.com kaggle.com leetcode.com ' +
  'hackerrank.com stackoverflow.com codepen.io replit.com devpost.com angel.co ' +
  'wellfound.com about.me linktr.ee huggingface.co notion.site vercel.app ' +
  'netlify.app herokuapp.com pages.dev dev.to calendly.com'
).split(' ');
const PROFILE_SITE = new RegExp(
  `${NOT_INSIDE_A_WORD}(?:[\\p{L}\\p{N}-]+\\.)*(?:${PROFILE_HOSTS.map(escapeRegExp).join('|')})` +
    `(?:/${URL_CHAR}*${WRAPPED})?(?![\\p{L}\\p{N}-])`,
  'giu'
);

const DOMAIN_WITH_PATH = new RegExp(
  `${NOT_INSIDE_A_WORD}[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*` +
    `\\.(?:com|org|net|edu|gov|io|dev|me|co|app|ai|site|page|tech|xyz|info|us|uk|ca|de|in|eu|ly|to|tv|cc|gg|so)` +
    `/${URL_CHAR}*${WRAPPED}`,
  'giu'
);

// Not .net, .org, .js or .sh without a path: ASP.NET, Node.js and deploy.sh
// are skills. A full stop after the domain still ends it.
const PERSONAL_DOMAIN = new RegExp(
  `${NOT_INSIDE_A_WORD}[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*` +
    `\\.(?:com|dev|me|io|co|ai|site|page|xyz|tech|app)(?![\\p{L}\\p{N}-])(?!\\.[\\p{L}\\p{N}])`,
  'giu'
);
// Skills spelled like a domain, which keep their name with or without a path
// ("ASP.NET/C#").
const NOT_A_SITE = new Set(['socket.io', 'draw.io', 'fast.ai', 'asp.net', 'vb.net', 'ado.net']);
const isSkill = (match: string) => NOT_A_SITE.has(match.split('/')[0].toLowerCase());

// Not "Medium:", which an art resume uses for the material.
const PROFILE_LABEL =
  /\b(?:LinkedIn|GitHub|GitLab|Twitter|Instagram|Behance|Dribbble|Kaggle|LeetCode|HackerRank|Devpost|CodePen|Discord|Telegram|WhatsApp|Skype|Mastodon|Bluesky)\s*[:：]\s*(?!\[)([^\s|,;]+)/giu;
const HANDLE = /(?<![\p{L}\p{N}._%+@-])@[\p{L}\p{N}_](?:[\p{L}\p{N}_.-]{0,38}[\p{L}\p{N}_])?/gu;

// Between two groups of digits in a phone number: one separator, spaces round it.
const GAP = `\\s*(?:[./${DASHES}]\\s*)?`;
const NORTH_AMERICAN_PHONE = new RegExp(
  `(?<![\\d+])(?:\\+?\\s*1${GAP})?(?:\\(\\s*\\d{3}\\s*\\)|\\d{3})${GAP}\\d{3}${GAP}\\d{4}(?!\\d)`,
  'g'
);
const INTERNATIONAL_PHONE = new RegExp(
  `(?:\\+|(?<!\\d)00)\\s*\\d{1,3}(?:${GAP}\\(?\\s*\\d{1,5}\\s*\\)?){2,6}(?!\\d)`,
  'g'
);
const NATIONAL_PHONE = new RegExp(`(?<![\\d+])0\\d{2,4}(?:${GAP}\\d{2,8}){1,3}(?!\\d)`, 'g');
const FIVE_FIVE_PHONE = new RegExp(`(?<![\\d+])[6-9]\\d{4}${GAP}\\d{5}(?!\\d)`, 'g');
const DIGIT_RUN = /(?<!\d)\d{10,15}(?!\d)/g;
const digitCount = (text: string) => text.replace(/\D/g, '').length;

const STREET_SUFFIXES = (
  'Street St Avenue Ave Road Rd Boulevard Blvd Drive Dr Lane Ln Way Court Ct ' +
  'Place Pl Terrace Ter Parkway Pkwy Highway Hwy Square Sq Circle Cir Row Plaza ' +
  'Alley Trail Trl Crescent Loop Pike Path Walk Heights Hts Point Pt Close Mews'
).split(' ');
const SUFFIX = STREET_SUFFIXES.flatMap((suffix) => [suffix, suffix.toUpperCase()]).join('|');
// A street is on one line, and its words start with a letter or are an ordinal
// ("5th"). Otherwise "June 2024" ending one line and "700 Main St" starting
// the next read as a street numbered 2024.
const SAME_LINE = `[^\\S\\n]+`;
const WORD_IN_STREET = `(?:[A-Z][\\p{L}\\p{N}'’.-]*|\\d{1,4}(?:st|nd|rd|th|ST|ND|RD|TH))`;
const UNIT =
  `(?:,?[^\\S\\n]*(?:Apt|APT|Apartment|Unit|UNIT|Suite|SUITE|Ste|STE|Flat|FLAT|Floor|Fl|Room|Rm|#)` +
  `\\.?[^\\S\\n]*[\\p{L}\\p{N}-]+)?`;
const STREET = new RegExp(
  `\\b\\d{1,6}[A-Za-z]?(?:[${DASHES}]\\d{1,6})?${SAME_LINE}(?:${WORD_IN_STREET}${SAME_LINE}){0,4}(?:${SUFFIX})\\b\\.?` +
    `(?:${SAME_LINE}(?:N|S|E|W|NE|NW|SE|SW)\\b\\.?)?${UNIT}`,
  'gu'
);
// The zip may have wrapped onto the next line; the city and state may not.
const CITY_STATE_ZIP = new RegExp(
  `(?<![\\p{L}.'’-])[A-Z][\\p{L}.'’-]*(?:${SAME_LINE}[A-Z][\\p{L}.'’-]*){0,2},?${SAME_LINE}` +
    `(?:[A-Z]{2}|[A-Z][a-z]+(?:${SAME_LINE}[A-Z][a-z]+)?),?\\s+\\d{5}(?:-\\d{4})?(?!\\d)`,
  'gu'
);
// Run once a city line is a tag: "12 Elm, [ADDRESS]" is a street without a
// suffix, on the city's line or the one above it.
const STREET_BEFORE_CITY = new RegExp(
  `\\b\\d{1,6}[A-Za-z]?${SAME_LINE}(?:${WORD_IN_STREET}${SAME_LINE}){0,3}${WORD_IN_STREET}${UNIT},?\\s*(?=\\[ADDRESS\\])`,
  'gu'
);
const UK_POSTCODE = /\b(?:[A-Z]{1,2}\d[A-Z\d]?|GIR)\s*\d[A-Z]{2}\b/g;
const CANADIAN_POSTCODE = /\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/g;
const PO_BOX = /\b(?:P\.?\s?O\.?|Post\s+Office)\s*Box\s+\d+\b/gi;

// Name parts that are also everyday words, matched only capitalised or in
// capitals so the word survives in lowercase.
const COMMON_WORDS = new Set(
  (
    'and april art august autumn banks bell bill black brook cash chase cook dawn ' +
    'dean faith field frank gene grace grant gray green grey hall hope hunter ' +
    'iris ivy jade joy june king lane long love mark max may miles north page ' +
    'park price reed rice rich river rose rush sage south star stone summer sunny ' +
    'west white will winter wood woods young'
  ).split(' ')
);
const APOSTROPHES = "'’‘`ʼ";

const letterPattern = (letter: string) =>
  APOSTROPHES.includes(letter)
    ? `[${APOSTROPHES}]`
    : letter === '-'
      ? `[${DASHES}]`
      : `${escapeRegExp(letter)}\\p{M}*`;

// One spelling of a name part: as written, or every letter spaced out.
const spelling = (letters: string[]) => {
  const compact = letters.map(letterPattern).join('');
  return letters.length >= 3
    ? `(?:${compact}|${letters.map(letterPattern).join('[ \\u00A0]')})`
    : compact;
};

function namePattern(part: string): RegExp {
  const bare = part.normalize('NFD').replace(/\p{M}/gu, '');
  const exactCase = bare.length <= 3 || COMMON_WORDS.has(bare.toLowerCase());
  const body = exactCase
    ? `(?:${spelling([...(bare[0].toUpperCase() + bare.slice(1).toLowerCase())])}|${spelling([...bare.toUpperCase()])})`
    : spelling([...bare]);
  // Not inside a tag already placed: a candidate named Url must not become "[[NAME]]".
  return new RegExp(`(?<![\\p{L}\\p{N}[])${body}(?![\\p{L}\\p{N}\\]])`, exactCase ? 'gu' : 'giu');
}

const nameParts = (names: readonly string[]) =>
  new Set(
    names
      .flatMap((name) => name.split(/\s+/))
      .flatMap((part) => [part, ...part.split(/[-‐‑]/)])
      .map((part) => part.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
      .filter((part) => part.replace(/[^\p{L}]/gu, '').length >= 2)
  );

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
    let out = text.normalize('NFKC').replace(INVISIBLE, '');

    out = out.replace(EMAIL, TAGS.email).replace(SPELLED_EMAIL, TAGS.email);

    out = out
      .replace(URL_WITH_SCHEME, tagKeepingEnd(TAGS.url))
      .replace(PROFILE_SITE, tagKeepingEnd(TAGS.url))
      .replace(DOMAIN_WITH_PATH, (match) =>
        isSkill(match) ? match : tagKeepingEnd(TAGS.url)(match)
      )
      .replace(PERSONAL_DOMAIN, (domain) => (isSkill(domain) ? domain : TAGS.url))
      .replace(PROFILE_LABEL, (match, value: string) => match.slice(0, -value.length) + TAGS.url)
      .replace(HANDLE, TAGS.url);

    // Digits counted after a + or 00 prefix, so a 9-digit ID starting 00 is
    // not read as an international number.
    const phone = (min: number, max: number) => (match: string) => {
      const digits = digitCount(match.replace(/^(?:\+|00)/, ''));
      return digits >= min && digits <= max ? TAGS.phone : match;
    };
    out = out
      .replace(INTERNATIONAL_PHONE, phone(8, 15))
      .replace(NORTH_AMERICAN_PHONE, TAGS.phone)
      .replace(NATIONAL_PHONE, phone(10, 12))
      .replace(FIVE_FIVE_PHONE, TAGS.phone)
      .replace(DIGIT_RUN, TAGS.phone);

    out = out
      .replace(STREET, TAGS.address)
      .replace(CITY_STATE_ZIP, TAGS.address)
      .replace(PO_BOX, TAGS.address)
      .replace(UK_POSTCODE, TAGS.address)
      .replace(CANADIAN_POSTCODE, TAGS.address);
    out = collapse(out.replace(STREET_BEFORE_CITY, TAGS.address), TAGS.address);

    // Matched on the decomposed text, so a name passed as "José" also finds
    // "Jose", and "Jose" finds "José".
    out = out.normalize('NFD');
    for (const part of nameParts(names)) {
      out = out.replace(namePattern(part), TAGS.name);
    }
    return new StrippedText(collapse(out, TAGS.name).normalize('NFC'));
  }
}

/** The resume text with names, emails, phones, addresses and links replaced by tags. */
export const stripContactInfo = (text: string, names: readonly string[]): StrippedText =>
  StrippedText.strip(text, names);
