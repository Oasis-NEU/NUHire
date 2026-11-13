// src/config/keywordMatch.ts
//
// Scores a resume against a posting's keywords. The whole rule:
//
//   score = round(100 * matched keywords / keywords), from 0 to 100.
//
// - A keyword matches when its words appear in the resume as whole words, in
//   order, ignoring case. "Java" does not match "JavaScript", and "Go" does not
//   match "good". A word keeps + and # and the dots inside it, so "C++", "C#"
//   and "Node.js" are words of their own, and a full stop is not.
// - A regular plural matches its singular either way: -s, -es and -ies, so
//   "database" matches "databases", "box" matches "boxes", and "technology"
//   matches "technologies".
// - A keyword matches its synonyms too (SYNONYMS below).
// - Keywords that differ only in case, plural or synonym count once, listed as
//   first given. A keyword with no words in it, such as "  ", is ignored.
// - No keywords scores 0, with both lists empty: there is nothing to match,
//   and a posting without keywords is not shown to students.
// - An empty resume matches nothing.

export interface KeywordMatch {
  score: number;
  /** Keywords found in the resume, as given and in the order given. */
  matched: string[];
  /** Keywords not found, as given and in the order given. */
  missed: string[];
}

// Spellings that mean the same skill. Lowercase; one group per line.
const SYNONYMS: readonly (readonly string[])[] = [['js', 'javascript']];

const WORD = /[\p{L}\p{N}][\p{L}\p{N}+#]*(?:\.[\p{L}\p{N}+#]+)*/gu;

const toWords = (text: string): string[] => text.toLowerCase().match(WORD) ?? [];

// The word and every singular it could be the regular plural of. Two words
// match when they share one, which works in both directions.
function forms(word: string): string[] {
  const out = [word];
  if (word.length > 4 && word.endsWith('ies')) out.push(`${word.slice(0, -3)}y`);
  if (/(?:[sxz]|ch|sh)es$/.test(word)) out.push(word.slice(0, -2));
  // Not -ss ("class"), and not a word of three letters or fewer ("aws", "ios").
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) out.push(word.slice(0, -1));
  return out;
}

const shareForm = (a: string[], b: string[]): boolean => a.some((form) => b.includes(form));

const samePhrase = (a: string[][], b: string[][]): boolean =>
  a.length === b.length && a.every((word, i) => shareForm(word, b[i]));

/** Every phrase a keyword can appear as: itself, or each of its synonyms. */
function spellings(words: string[]): string[][][] {
  const group = SYNONYMS.find((spelled) => spelled.includes(words.join(' ')));
  const phrases = group ? group.map(toWords) : [words];
  return phrases.map((phrase) => phrase.map(forms));
}

function appearsIn(resume: string[][], phrase: string[][]): boolean {
  for (let start = 0; start + phrase.length <= resume.length; start++) {
    if (phrase.every((word, i) => shareForm(word, resume[start + i]))) return true;
  }
  return false;
}

export function matchKeywords(resumeText: string, keywords: readonly string[]): KeywordMatch {
  const distinct: { label: string; spellings: string[][][] }[] = [];
  for (const keyword of keywords) {
    const words = toWords(keyword);
    if (words.length === 0) continue;
    const candidate = spellings(words);
    const duplicate = distinct.some((seen) =>
      seen.spellings.some((a) => candidate.some((b) => samePhrase(a, b)))
    );
    if (!duplicate) distinct.push({ label: keyword.trim(), spellings: candidate });
  }

  if (distinct.length === 0) return { score: 0, matched: [], missed: [] };

  const resume = toWords(resumeText).map(forms);
  const matched: string[] = [];
  const missed: string[] = [];
  for (const { label, spellings: phrases } of distinct) {
    if (phrases.some((phrase) => appearsIn(resume, phrase))) {
      matched.push(label);
    } else {
      missed.push(label);
    }
  }
  return { score: Math.round((100 * matched.length) / distinct.length), matched, missed };
}
