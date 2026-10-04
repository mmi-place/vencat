// Recover UTF-8 bytes accidentally read as Windows-1252/Latin-1.
// Decode individual valid sequences to preserve correctly encoded neighbouring text.
const windows1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
const decoder = new TextDecoder('utf-8', { fatal: true });
function byte(char: string): number {
  const code = char.charCodeAt(0);
  if (code <= 255) return code;
  const index = windows1252.indexOf(char);
  return index < 0 ? -1 : 128 + index;
}
export function repairText(value: string): string {
  for (let pass = 0; pass < 3; pass++) {
    let result = '';
    for (let index = 0; index < value.length; index++) {
      const first = byte(value[index]!);
      const length = first >= 194 && first <= 223 ? 2 : first >= 224 && first <= 239 ? 3 : first >= 240 && first <= 244 ? 4 : 0;
      const bytes = Array.from({ length }, (_, offset) => byte(value[index + offset] ?? '\uffff'));
      if (length && bytes.slice(1).every(part => part >= 128 && part <= 191)) {
        try {
          result += decoder.decode(new Uint8Array(bytes));
          index += length - 1;
          continue;
        } catch { /* Preserve invalid UTF-8 rather than guessing a character. */ }
      }
      result += value[index];
    }
    if (result === value) break;
    value = result;
  }
  return value;
}
