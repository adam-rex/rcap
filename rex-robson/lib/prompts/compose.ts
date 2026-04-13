/** Concatenate system prompt sections with blank lines; drops falsy entries. */
export function joinPromptSections(
  ...sections: (string | undefined | null | false)[]
): string {
  return sections
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim())
    .join("\n\n");
}
