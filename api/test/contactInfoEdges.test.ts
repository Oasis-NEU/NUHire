import { describe, expect, it } from 'vitest';
import { stripContactInfo } from '../src/config/contactInfo';
import { contactLeaks, NO_LEAKS } from './contactLeaks';

// The cases that got past an earlier version of the stripper, the text it must
// leave alone, generated contact details, and timing on hostile input. All of
// it is made up.

const strip = (text: string, names: readonly string[] = []) => stripContactInfo(text, names).text;

describe('stripContactInfo on details that once got through', () => {
  it.each([
    ['an en-dashed phone', '617–555–0134', '[PHONE]'],
    ['a phone with spaced dashes', '617 - 555 - 0134', '[PHONE]'],
    ['a phone with a soft hyphen in it', '617-555-\u00AD0134', '[PHONE]'],
    ['an Indian mobile without +', 'Mobile: 98765 43210', 'Mobile: [PHONE]'],
    ['a UK number without +', 'Tel 020 7946 0958', 'Tel [PHONE]'],
    ['a German mobile', 'Handy: 0151 2345 6789', 'Handy: [PHONE]'],
    ['a 00 international number', '0044 20 7946 0958', '[PHONE]'],
    ['a domain before a full stop', 'Portfolio: ng-designs.dev.', 'Portfolio: [URL].'],
    ['a link wrapped onto the next line', 'https://github.com/\njordan-rivera', '[URL]'],
    ['an @handle', 'Twitter @river-dev', 'Twitter [URL]'],
    ['a handle after a profile label', 'GitHub: river-dev', 'GitHub: [URL]'],
    ['a LinkedIn path after its label', 'LinkedIn: /in/jordan-rivera', 'LinkedIn: [URL]'],
    ['an .edu home page', 'ccs.neu.edu/~jordan', '[URL]'],
    ['an email spelled out', 'jordan [at] example [dot] com', '[EMAIL]'],
    ['an email with a zero-width space', 'jordan\u200B@example.com', '[EMAIL]'],
    ['an email with a ligature', 'jordan@ﬁrm.com', '[EMAIL]'],
    ['a street without a suffix', '12 Elm, Boston, MA 02115', '[ADDRESS]'],
    ['a city without a comma', 'Boston MA 02115', '[ADDRESS]'],
    ['a UK postcode', '10 Downing Street, London SW1A 2AA', '[ADDRESS], London [ADDRESS]'],
    ['a Canadian postcode', 'Toronto, ON M5V 3L9', 'Toronto, ON [ADDRESS]'],
  ])('removes %s', (_, text, expected) => {
    expect(strip(text)).toBe(expected);
  });
});

describe('stripContactInfo on names', () => {
  it.each([
    ['accents in the name, not the text', 'Maria Jose Garcia', ['María José García'], '[NAME]'],
    ['accents in the text, not the name', 'José García', ['Jose Garcia'], '[NAME]'],
    [
      'capitals, accents and a curly apostrophe',
      'MARÍA-JOSÉ O’CONNOR',
      ['María-José', "O'Connor"],
      '[NAME]',
    ],
    [
      'a hyphenated name written with a space',
      'Mary Kate wrote it',
      ['Mary-Kate'],
      '[NAME] wrote it',
    ],
    ['letters spaced out', 'J O R D A N  R I V E R A', ['Jordan', 'Rivera'], '[NAME]'],
    [
      'possessives',
      "Jordan's and Rivera’s notes",
      ['Jordan', 'Rivera'],
      "[NAME]'s and [NAME]’s notes",
    ],
    ['last name first, with an initial', 'RIVERA, JORDAN Q.', ['Jordan', 'Rivera'], '[NAME] Q.'],
    ['a name passed as "Last, First"', 'Rivera, Jordan', ['Rivera, Jordan'], '[NAME]'],
    ['a name tag word', 'Url Smith, see https://x.com/a', ['Url', 'Smith'], '[NAME], see [URL]'],
  ])('removes %s', (_, text, names, expected) => {
    expect(strip(text, names)).toBe(expected);
  });

  it.each([
    [
      'a word the spaced-out form could spell',
      'crossed the river a lot',
      ['Rivera'],
      'river a lot',
    ],
    ['a longer word that starts with the name', 'Wrote docs in Markdown', ['Mark'], 'Markdown'],
    ['a short name used as a word', 'An Nguyen is an intern', ['An', 'Nguyen'], 'an intern'],
    ['a common-word name in lowercase', 'park ranger at Grace Hopper', ['Park'], 'park ranger'],
  ])('keeps %s', (_, text, names, kept) => {
    expect(strip(text, names)).toContain(kept);
  });

  it('ignores names with nothing in them to match', () => {
    expect(strip('Jordan', ['', '  ', 'J.'])).toBe('Jordan');
  });
});

