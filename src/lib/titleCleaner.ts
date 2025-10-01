/**
 * Title Cleaning Utility
 *
 * Removes unprofessional prefixes and formatting from document titles
 * Used during upload to standardize document naming
 *
 * Examples:
 * - "5a Introduction to CPM" → "Introduction to CPM"
 * - "12b_Church_Planting_Guide" → "Church Planting Guide"
 * - "___Book_of_Acts" → "Book of Acts"
 */

export function cleanTitle(title: string): string {
  if (!title) return ''

  return title
    .replace(/^\d+[a-z][\s_]*/i, '') // Remove numbered prefixes: "5a ", "5a_", "12b ", etc.
    .replace(/^[_\s]+/, '')          // Remove any remaining leading underscores and spaces
    .replace(/_/g, ' ')              // Convert underscores to spaces
    .replace(/\s+/g, ' ')            // Normalize multiple whitespace to single space
    .trim()                          // Remove leading/trailing whitespace
}
