export function filterUniqueLocations(rows) {
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    const key = `${row.S0202}-${row.S0204}-${row.S0206}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(row);  // keep only the first matching one
    }
  }

  return result;
}