describe('stripContactInfo leaves resume content alone', () => {
  it.each([
    'GPA: 3.85/4.00',
    'January 2022 – May 2026',
    '2019 - 2023',
    '2021–2025',
    'Sept. 2023 – Present',
    '05/2022 – 08/2023',
    '10/2021 - 05/2023',
    '9:00 AM - 5:00 PM',
    '$120,000 budget',
    '1,234,567 users',
    'cut latency by 45%',
    '99.99% uptime',
    'CS 3500',
    'CS4500/5500',
    'Python 3.11',
    'React 18.2.0',
    'v2.4.1',
    'IPv4 192.168.0.1',
    'ISBN 978-0-596-52068-7',
    'NUID 001234567',
    'Class of 2026',
    'Node.js',
    'ASP.NET',
    'ASP.NET/C#',
    'Vue.js/React',
    'Socket.io',
    'Socket.IO/Express',
    'draw.io',
    'fast.ai',
    'C++',
    'C#',
    '.NET/C#',
    'deploy.sh',
    'README.md',
    'B.S./M.S.',
    'M.Eng/MBA',
    'Ph.D.',
    'e.g. Docker',
    'TCP/IP',
    'I/O',
    'and/or',
    'Boston, MA',
    'San Francisco, CA',
    'Oakland CA—IT Support Intern',
    'GitHub Actions, GitHub Pages',
    'Git/GitHub',
    'LinkedIn Learning',
    'Led 3 Engineers on the Main Street project',
    'Built 2 REST APIs',
    'AWS Certified (SAA-C03)',
    'A4 paper',
    'B2B sales',
    'COVID-19 tracker',
    'Worked at Acme. Built a CLI',
    'Interned [at] Acme. Built a CLI',
    "Dean's List",
    'May 2023',
    'Medium: Oil on canvas',
    'meet @ 5pm',
    'Summer 2021 - 2022',
    'Available: January - June 2024',
  ])('keeps %s', (text) => {
    expect(strip(text)).toBe(text);
  });

  it('keeps a year that ends the line above an address', () => {
    expect(strip('Available: June 2024\n700 S. Huntington Ave. #34\nBoston, MA 02130')).toBe(
      'Available: June 2024\n[ADDRESS]'
    );
  });
});

