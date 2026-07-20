const CANONICAL_BRAND_NAMES = Object.freeze({
  chabacco: "Chabacco",
  "chabacco mix": "Chabacco",
  "chabacco medium": "Chabacco",
  deus: "Deus",
  "deus perfume": "Deus",
  jent: "Jent",
  "jent cigar": "Jent",
  "trofimoff's": "Trofimoff's",
  "trofimoff's terror": "Trofimoff's",
  "trofimoff’s": "Trofimoff's",
  "trofimoff’s terror": "Trofimoff's",
});

export const normalizeBrandName = (value) => {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  return CANONICAL_BRAND_NAMES[trimmedValue.toLowerCase()] || trimmedValue;
};
