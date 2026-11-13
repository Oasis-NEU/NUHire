// src/config/contactPatterns.ts
//
// The patterns stripContactInfo matches. The rules they implement, and the
// order they run in, are described at the top of contactInfo.ts.

// A typed hyphen reaches us as any of these once a PDF has been through it.
export const DASHES = '\\-\\u2010-\\u2015\\u2212';
export const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Each pattern that starts with a run of word characters is anchored by a
// lookbehind for that same run, so it is tried once per run, not once per
// character of it. Without the anchor a long run with no @ in it took minutes,
// and Node does nothing else while a regex runs.
export const EMAIL =
  /(?<![\p{L}\p{N}._%+-])(?:mailto:)?[\p{L}\p{N}._%+-]+\s?@\s?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/giu;
// A spelled-out "[dot]" may have spaces round it; a real dot must touch both
// words, so "[at] Acme. Built" is not read as an address.
export const SPELLED_EMAIL =
  /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+\s*[[({]\s*at\s*[\])}]\s*[\p{L}\p{N}-]+(?:(?:\s*[[({]\s*dot\s*[\])}]\s*|\.)[\p{L}\p{N}-]+)+/giu;

const URL_CHAR = `[^\\s<>"'|()\\[\\]{}]`;
// A link PDF extraction broke across lines, at a / - or _.
const WRAPPED = `(?:(?<=[/_-])\\s*\\n\\s*${URL_CHAR}+)*`;
const NOT_INSIDE_A_WORD = `(?<![\\p{L}\\p{N}.@-])`;

export const URL_WITH_SCHEME = new RegExp(
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
export const PROFILE_SITE = new RegExp(
  `${NOT_INSIDE_A_WORD}(?:[\\p{L}\\p{N}-]+\\.)*(?:${PROFILE_HOSTS.map(escapeRegExp).join('|')})` +
    `(?:/${URL_CHAR}*${WRAPPED})?(?![\\p{L}\\p{N}-])`,
  'giu'
);

export const DOMAIN_WITH_PATH = new RegExp(
  `${NOT_INSIDE_A_WORD}[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*` +
    `\\.(?:com|org|net|edu|gov|io|dev|me|co|app|ai|site|page|tech|xyz|info|us|uk|ca|de|in|eu|ly|to|tv|cc|gg|so)` +
    `/${URL_CHAR}*${WRAPPED}`,
  'giu'
);

// Not .net, .org, .js or .sh without a path: ASP.NET, Node.js and deploy.sh
// are skills. A full stop after the domain still ends it.
export const PERSONAL_DOMAIN = new RegExp(
  `${NOT_INSIDE_A_WORD}[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*` +
    `\\.(?:com|dev|me|io|co|ai|site|page|xyz|tech|app)(?![\\p{L}\\p{N}-])(?!\\.[\\p{L}\\p{N}])`,
  'giu'
);
// Skills spelled like a domain, which keep their name with or without a path
// ("ASP.NET/C#").
const NOT_A_SITE = new Set(['socket.io', 'draw.io', 'fast.ai', 'asp.net', 'vb.net', 'ado.net']);
export const isSkill = (match: string) => NOT_A_SITE.has(match.split('/')[0].toLowerCase());

const whole = (pattern: RegExp) =>
  new RegExp(`^(?:${pattern.source})$`, pattern.flags.replace('g', ''));
const LINK_SHAPES = [EMAIL, URL_WITH_SCHEME, PROFILE_SITE, DOMAIN_WITH_PATH, PERSONAL_DOMAIN].map(
  whole
);
export const isLink = (token: string) =>
  !isSkill(token) && LINK_SHAPES.some((shape) => shape.test(token));
export const LINK_SIGNAL = /:\/\/|^www\.|@|\//i;
export const STARTS_A_LINK = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i;

// Not "Medium:", which an art resume uses for the material.
export const PROFILE_LABEL =
  /\b(?:LinkedIn|GitHub|GitLab|Twitter|Instagram|Behance|Dribbble|Kaggle|LeetCode|HackerRank|Devpost|CodePen|Discord|Telegram|WhatsApp|Skype|Mastodon|Bluesky)\s*[:：]\s*(?!\[)([^\s|,;]+)/giu;
export const HANDLE =
  /(?<![\p{L}\p{N}._%+@-])@[\p{L}\p{N}_](?:[\p{L}\p{N}_.-]{0,38}[\p{L}\p{N}_])?/gu;

// Between two groups of digits in a phone number: one separator, spaces round it.
const GAP = `\\s*(?:[./${DASHES}]\\s*)?`;
export const NORTH_AMERICAN_PHONE = new RegExp(
  `(?<![\\d+])(?:\\+?\\s*1${GAP})?(?:\\(\\s*\\d{3}\\s*\\)|\\d{3})${GAP}\\d{3}${GAP}\\d{4}(?!\\d)`,
  'g'
);
export const INTERNATIONAL_PHONE = new RegExp(
  `(?:\\+|(?<!\\d)00)\\s*\\d{1,3}(?:${GAP}\\(?\\s*\\d{1,5}\\s*\\)?){2,6}(?!\\d)`,
  'g'
);
export const NATIONAL_PHONE = new RegExp(`(?<![\\d+])0\\d{2,4}(?:${GAP}\\d{2,8}){1,3}(?!\\d)`, 'g');
export const FIVE_FIVE_PHONE = new RegExp(`(?<![\\d+])[6-9]\\d{4}${GAP}\\d{5}(?!\\d)`, 'g');
export const DIGIT_RUN = /(?<!\d)\d{10,15}(?!\d)/g;
export const digitCount = (text: string) => text.replace(/\D/g, '').length;

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
export const STREET = new RegExp(
  `\\b\\d{1,6}[A-Za-z]?(?:[${DASHES}]\\d{1,6})?${SAME_LINE}(?:${WORD_IN_STREET}${SAME_LINE}){0,4}(?:${SUFFIX})\\b\\.?` +
    `(?:${SAME_LINE}(?:N|S|E|W|NE|NW|SE|SW)\\b\\.?)?${UNIT}`,
  'gu'
);
// The zip may have wrapped onto the next line; the city and state may not.
export const CITY_STATE_ZIP = new RegExp(
  `(?<![\\p{L}.'’-])[A-Z][\\p{L}.'’-]*(?:${SAME_LINE}[A-Z][\\p{L}.'’-]*){0,2},?${SAME_LINE}` +
    `(?:[A-Z]{2}|[A-Z][a-z]+(?:${SAME_LINE}[A-Z][a-z]+)?),?\\s+\\d{5}(?:-\\d{4})?(?!\\d)`,
  'gu'
);
// Run once a city line is a tag: "12 Elm, [ADDRESS]" is a street without a
// suffix, on the city's line or the one above it.
export const STREET_BEFORE_CITY = new RegExp(
  `\\b\\d{1,6}[A-Za-z]?${SAME_LINE}(?:${WORD_IN_STREET}${SAME_LINE}){0,3}${WORD_IN_STREET}${UNIT},?\\s*(?=\\[ADDRESS\\])`,
  'gu'
);
export const UK_POSTCODE = /\b(?:[A-Z]{1,2}\d[A-Z\d]?|GIR)\s*\d[A-Z]{2}\b/g;
export const CANADIAN_POSTCODE = /\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/g;
export const PO_BOX = /\b(?:P\.?\s?O\.?|Post\s+Office)\s*Box\s+\d+\b/gi;