// mulberry32, so the generated cases are the same on every run.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatedResumes(count: number): string[] {
  const rand = random(42);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join('');
  const sep = () => pick(['-', '.', ' ', '', '–', '—', '/', ' - ', ' . ', ' – ', '‑', '−']);
  const phone = () => {
    const s = sep();
    return pick([
      () =>
        `${pick(['', '+1 ', '1-', '+1-', '+1'])}${pick([digits(3), `(${digits(3)})`])}${s}${digits(3)}${s}${digits(4)}`,
      () =>
        `+${digits(pick([1, 2, 3]))} ${digits(pick([2, 3]))} ${digits(pick([3, 4]))} ${digits(4)}`,
      () => `00${digits(2)} ${digits(2)} ${digits(4)} ${digits(4)}`,
      () => `0${digits(pick([2, 3, 4]))}${s}${digits(3)}${s}${digits(4)}`,
      () => `${pick(['6', '7', '8', '9'])}${digits(4)}${pick([' ', '-', ''])}${digits(5)}`,
    ])();
  };
  const local = () =>
    `${pick(['jordan', 'j.rivera', 'maria_l', 'dev.ng', 'a1b2'])}${pick(['', '+jobs', '.2026'])}`;
  const host = () =>
    pick(['example.com', 'mail.example.co.uk', 'husky.neu.edu', 'EXAMPLE.ORG', 'ex-ample.io']);
  const email = () => {
    const h = host();
    return pick([
      `${local()}@${h}`,
      `${local()} @ ${h}`,
      `mailto:${local()}@${h}`,
      `<${local()}@${h}>`,
      `${local()}@\n${h}`,
      `${local()}[at]${h.replace(/\./g, '[dot]')}`,
      `${local()}\u200B@${h}`,
    ]);
  };
  const user = () => pick(['jordan-rivera', 'river-dev', 'Pixel23', 'the-coder']);
  const url = () =>
    pick([
      `https://github.com/${user()}`,
      `http://www.${user()}.com`,
      `www.${user()}.dev`,
      `linkedin.com/in/${user()}`,
      `https://github.com/\n${user()}`,
      `${user()}.github.io`,
      `${user()}.dev.`,
      `(${user()}.me)`,
      `@${user()}`,
      `GitHub: ${user()}`,
      `ccs.neu.edu/~${user()}`,
      `about.me/${user()}`,
    ]);
  const layouts = [
    (p: string, e: string, u: string) => `Jordan Rivera\n${p} | ${e} | ${u}\nEXPERIENCE`,
    (p: string, e: string, u: string) => `CONTACT ${e} EDUCATION ${p} SKILLS Python ${u} PROJECTS`,
    (p: string, e: string, u: string) => `Phone: ${p}\nEmail: ${e}\nWeb: ${u}`,
    (p: string, e: string, u: string) => `Reach me at ${e}, call ${p}, or see ${u}.`,
  ];
  return Array.from({ length: count }, () => pick(layouts)(phone(), email(), url()));
}

describe('stripContactInfo on generated resumes', () => {
  const resumes = generatedResumes(1000);
  const users = ['jordan-rivera', 'river-dev', 'pixel23', 'the-coder'];

  it('the leak checks catch the details in every one before stripping', () => {
    for (const text of resumes) {
      const found = contactLeaks(text, ['Jordan', 'Rivera']);
      expect(found.phones.length + found.emails.length + found.urls.length).toBeGreaterThan(0);
    }
  });

  it('leaves no email, phone, link, handle or name in any of them', () => {
    for (const text of resumes) {
      const out = strip(text, ['Jordan', 'Rivera']);
      expect(contactLeaks(out, ['Jordan', 'Rivera'])).toEqual(NO_LEAKS);
      expect(users.filter((u) => out.toLowerCase().includes(u))).toEqual([]);
    }
  });

  it('gives the same text when run again on its own output', () => {
    for (const text of resumes) {
      const once = strip(text, ['Jordan', 'Rivera']);
      expect(strip(once, ['Jordan', 'Rivera'])).toBe(once);
    }
  });
});

describe('stripContactInfo on hostile input', () => {
  // A pattern that could start at every character of a long run took minutes
  // here, and Node runs nothing else while a regex does. Each of these takes
  // a few milliseconds now.
  it.each([
    ['letters', 'a'],
    ['dotted letters', 'a.'],
    ['hyphenated letters', 'a-'],
    ['dotted capitals', 'A.'],
    ['digits and spaces', '1 '],
    ['digits and dashes', '1-'],
    ['at signs', '@a'],
    ['an address local part', 'a.b_c+d%e-f'],
    ['spelled-out at', 'x [at] '],
    ['spaced letters', 'J O R D A N '],
    ['capitalised words', 'Aaaa '],
  ])('strips 100 KB of %s in under a second', (_, unit) => {
    const text = unit.repeat(Math.ceil(100_000 / unit.length));
    const start = performance.now();
    strip(text, ['Jordan', 'Rivera']);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
