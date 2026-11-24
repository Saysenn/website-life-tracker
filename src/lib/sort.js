/** Case-insensitive A to Z by `name`, like SQL's ORDER BY lower(name). */
export function sortByName(rows) {
  return [...rows].sort((a, b) => {
    const left = (a.name ?? "").toLowerCase();
    const right = (b.name ?? "").toLowerCase();
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
