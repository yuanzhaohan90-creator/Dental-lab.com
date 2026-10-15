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

// Presentation-only corrections match the known old text, so later CMS edits win.
const CASE_DESCRIPTION_CORRECTIONS = {
  'CASE-MV7NK8ZE-2E46FB': ['Explore a lower full-arch implant restoration workflow with digital design, framework inspection, occlusal views, model verification, and finished laboratory presentation.', 'Lower full-arch implant restoration documented through digital design, framework inspection, occlusal views and model verification.'],
  'CASE-MV6871W1-5EC0B5': ['Explore an upper and lower full-arch implant case featuring precision bars, full-zirconia restorations, CAD planning, prosthetic try-in and laboratory quality control.', 'Upper and lower full-arch zirconia restorations over precision bars, documented through CAD planning, prosthetic try-in and laboratory review.'],
  'CASE-MV23BZEE-45E2A2': ['Maxillary esthetic rehabilitation case documenting the initial condition, restoration morphology on a working model, laboratory review, and a digital smile-design proposal.', 'Maxillary esthetic restoration work showing the initial condition, restorations on a working model and a digital smile-design preview.'],
  'CASE-MUZGEHFM-B7F15D': ['Maxillary full-arch implant restoration case study showing digital design, Malo Bridge opaque-stage framework verification, intaglio review and final laboratory verification.', 'Maxillary full-arch implant work showing digital design, opaque-stage framework verification, intaglio review and laboratory quality checks.'],
  'CASE-MUXMID60-04B3BF': ['See a dual-arch full-arch implant case using zirconia restorations over split titanium bars, from digital planning and access review to final model verification.', 'Dual-arch zirconia restorations over split titanium bars, documented through digital planning, screw-access review and model verification.'],
  'CASE-MUDZ5E3H-37CB87': ['Explore a six-unit ultra-thin anterior veneer case by YZH Dental Lab, featuring digital esthetic planning, balanced tooth proportions, controlled ceramic thickness, and final model verification.', 'Six anterior ceramic veneers documented through digital esthetic planning, tooth-proportion review and working-model verification.']
};

function caseDescription(record, item) {
  const current = completeText(record.metaDescription || item.technicalSummary || item.summary || item.title, 160);
  const correction = CASE_DESCRIPTION_CORRECTIONS[record.id];
  return correction && record.metaDescription === correction[0] ? correction[1] : current;
}

module.exports = { completeText, caseSeoTitle, publicField, collectionTitle, caseDescription, CASE_DESCRIPTION_CORRECTIONS };
