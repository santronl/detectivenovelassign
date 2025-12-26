
import { Character } from '../types';

/**
 * Parses raw text lines into Character objects based on improved rules.
 * 
 * Rules:
 * 1. Process line by line.
 * 2. The beginning of the line is treated as the name (Hanzi and middle dots '·').
 * 3. Any punctuation separators (like ……, ——, :, space) are skipped.
 * 4. Everything after the separator is treated as character information/notes.
 */
export const parseCharacterList = (text: string): Character[] => {
  const lines = text.split('\n');
  const characters: Character[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Match name (Hanzi and dots) followed by a separator (punctuation/space) and then the rest
    // Regex: ^([\u4e00-\u9fa5·]+) -> Name
    // (?:[ \t\.\u2026\-\:\uff1a\u2014\uff0d\uff0c\uff1b\=\>\~_]+) -> Separator (non-capturing)
    // (.*)$ -> Info/Note
    const match = trimmed.match(/^([\u4e00-\u9fa5·]+)(?:[ \t\.\u2026\-\:\uff1a\u2014\uff0d\uff0c\uff1b\=\>\~_]+)(.*)$/);

    if (match) {
      const name = match[1].trim();
      const remarks = match[2] ? match[2].trim() : '';
      
      if (name) {
        characters.push({
          id: crypto.randomUUID(),
          name: name,
          note: remarks
        });
      }
    } else {
      // Fallback: Check if the whole line is just a name
      const nameOnly = trimmed.match(/^([\u4e00-\u9fa5·]+)$/);
      if (nameOnly) {
        characters.push({
          id: crypto.randomUUID(),
          name: nameOnly[1].trim(),
          note: ''
        });
      }
    }
  });

  return characters;
};
