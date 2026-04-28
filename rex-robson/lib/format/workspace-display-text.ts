/**
 * Strip stray Markdown / separator noise from Rex or pasted workspace copy.
 */
export function stripWorkspaceMarkdownDecorators(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n").trim();
  s = s.replace(/\*\*([\s\S]*?)\*\*/g, "$1");
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  s = s.replace(/__([^_\n]+)__/g, "$1");
  s = s.replace(/\s*<>\s*/g, " ↔ ");
  s = s.replace(/\s*<\s*>\s*/g, " ↔ ");
  s = s.replace(/\*\*/g, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
