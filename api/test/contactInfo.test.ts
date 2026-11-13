import { describe, expect, it, vi } from 'vitest';
import { stripContactInfo, TAGS } from '../src/config/contactInfo';
import { askGemini, GeminiClient } from '../src/config/gemini';

// Everything sent to Gemini goes through stripContactInfo. These resumes are
// made up, in three layouts PDF extraction produces. The leak checks below
// are deliberately blunter than the stripper's own patterns, so they catch
// what it misses rather than agreeing with it.

const SINGLE_COLUMN = {
  names: ['Jordan', 'Rivera'],
  text: `Jordan Q. Rivera
12 Elm Street, Apt 3B, Boston, MA 02115 | (617) 555-0134 | jordan.rivera@example.com
linkedin.com/in/jordan-rivera | https://github.com/jrivera
EDUCATION
Northeastern University, Boston, MA — B.S. Computer Science, GPA 3.85/4.00, 2021 – 2025
EXPERIENCE
Acme Robotics, Software Co-op, Jan 2024 – Jun 2024
Built a dashboard in Node.js and ASP.NET; Rivera's tool cut triage time by 30%.`,
};

const TWO_COLUMN = {
  names: ['Maria Lopez'],
  text: `MARIA LOPEZ EXPERIENCE CONTACT DataCo Analytics, Data Intern +1 857.555.0102
Cleaned 2M rows with pandas maria.lopez+jobs@mail.example.co.uk Built Tableau dashboards
www.maria-lopez.me PO Box 4521, Cambridge, MA, 02139 SKILLS Python SQL C++ Socket.io
EDUCATION Northeastern University 2022 - 2026 Lopez Lab research assistant`,
};

const LABELLED = {
  names: ['Dev', 'Ng'],
  text: `Name: Dev Ng
Email: dev_ng @ example.org   Alt: mailto:dng@example.net
Phone: 617-555-0177   UK: +44 20 7946 0958
Address: 45 Commonwealth Avenue, Unit 2, Boston, MA 02116
Portfolio: ng-designs.dev   Website: https://ng.example.com/portfolio?ref=resume   Blog: dng.github.io
Skills: Figma, JavaScript, React; Location preference: Boston, MA`,
};

const LAYOUTS = { SINGLE_COLUMN, TWO_COLUMN, LABELLED };

const leaks = (text: string, names: readonly string[]) => ({
  emails: text.match(/@/g) ?? [],
  phones: text.match(/(?:\d[\s().+-]*){10,}/g) ?? [],
  urls:
    text
      .match(
        /https?:|www\.|mailto:|linkedin|github|[\p{L}\p{N}-]+\.(?:com|org|net|io|dev|me|co|uk)(?![\p{L}.])/giu
      )
      ?.filter((hit) => hit.toLowerCase() !== 'socket.io' && hit.toLowerCase() !== 'asp.net') ?? [],
  names: names
    .flatMap((name) => name.split(/\s+/))
    .filter((part) => new RegExp(`\\b${part}\\b`, 'i').test(text)),
});

const NO_LEAKS = { emails: [], phones: [], urls: [], names: [] };

describe('stripContactInfo', () => {
  it('the leak checks catch every detail in the raw resumes', () => {
    for (const { text, names } of Object.values(LAYOUTS)) {
      const found = leaks(text, names);
      expect(found.emails.length).toBeGreaterThan(0);
      expect(found.phones.length).toBeGreaterThan(0);
      expect(found.urls.length).toBeGreaterThan(0);
      expect(found.names.length).toBeGreaterThan(0);
    }
  });

  for (const [layout, { text, names }] of Object.entries(LAYOUTS)) {
    it(`leaves no email, phone, URL or name in the ${layout.toLowerCase().replace('_', ' ')} layout`, () => {
      expect(leaks(stripContactInfo(text, names).text, names)).toEqual(NO_LEAKS);
    });
  }

  it('tags each kind of detail', () => {
    const { text } = stripContactInfo(SINGLE_COLUMN.text, SINGLE_COLUMN.names);
    expect(text.split('\n').slice(0, 3)).toEqual([
      TAGS.name,
      `${TAGS.address} | ${TAGS.phone} | ${TAGS.email}`,
      `${TAGS.url} | ${TAGS.url}`,
    ]);
  });

  it('removes street addresses, city and zip lines, and PO boxes', () => {
    expect(stripContactInfo(LABELLED.text, LABELLED.names).text).toContain(
      `Address: ${TAGS.address}\n`
    );
    expect(stripContactInfo(TWO_COLUMN.text, TWO_COLUMN.names).text).toContain(
      `${TAGS.url} ${TAGS.address} SKILLS`
    );
    expect(stripContactInfo('Methuen, MA 01844', []).text).toBe(TAGS.address);
  });

  it('keeps what a screen needs: skills, grades, dates and a plain city', () => {
    const single = stripContactInfo(SINGLE_COLUMN.text, SINGLE_COLUMN.names).text;
    for (const kept of [
      'Node.js',
      'ASP.NET',
      'GPA 3.85/4.00',
      '2021 – 2025',
      'Jan 2024 – Jun 2024',
      'by 30%',
    ]) {
      expect(single).toContain(kept);
    }
    expect(single).toContain('Northeastern University, Boston, MA');
    const twoColumn = stripContactInfo(TWO_COLUMN.text, TWO_COLUMN.names).text;
    for (const kept of ['C++', 'Socket.io', '2M rows', '2022 - 2026']) {
      expect(twoColumn).toContain(kept);
    }
    expect(stripContactInfo(LABELLED.text, LABELLED.names).text).toContain(
      'Location preference: Boston, MA'
    );
  });

  it('removes a name in any case, possessive included, but only the names it is given', () => {
    expect(stripContactInfo("RIVERA, Jordan. Rivera's notes", ['Jordan', 'Rivera']).text).toBe(
      `${TAGS.name}. ${TAGS.name}'s notes`
    );
    expect(stripContactInfo('Reference: Pat Kim', ['Jordan']).text).toBe('Reference: Pat Kim');
  });

  it('leaves text with nothing to strip as it was', () => {
    expect(stripContactInfo('', []).text).toBe('');
    expect(stripContactInfo('Python, SQL and Linux', ['Jordan']).text).toBe(
      'Python, SQL and Linux'
    );
  });
});

describe('askGemini', () => {
  // Fails if anything sends Gemini a resume that still has contact details.
  it('never hands the Gemini client unstripped text', async () => {
    const generate = vi.fn(async () => 'summary');
    const client: GeminiClient = { generate };
    for (const { text, names } of Object.values(LAYOUTS)) {
      expect(await askGemini(client, 'Summarise this resume.', text, names)).toBe('summary');
    }
    expect(generate).toHaveBeenCalledTimes(3);
    for (const [[instructions, resume], { names }] of generate.mock.calls.map(
      (call, i) => [call, Object.values(LAYOUTS)[i]] as const
    )) {
      expect(instructions).toBe('Summarise this resume.');
      expect(leaks(resume.text, names)).toEqual(NO_LEAKS);
    }
  });
});
