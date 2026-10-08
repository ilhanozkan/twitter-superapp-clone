/**
 * Image URLs a tweet may use: https URLs, or paths served by this app
 * ("/media/x.svg"); never javascript:, data: or //host. Shared by the API's
 * validation and the composer, so both accept exactly the same values.
 */
export function isSafeImageUrl(value: string): boolean {
  // Browsers drop tabs and newlines inside URLs, so "/\t/evil.example" would
  // load from //evil.example: refuse whitespace and control characters.
  if (/[\s\u0000-\u001F\u007F-\u009F]/.test(value)) return false;
  if (value.startsWith("/"))
    return !value.startsWith("//") && !value.includes("\\");
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
