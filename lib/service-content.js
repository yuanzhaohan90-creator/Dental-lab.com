const { serviceCases } = require('./service-case-links');
const { breadcrumb, schemaScript } = require('./public-schema');
const escape = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const SERVICES = {
  fullArch: {
    path: '/services/full-arch', name: 'Full-Arch / All-on-X',
    description: 'Laboratory support for full-arch design, provisional restorations, zirconia and bar-supported restorative workflows.',
    sections: [
      ['What We Support', 'Provisional and definitive full-arch laboratory support, from submitted records through design review and the agreed production path. The clinician retains responsibility for treatment decisions.', ['PMMA provisional workflows based on the supplied records.', 'Zirconia restorations and titanium bar-supported options where specified.', 'Review of restorative space, screw access and implant component information.']],
      ['Design / Review Workflow', 'Confirm the records before committing to production.', ['Send scans, bite, photos, prescription and implant component information.', 'Review missing records, restorative space, material path and approval requirements.', 'Review CAD views and technical questions with the partner lab when approval is required.', 'Proceed through the agreed laboratory workflow and final quality checks.']]
    ],
    links: [['/implant-bar-design', 'Review bar and framework CAD design'], ['/workflow', 'See the file-to-delivery workflow']],
    faq: [
      ['Which restoration options can I discuss?', 'The existing workflows include PMMA provisionals, zirconia and titanium-supported restorations. The appropriate scope is reviewed against the supplied case records.'],
      ['What if implant or scanbody information is missing?', 'Send the information available. Missing platform, scanbody, MUA or Ti-base details need clarification before the relevant design or production step.'],
      ['Can I start with one case?', 'Yes. Submit one case for technical review, with the requested restoration and any approval requirements. Timing and scope are confirmed after the records are reviewed.']
    ]
  },
  implantBarDesign: {
    path: '/implant-bar-design', name: 'Implant Bar CAD Design',
    description: 'Implant bar and full-arch framework CAD design review for partner dental laboratories.',
    sections: [
      ['What We Design', 'Implant bar and full-arch framework CAD design support focuses on the relationship between the implant interfaces, support structure and planned restoration. This is a design-service page; any manufacturing request needs a separately confirmed scope.', ['Bar and framework design direction for the submitted restorative plan.', 'Restorative-space, connector-support and screw-access review.', 'Coordination with the intended zirconia, PMMA or other specified restoration path.']],
      ['Required Input', 'Send the records that explain the interfaces and the restoration being supported.', ['Upper and lower scans or verified model scans, bite and prescription.', 'Implant system, platform, scanbody and MUA or Ti-base information.', 'Provisional contours, photos or an approved design reference when available.', 'Requested restoration material and your production or approval requirements.']],
      ['Design Review Process', 'Review the case in stages rather than guessing missing component information.', ['Check the supplied records and clarify missing details.', 'Review bar geometry, restorative space, screw access and the component path.', 'Discuss the design direction and required approval views with the partner lab.', 'Confirm the handoff requirements before the agreed next step.']],
      ['Deliverables', 'CAD review views and technical notes support the design discussion. Tell us what your production team needs: the output scope and handoff requirements are agreed for the individual case. A specific editable project, file format or manufacturing service is not assumed.']
    ],
    links: [['/services/full-arch', 'Explore complete Full-Arch laboratory support'], ['/services/design-only', 'Review the Design Only service scope']],
    faq: []
  },
  implant: {
    path: '/services/implant', name: 'Implant Restorations',
    description: 'Implant crown, custom abutment, Ti-base and bridge laboratory support based on submitted digital records.',
    sections: [],
    links: [['/services/full-arch', 'Need a complete Full-Arch restoration?'], ['/implant-bar-design', 'Need bar or framework CAD design?']],
    faq: []
  },
  exocadOutsourcing: {
    path: '/exocad-design-outsourcing', name: 'Exocad Design Outsourcing',
    description: 'Exocad design outsourcing for dental laboratories needing restorative CAD support and approval communication.',
    sections: [
      ['What to Send', 'Describe the design task and your intended production workflow so the design review starts with the right records.', ['STL or PLY scans, bite and the prescription.', 'Restoration request, shade and reference photos where relevant.', 'Implant system, platform, scanbody and component information for implant work.', 'Software preferences, requested output and design-approval instructions.']],
      ['Review & Approval', 'Files and missing information are reviewed before design. CAD views and technical questions help the partner lab review the direction before the agreed manufacturing or file-handoff step. Include any specific approval points with the initial request.'],
      ['Deliverables', 'The agreed CAD design scope, review views and handoff requirements are confirmed for your case. Tell us which output your lab requires; specific file types, editable projects and software-version compatibility must be confirmed rather than assumed.'],
      ['Revisions / Communication', 'Send change requests with clear views, annotations or updated records. Explain what has changed in the prescription or approved direction so the next design review addresses the right issue. Revision scope and timing are agreed during case communication; no unlimited-revision or fixed-turnaround promise is implied.']
    ],
    links: [['/services/design-only', 'Compare the Design Only service catalogue'], ['/workflow', 'Understand the first-case review process']],
    faq: []
  },
  designOnly: {
    path: '/services/design-only', name: 'Dental CAD Design Only',
    description: 'Design-only support for partner laboratories keeping milling, printing, finishing and final production in their own workflow.',
    sections: [
      ['What You Receive', 'Design support is scoped to the restoration and the handoff your production team needs. CAD review views and technical communication support approval; the final output requirements are confirmed before the agreed handoff. Tell us about required files or editable projects rather than assuming a standard package.'],
      ['Review Workflow', 'Use one design case to establish the handoff before sending a larger workload.', ['Select the restoration type and send the available records.', 'Confirm the design scope, missing information and production requirements.', 'Review CAD views and communicate any requested changes.', 'Complete the agreed design handoff for your lab\'s production workflow.']]
    ],
    links: [['/exocad-design-outsourcing', 'Looking specifically for Exocad outsourcing?'], ['/services/implant', 'Need implant restoration production support?']],
    faq: [
      ['Is manufacturing included?', 'This page covers design-only support for labs that retain production. For design plus laboratory production, discuss the appropriate restorative service separately.'],
      ['What files should I send?', 'Include scans, bite, prescription, restoration request and relevant implant component details. Add output requirements and approval notes for your production team.'],
      ['Can I request a particular software handoff?', 'Yes, include your software preferences and required output. Compatibility, file handoff and scope need confirmation for the specific request.']
    ]
  }
};

