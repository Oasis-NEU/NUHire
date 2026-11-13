import { describe, expect, it } from 'vitest';
import { stripContactInfo } from '../src/config/contactInfo';
import { contactLeaks, NO_LEAKS } from './contactLeaks';

// Made-up resumes in the layouts resume parsers are known to get wrong. Each
// was printed to PDF with headless Chrome, as resume builders do, and its text
// extracted with unpdf the way extractPdfText does, so `text` is exactly what
// the stripper receives: columns interleaved, header and footer lines repeated,
// small capitals in capitals, letter spacing as spaces, links broken mid-word.

// The fixtures are extraction output kept verbatim: made-up names, handles run
// together, and words a column break cut in two. They are neither real terms
// for cspell.json nor typos to fix, so spelling is off for them alone.
// cspell:disable
const LAYOUTS = [
  {
    layout: 'a two-column page with contact details in a sidebar',
    names: ['Priya', 'Raman'],
    text: 'Priya\nRaman\nContact\npriya.raman@example.com\n(617) 555-0142\n88 Beacon Street, Apt 5\nBoston, MA 02108\nlinkedin.com/in/priya-raman\ngithub.com/praman-dev\nSkills\nPython, SQL, Tableau, Node.js,\nASP.NET\nExperience\nDataCo Analytics — Data Intern, Jan 2024 – Jun 2024\nCleaned 2M rows with pandas; cut report time by 40%.\nBuilt Tableau dashboards for 3 teams.\nEducation\nNortheastern University — B.S. Data Science, GPA 3.82/4.00, 2022 – 2026',
    details: [
      'priya.raman',
      '555-0142',
      '88 Beacon',
      'Apt 5',
      '02108',
      'priya-raman',
      'praman-dev',
    ],
    kept: [
      'Python, SQL, Tableau, Node.js',
      'ASP.NET',
      'DataCo Analytics',
      'Jan 2024 – Jun 2024',
      '2M rows',
      '40%',
      'GPA 3.82/4.00',
      '2022 – 2026',
    ],
  },
  {
    layout: 'contact details in table cells, labels in their own column',
    names: ['Marcus', 'O’Brien'],
    text: 'Marcus O’Brien\nSoftware Engineer Co-op\nEmail\nPhone\nWeb\nmarcus.obrien@husky.neu.edu\n+1 857.555.0193\nhttps://marcusob.dev\nSkills\nLanguages Java, C++, TypeScript\nTools Docker, Git/GitHub, AWS\nExperience\nAcme Robotics, Boston, MA — Software Co-op, Jul 2024 – Dec 2024\nShipped a fleet dashboard used by 120 operators.\nEducation\nNortheastern University — B.S. Computer Science, 2023 – 2027',
    details: ['marcus.obrien', 'husky.neu.edu', '857.555.0193', 'marcusob'],
    kept: [
      'Software Engineer Co-op',
      'Java, C++, TypeScript',
      'Docker, Git/GitHub, AWS',
      'Acme Robotics',
      'Boston, MA',
      'Jul 2024 – Dec 2024',
      '120 operators',
    ],
  },
  {
    layout: 'contact details in a page header and footer, repeated on each page',
    names: ['Elena', 'Vasquez'],
    text: 'Elena Vasquez\nExperience\nNorthwind Health — Research Assistant, Sep 2023 – May 2024\nRan 14 user studies and wrote the summary report.\nAutomated survey cleaning in R.\nElena Vasquez · elena.vasquez@example.org · 617-555-0177\nProjects\nClinic Finder — React app with 1,200 monthly users.\nEducation\nNortheastern University — B.S. Health Science, 2022 – 2026\n45 Commonwealth Avenue, Unit 2, Boston, MA 02116 · www.elenavasquez.me',
    details: [
      'elena.vasquez',
      '617-555-0177',
      '45 Commonwealth',
      'Unit 2',
      '02116',
      'elenavasquez',
    ],
    kept: [
      'Northwind Health',
      'Sep 2023 – May 2024',
      '14 user studies',
      'Clinic Finder',
      '1,200 monthly users',
      '2022 – 2026',
    ],
  },
  {
    layout: 'icons and symbols in place of labels',
    names: ['Dev', 'Okafor'],
    text: 'Dev Okafor\n✉ dev.okafor@example.com ☎ 508-555-0164 ⌂ Cambridge, MA 02139 linkedin.com/in/devokafor 🔗\ndevokafor.github.io @devokafor\nExperience\nPixel Labs — Frontend Intern, May 2024 – Aug 2024\nRebuilt checkout in Vue.js; conversion up 12%.\nEducation\nNortheastern University — B.S. Computer Science, GPA 3.6/4.0',
    details: ['dev.okafor', '508-555-0164', '02139', 'devokafor'],
    kept: ['Pixel Labs', 'May 2024 – Aug 2024', 'Vue.js', '12%', 'GPA 3.6/4.0'],
  },
  {
    layout: 'small capitals, a letter-spaced name, ligatures and a link broken mid-word',
    names: ['Fiona', 'Flynn'],
    text: 'F I O N A F L Y N N\nFIONA.FLYNN@EXAMPLE.COM | (781) 555–0128 | 12 ELM STREET, SOMERVILLE, MA 02144\nPortfolio: https://fionaflynn-portfolio.n\netlify.app/projects/affinity-filters\nExperience\nOffice Shuffle — Workflow Intern, Jan 2025 – Jun 2025\nDefined and filed 30 efficiency fixes; finalized the offline flow.\nEducation\nNortheastern University — B.S. Business Administration, 2023 – 2027',
    details: [
      'fiona.flynn',
      '555–0128',
      '12 Elm',
      '02144',
      'fionaflynn',
      'etlify',
      'affinity-filters',
    ],
    kept: [
      'Office Shuffle',
      'Jan 2025 – Jun 2025',
      '30 efficiency fixes',
      'finalized the offline flow',
      '2023 – 2027',
    ],
  },
  {
    layout: 'a narrow column that breaks links and emails anywhere',
    names: ['Jordan', 'Rivera'],
    text: 'Jordan Rivera\ngithub.com/jordan-ri\nvera-builds\nhttps://www.linkedin.\ncom/in/jordanriverad\nev\njordan.rivera.portfoli\no@examplemail.co\nm\nhttps://jordanrivera.d\nev\ngitlab.com/jrivera-the-\ndeveloper\njordanrivera.portfolio@l\nongexamplemail.org\nExperience\nAcme — Intern, 2024',
    details: [
      'jordan-ri',
      'vera-builds',
      'jordanriverad',
      'portfoli',
      'examplemail',
      'jordanrivera.d',
      'the-',
      'developer',
      'ongexamplemail',
    ],
    kept: ['Experience', 'Acme — Intern, 2024'],
  },
];
// cspell:enable

describe('stripContactInfo on text extracted from real PDF layouts', () => {
  it.each(LAYOUTS)('removes every contact detail from $layout', ({ text, names, details }) => {
    const lower = text.toLowerCase();
    expect(details.filter((detail) => !lower.includes(detail.toLowerCase()))).toEqual([]);
    const out = stripContactInfo(text, names).text;
    expect(contactLeaks(out, names)).toEqual(NO_LEAKS);
    expect(details.filter((detail) => out.toLowerCase().includes(detail.toLowerCase()))).toEqual(
      []
    );
  });

  it.each(LAYOUTS)('keeps the resume content of $layout', ({ text, names, kept }) => {
    const out = stripContactInfo(text, names).text;
    expect(kept.filter((snippet) => !out.includes(snippet))).toEqual([]);
  });
});
