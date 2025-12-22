
import { Character } from '../types';

/**
 * Parses raw text lines into Character objects based on strict rules.
 * 
 * Rules:
 * 1. Process line by line.
 * 2. Ignore all leading characters until the first Chinese Character (Hanzi) is found.
 * 3. Separation: Identify boundary between Chinese Characters and Numbers.
 * 4. Exception: Symbols `·` and `.` are part of the name.
 * 5. Extract 1st item after split as name.
 */
export const parseCharacterList = (text: string): Character[] => {
  const lines = text.split('\n');
  const characters: Character[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Regex Explanation:
    // ^.*?         -> Ignore leading characters (non-greedy)
    // ([\u4e00-\u9fa5·\.]+) -> Capture Group 1: Chinese characters, middle dots, dots.
    // (.*)$        -> Capture Group 2: Everything else (now treated as note/remarks)
    
    const match = trimmed.match(/^.*?([\u4e00-\u9fa5·\.]+)(.*)$/);

    if (match && match[1]) {
      const name = match[1].trim();
      const remarks = match[2] ? match[2].trim() : '';
      
      if (name.length > 0) {
        characters.push({
          id: crypto.randomUUID(),
          name: name,
          note: remarks // Text after name is now remarks/note
        });
      }
    }
  });

  return characters;
};
