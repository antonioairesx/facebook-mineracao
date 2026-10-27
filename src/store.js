import { openDb, now, tx } from './db.js';
import { summarizeAds } from './parser.js';
import { pageLibraryLink } from './crawler.js';

// Grava os anuncios capturados de UMA pagina anunciante.
// deep = true quando veio da visita a pagina inteira (numeros confiaveis).
// Retorna true se a pagina e nova.
export function savePageFromAds({ pageId, pageName, profileUri, ads, total, deep, term, country }) {
  const d = openDb();
  const t = now();
  const summary = summarizeAds(ads, deep ? total : null);
  let isNew = false;

  tx(() => {
    const existing = d.prepare('SELECT * FROM pages WHERE page_id = ?').get(pageId);
    const sample = ads.find((a) => a.body) || ads[0] || {};
    const name = pageName || (existing && existing.name) || `Pagina ${pageId}`;
    const profile = profileUri || (existing && existing.profile_url) || '';

    if (!existing) {
      isNew = true;
      d.prepare(
        `INSERT INTO pages(page_id, name, profile_url, first_seen, last_seen, ads_active, ads_groups,
           oldest_start, domain, site_url, sample_text, sample_ad_id, last_deep_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`
      ).run(
        pageId,
        name,
        profile,
        t,
        t,
        summary.ads_active,
        summary.ads_groups,
        summary.oldest_start,
        summary.domain,
        summary.site_url,
        (sample.body || sample.title || '').slice(0, 600),
        sample.ad_id || '',
        deep ? t : null
      );
    } else {
      // busca por palavra-chave traz so uma parte dos anuncios: nao reduz numeros ja confiaveis
      const adsActive = deep ? summary.ads_active : Math.max(existing.ads_active, summary.ads_active);
      const groups = deep ? summary.ads_groups : Math.max(existing.ads_groups, summary.ads_groups);
      const oldest = [existing.oldest_start, summary.oldest_start]
        .filter((v) => v !== null && v !== undefined)
        .reduce((a, b) => Math.min(a, b), Infinity);
      const domain = summary.domain || existing.domain;
      const siteUrl = summary.domain ? summary.site_url : existing.site_url;
      d.prepare(
        `UPDATE pages SET name = ?, profile_url = ?, last_seen = ?, ads_active = ?, ads_groups = ?,
           oldest_start = ?, domain = ?, site_url = ?,
           sample_text = CASE WHEN sample_text = '' THEN ? ELSE sample_text END,
           sample_ad_id = CASE WHEN sample_ad_id = '' THEN ? ELSE sample_ad_id END,
           last_deep_at = CASE WHEN ? = 1 THEN ? ELSE last_deep_at END
         WHERE page_id = ?`
      ).run(
        name,
        profile,
        t,
        adsActive,
        groups,
        Number.isFinite(oldest) ? oldest : existing.oldest_start,
        domain,
        siteUrl,
        (sample.body || sample.title || '').slice(0, 600),
        sample.ad_id || '',
        deep ? 1 : 0,
        t,
        pageId
      );
    }

    const upAd = d.prepare(
      `INSERT INTO ads(ad_id, page_id, start_date, end_date, is_active, body, title, cta, link_url, domain,
         format, thumb_url, collation_count, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ad_id) DO UPDATE SET
         start_date = COALESCE(excluded.start_date, ads.start_date),
         end_date = excluded.end_date,
         is_active = excluded.is_active,
         body = CASE WHEN excluded.body != '' THEN excluded.body ELSE ads.body END,
         title = CASE WHEN excluded.title != '' THEN excluded.title ELSE ads.title END,
         cta = CASE WHEN excluded.cta != '' THEN excluded.cta ELSE ads.cta END,
         link_url = CASE WHEN excluded.link_url != '' THEN excluded.link_url ELSE ads.link_url END,
         domain = CASE WHEN excluded.domain != '' THEN excluded.domain ELSE ads.domain END,
         format = CASE WHEN excluded.format != '' THEN excluded.format ELSE ads.format END,
         thumb_url = CASE WHEN excluded.thumb_url != '' THEN excluded.thumb_url ELSE ads.thumb_url END,
         collation_count = MAX(ads.collation_count, excluded.collation_count),
         last_seen = excluded.last_seen`
    );
    for (const a of ads) {
      upAd.run(
        a.ad_id,
        pageId,
        a.start_date,
        a.end_date,
        a.is_active,
        (a.body || '').slice(0, 1500),
        (a.title || '').slice(0, 300),
        (a.cta || '').slice(0, 80),
        (a.link_url || '').slice(0, 1000),
        a.domain || '',
        a.format || '',
        (a.thumb_url || '').slice(0, 1000),
        a.collation_count || 1,
        t,
        t
      );
    }

    if (deep) {
      // anuncios que a pagina nao mostra mais como ativos
      const seenIds = ads.map((a) => a.ad_id);
      if (seenIds.length) {
        const marks = seenIds.map(() => '?').join(',');
        d.prepare(
          `UPDATE ads SET is_active = 0 WHERE page_id = ? AND ad_id NOT IN (${marks})`
        ).run(pageId, ...seenIds);
      }
    }

    if (term) {
      d.prepare(
        'INSERT OR IGNORE INTO page_hits(page_id, term, country, first_seen) VALUES (?, ?, ?, ?)'
      ).run(pageId, term, country || '', t);
    }
  });

  return isNew;
}

export function groupByPage(ads) {
  const map = new Map();
  for (const a of ads) {
    if (!a.page_id) continue;
    let g = map.get(a.page_id);
    if (!g) {
      g = { pageId: a.page_id, pageName: '', profileUri: '', ads: [] };
      map.set(a.page_id, g);
    }
    if (a.page_name && !g.pageName) g.pageName = a.page_name;
    if (a.page_profile_uri && !g.profileUri) g.profileUri = a.page_profile_uri;
    g.ads.push(a);
  }
  return [...map.values()];
}

export function libraryLinkForPage(pageId) {
  return pageLibraryLink(pageId);
}