function contentSection(title, text, bullets) {
  return `<section class="section" data-service-content><div class="wrap two-col"><div><h2>${escape(title)}</h2></div><div><p>${escape(text)}</p>${bullets?.length ? `<ul class="check-list">${bullets.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}</div></div></section>`;
}

function enhanceServicePage($, page, data, card) {
  const config = SERVICES[page];
  if (!config) return;
  if (page === 'implant') {
    // A CMS destination must not turn the enquiry CTA into a portfolio link.
    $('.page-hero .btn-primary[data-manager-href="hero.primaryDestination"]').attr('href', '/submit-case');
  }
  if (page === 'implantBarDesign') $('.page-hero h1').text('Implant Bar CAD Design for Full-Arch Restorations');
  if (page === 'exocadOutsourcing') $('.service-grid').first().before('<div class="wrap"><div class="section-head"><h2>Design Scope</h2><p class="copy">Restorative CAD outsourcing for partner laboratories, with the task and approval requirements agreed from the submitted records.</p></div></div>');
  if (page === 'designOnly') {
    $('.section-head h2').first().text('Services Available');
    $('.section.soft h2').first().text('Input We Need');
  }
  if (page === 'fullArch') {
    $('.fullarch-library').closest('section').find('h2').first().text('Material & Restoration Options');
    $('#cad-design h2').text('Case Information We Need');
  }
  const selected = serviceCases(page, data.publishedCases || [])
    .filter(item => !$(`[data-featured-case] a[href="/cases/${encodeURIComponent(item.slug)}"]`).length)
    .slice(0, 3);
  let content = config.sections.map(section => contentSection(...section)).join('');
  if (selected.length) {
    const label = page === 'fullArch' ? 'Related Full-Arch Cases' : page === 'implant' ? 'Implant Crown & Abutment Cases' : page === 'implantBarDesign' ? 'Bar & Framework Cases' : 'Relevant Design Cases';
    content += `<section class="section soft" data-service-cases><div class="wrap"><div class="section-head"><h2>${label}</h2><p class="copy">Explore documented laboratory work and the records behind each case.${['designOnly', 'exocadOutsourcing'].includes(page) ? ' These cases show related digital workflows; the software and requested handoff are confirmed separately for each design request.' : ''}</p></div><div class="public-case-grid">${selected.map(item => card(item)).join('')}</div></div></section>`;
  }
  const links = `<p>${config.links.map(([route, label]) => `<a href="${route}">${escape(label)}</a>`).join(' &middot; ')}</p>`;
  content += `<section class="section"><div class="wrap two-col"><div><h2>Choose the Right Support</h2></div><div><p>Follow the service that matches your request before sending your files.</p>${links}</div></div></section>`;
  if (config.faq.length) content += `<section class="section" data-service-faq><div class="wrap"><h2>FAQ</h2>${config.faq.map(([q, a]) => `<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('')}</div></section>`;
  $('main .trial').last().before(content);
  const trail = breadcrumb([['/', 'Home'], ['/services', 'Services'], [config.path, config.name]]);
  $('main').prepend(trail.html);
  const organization = $('script[type="application/ld+json"]').first();
  const value = JSON.parse(organization.text());
  value['@id'] = 'https://yzhdentallab.com/#organization';
  organization.text(JSON.stringify(value).replace(/</g, '\\u003c'));
  $('head').append(schemaScript(trail.schema));
  $('head').append(schemaScript({ '@context': 'https://schema.org', '@type': 'Service', '@id': 'https://yzhdentallab.com' + config.path + '#service', name: config.name, serviceType: config.name, description: config.description, url: 'https://yzhdentallab.com' + config.path, provider: { '@id': value['@id'] } }));
}

module.exports = { enhanceServicePage, SERVICES };
