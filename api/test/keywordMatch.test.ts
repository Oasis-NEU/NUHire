import { describe, expect, it } from 'vitest';
import { matchKeywords } from '../src/config/keywordMatch';

// matchKeywords is the keyword screen's scoring rule; the rule itself is written
// out at the top of src/config/keywordMatch.ts.

describe('matchKeywords', () => {
  it('scores the share of keywords found, from 0 to 100, keeping their order and spelling', () => {
    expect(matchKeywords('Python and SQL on Linux', ['SQL', 'Go', 'Python', 'Rust'])).toEqual({
      score: 50,
      matched: ['SQL', 'Python'],
      missed: ['Go', 'Rust'],
    });
    expect(matchKeywords('python', ['python']).score).toBe(100);
    expect(matchKeywords('python', ['rust']).score).toBe(0);
  });

  it('rounds the score to a whole number', () => {
    expect(matchKeywords('java', ['java', 'go', 'rust']).score).toBe(33);
    expect(matchKeywords('java go', ['java', 'go', 'rust']).score).toBe(67);
  });

  it('ignores case on both sides', () => {
    expect(matchKeywords('Built a REST API in PYTHON', ['python', 'rest api']).matched).toEqual([
      'python',
      'rest api',
    ]);
    expect(matchKeywords('built in python', ['Python']).matched).toEqual(['Python']);
  });

  it('matches whole words only', () => {
    expect(matchKeywords('Wrote JavaScript', ['Java']).missed).toEqual(['Java']);
    expect(matchKeywords('a good team player', ['Go']).missed).toEqual(['Go']);
    expect(matchKeywords('C++ and C# developer', ['C']).missed).toEqual(['C']);
    expect(matchKeywords('Golang, Go and Java.', ['Go', 'Java']).matched).toEqual(['Go', 'Java']);
  });

  it('keeps C++, C# and Node.js as words, and drops a full stop', () => {
    expect(
      matchKeywords('Used C++, C# and Node.js. Then ASP.NET.', ['C++', 'C#', 'Node.js', 'ASP.NET'])
        .score
    ).toBe(100);
  });

  it('matches a keyword of several words only as those words in order', () => {
    expect(matchKeywords('machine learning research', ['Machine Learning']).score).toBe(100);
    expect(matchKeywords('learning about machines', ['machine learning']).score).toBe(0);
  });

  it('matches regular plurals in either direction', () => {
    const resume = 'Designed databases and APIs for new technologies, packed into boxes';
    expect(matchKeywords(resume, ['database', 'API', 'technology', 'box']).score).toBe(100);
    expect(
      matchKeywords('one database, one API, one technology, one box', [
        'databases',
        'APIs',
        'technologies',
        'boxes',
      ]).score
    ).toBe(100);
  });

  it('does not strip -s from -ss words or short words', () => {
    // Sass is a stylesheet language, SAS a statistics package; iOS is not IO.
    expect(matchKeywords('Styled with Sass', ['SAS']).missed).toEqual(['SAS']);
    expect(matchKeywords('Async IO in Rust', ['iOS']).missed).toEqual(['iOS']);
  });

  it('matches JS and JavaScript as synonyms, either way round', () => {
    expect(matchKeywords('Frontend in JavaScript', ['JS']).matched).toEqual(['JS']);
    expect(matchKeywords('Frontend in JS', ['JavaScript']).matched).toEqual(['JavaScript']);
  });

  it('counts a keyword once when it repeats by case, plural or synonym', () => {
    expect(matchKeywords('python', ['Python', 'python', 'Pythons'])).toEqual({
      score: 100,
      matched: ['Python'],
      missed: [],
    });
    expect(matchKeywords('', ['JS', 'JavaScript']).missed).toEqual(['JS']);
  });

  it('scores an empty resume 0, with every keyword missed', () => {
    expect(matchKeywords('', ['Python', 'SQL'])).toEqual({
      score: 0,
      matched: [],
      missed: ['Python', 'SQL'],
    });
    expect(matchKeywords('   \n  ', ['Python']).score).toBe(0);
  });

  it('scores an empty keyword list 0, with both lists empty', () => {
    expect(matchKeywords('Python and SQL', [])).toEqual({ score: 0, matched: [], missed: [] });
    expect(matchKeywords('Python and SQL', ['  ', '!!'])).toEqual({
      score: 0,
      matched: [],
      missed: [],
    });
  });
});
