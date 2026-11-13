// Blunt checks for contact details left in stripped text, shared by the
// contactInfo tests. They are deliberately cruder than the stripper's own
// patterns, so they catch what it misses rather than agreeing with it.

// Skills that look like a domain, which the stripper keeps on purpose.
const SKILLS = new Set(['asp.net', 'socket.io']);

const bare = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '');

export function contactLeaks(text: string, names: readonly string[] = []) {
  const plain = bare(text);
  return {
    emails: text.match(/@|\[at\]|\(at\)/gi) ?? [],
    phones: text.match(/(?:\d[\s().+/\-‐-―−]*){10,}/g) ?? [],
    urls: (
      text.match(
        /https?:|www\.|mailto:|linkedin\.|github\.(?:com|io)|\/in\/|[\p{L}\p{N}-]+\.(?:com|org|net|io|dev|me|co|uk|edu|app)(?![\p{L}.])/giu
      ) ?? []
    ).filter((hit) => !SKILLS.has(hit.toLowerCase())),
    names: names
      .flatMap((name) => name.split(/[\s-]+/))
      .map((part) => bare(part).replace(/[^\p{L}']/gu, ''))
      .filter((part) => part.length >= 2)
      .filter((part) => new RegExp(`(?<!\\p{L})${part}(?!\\p{L})`, 'iu').test(plain)),
  };
}

export const NO_LEAKS = { emails: [], phones: [], urls: [], names: [] };
