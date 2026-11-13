// src/config/contactInfo.ts
//
// Replaces a resume's contact details with tags before its text leaves the
// server. A detail missed here is sent to Gemini, so every rule leans towards
// removing; what that costs is listed at the end.
//
// The text is made plain first. NFKC folds ligatures and full-width forms
// ("ﬁrm.com", "６１７"), and the invisible characters PDFs leave inside words
// (zero-width spaces, soft hyphens) are dropped, so neither can split a match.
// A link or email that a narrow column broke across lines, anywhere in it, is
// joined back (rejoinSplitLinks). Then, in this order, so an email is gone
// before a name inside it could be half-replaced:
//
//   [EMAIL]    addresses, with mailto:, a space either side of @, or spelled
//              out as "name [at] host [dot] com"
//   [URL]      anything with a scheme or www.; profile sites (LinkedIn,
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
// @, such as a Java annotation ("@Override"); any run of 10 or more digits;
// a lowercase word starting the line after a link, which reads as the link
// continuing.
//
// The patterns themselves are in contactPatterns.ts.

import {
  DASHES,
  escapeRegExp,
  EMAIL,
  SPELLED_EMAIL,
  URL_WITH_SCHEME,
  PROFILE_SITE,
  DOMAIN_WITH_PATH,
  PERSONAL_DOMAIN,
  isSkill,
  isLink,
  LINK_SIGNAL,
  STARTS_A_LINK,
  PROFILE_LABEL,
  HANDLE,
  NORTH_AMERICAN_PHONE,
  INTERNATIONAL_PHONE,
  NATIONAL_PHONE,
  FIVE_FIVE_PHONE,
  DIGIT_RUN,
  digitCount,
  STREET,
  CITY_STATE_ZIP,
  STREET_BEFORE_CITY,
  UK_POSTCODE,
  CANADIAN_POSTCODE,
  PO_BOX,
} from './contactPatterns';

export const TAGS = {
  email: '[EMAIL]',
  url: '[URL]',
  phone: '[PHONE]',
  address: '[ADDRESS]',
  name: '[NAME]',
} as const;

const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u2060\uFEFF]/g;

// A tag, keeping punctuation that ended the sentence rather than the detail.
const tagKeepingEnd = (tag: string) => (match: string) =>
  tag + (/[.,;:!?]+$/.exec(match)?.[0] ?? '');

// Whether a line break between `before` and `after` (the tokens either side)
// splits a link or an email, as a narrow column does: "github.com/jordan-ri"
// then "vera", or "jordan." then "rivera@example.com". A link that
// really ends its line is followed by a capitalised word, a number, or the
// next link.
function splitsALink(before: string, after: string): boolean {
  if (STARTS_A_LINK.test(after)) return false;
  if (LINK_SIGNAL.test(before)) {
    // A URL cannot continue into an email, nor into a whole link of its own.
    if (isLink(after) || (after.includes('@') && !before.includes('@'))) return false;
    return (
      /[./_\-@:#?=&%+~]$/.test(before) || (/^[\p{Ll}\p{N}]/u.test(after) && /\p{L}/u.test(after))
    );
  }
  // A whole link on the next line starts fresh ("Boston, MA 02108" then
  // "linkedin.com/in/…"), except an email whose local part wrapped before the
  // @, which leaves a lowercase fragment behind.
  if (isLink(after)) {
    return after.indexOf('@') > 0 && /^[\p{Ll}\p{N}._%+-]*\p{Ll}[\p{Ll}\p{N}._%+-]*$/u.test(before);
  }
  return isLink(before + after) && !isLink(before);
}

// Longer than any link a resume carries. A token past this is never rejoined,
// which also keeps the work per line bounded: rescanning a line that keeps
// growing was quadratic.
const MAX_LINK = 300;

// The token touching the start or end of a line, read at most MAX_LINK + 1
// characters in; '' when whitespace touches the edge.
function edgeToken(line: string, end: 'start' | 'end'): string {
  let length = 0;
  while (length <= MAX_LINK && length < line.length) {
    const char = end === 'end' ? line[line.length - 1 - length] : line[length];
    if (/\s/u.test(char)) break;
    length++;
  }
  return end === 'end' ? line.slice(line.length - length) : line.slice(0, length);
}

function rejoinSplitLinks(text: string): string {
  const lines = text.split('\n');
  const out = [lines[0]];
  for (const line of lines.slice(1)) {
    const before = edgeToken(out[out.length - 1], 'end');
    const after = edgeToken(line, 'start');
    const joinable = before && after && before.length + after.length <= MAX_LINK;
    if (joinable && splitsALink(before, after)) out[out.length - 1] += line;
    else out.push(line);
  }
  return out.join('\n');
}

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
      .flatMap((part) => [part, ...part.split(/[-\u2010\u2011]/)])
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
    let out = rejoinSplitLinks(text.normalize('NFKC').replace(INVISIBLE, ''));

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
