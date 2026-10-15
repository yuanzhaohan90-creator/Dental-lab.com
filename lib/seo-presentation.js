function completeText(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit);
  return (/\s/.test(text[limit] || "") ? prefix : prefix.replace(/\s+\S*$/, "")).replace(/[\s,;:|-]+$/, "");
}

function caseSeoTitle(value) {
  const title = String(value || "").replace(/(?:\s*[|–—-]\s*YZH(?:\s+Dental\s+Lab)?)+\s*$/i, "").trim();
  return `${completeText(title, 65)} | YZH Dental Lab`;
}

function publicField(value) {
  return /not specified in the supplied case records/i.test(String(value || "")) ? "" : value;
}

function collectionTitle(value) {
  const title = String(value || "");
  if (/^YZH_Precision_Abutment_Grinding_Website_16x9$/i.test(title)) return "Precision Abutment Grinding";
  return title;
}

module.exports = { completeText, caseSeoTitle, publicField, collectionTitle };
