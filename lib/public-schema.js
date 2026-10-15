const origin = 'https://yzhdentallab.com';
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const schemaScript = value => `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
function breadcrumb(items) {
  return {
    html: `<nav class="wrap" aria-label="Breadcrumb"><p>${items.map(([route, name], index) => index === items.length - 1 ? `<span aria-current="page">${escape(name)}</span>` : `<a href="${escape(route)}">${escape(name)}</a>`).join(' / ')}</p></nav>`,
    schema: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([route, name], index) => ({ '@type': 'ListItem', position: index + 1, name, item: origin + route })) }
  };
}
module.exports = { breadcrumb, schemaScript };
