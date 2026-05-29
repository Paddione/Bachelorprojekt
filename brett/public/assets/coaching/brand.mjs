// A person with no `brand` is shown everywhere. A brand-tagged person is shown
// only on its own brand. Unknown brand fails safe (hides brand-tagged persons).
export function filterPersonsForBrand(persons, brand) {
  return (persons || []).filter((p) => !p.brand || p.brand === brand);
}
