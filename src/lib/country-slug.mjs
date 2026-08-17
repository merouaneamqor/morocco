/**
 * Country → URL segment.
 *
 * Shared because it is used by the route that *generates* the country pages
 * and by every page that *links* to them. When those two drifted apart the
 * first time, `Turkey / Ottoman` produced a path with a slash in it and the
 * build failed — which is the good outcome. The bad outcome is a link that
 * quietly 404s, and one function is how that stays impossible.
 */
export const countrySlug = (country) =>
  String(country ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
