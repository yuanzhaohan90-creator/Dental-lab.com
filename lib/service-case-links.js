function caseTopics(record = {}) {
  const scope = [record.title, record.restorationType, record.material, record.category, ...(Array.isArray(record.tags) ? record.tags : [])].join(' ');
  return {
    fullArch: /full[- ]arch|all[- ]on[- ](?:x|4|6)/i.test(scope),
    bar: /\b(?:bars?|frameworks?|split[- ]bars?)\b/i.test(scope),
    implant: /implant|abutment|ti[- ]base/i.test(scope) && record.category !== 'Crown & Bridge',
    design: /\bcad\b|digital (?:design|planning)|exocad/i.test([scope, record.technicalSummary, record.cadDesign, record.software].join(' '))
  };
}

function relatedServices(record) {
  const topics = caseTopics(record);
  const links = [];
  if (topics.fullArch) links.push(['/services/full-arch', 'Full-Arch / All-on-X laboratory support']);
  else if (topics.implant) links.push(['/services/implant', 'Implant crown and abutment support']);
  else if (/Veneers|Crown & Bridge/.test(record.category || '') && record.title?.toLowerCase() !== 'implant') links.push(['/services/crown-bridge', 'Crown, bridge and esthetic laboratory support']);
  if (topics.bar) links.push(['/implant-bar-design', 'Implant bar and framework design support']);
  if (topics.design) {
    links.push(['/services/design-only', 'Design-only service options']);
    links.push(['/exocad-design-outsourcing', 'Exocad outsourcing options']);
  }
  return links;
}

function serviceCases(page, records = []) {
  return records.filter(record => {
    if (record.status !== 'published' || !record.slug || !record.coverImage?.url) return false;
    const topics = caseTopics(record);
    if (page === 'fullArch') return topics.fullArch;
    if (page === 'implantBarDesign') return topics.bar;
    if (page === 'implant') return topics.implant && !topics.fullArch;
    if (page === 'designOnly' || page === 'exocadOutsourcing') return topics.design;
    return false;
  });
}

module.exports = { caseTopics, relatedServices, serviceCases };
