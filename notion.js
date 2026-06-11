/* ================================================================
   QUIDDITY DIGITAL — notion.js  v6

   WHAT CHANGED vs v5:
   ─────────────────────────────────────────────────────────────
   API ENDPOINTS REFACTORED:
     Old: single Worker endpoint returned full pages + blocks for all posts
     New: two lean endpoints match the Worker v4 routes:
       GET /api/posts        → post list (metadata only, no blocks)
       GET /api/post/:slug   → single post + blocks (on demand only)

     This eliminates the N×block-fetch problem where every page load
     fetched ALL blocks for ALL posts. Now blocks are only fetched
     for the single post being read.

   CACHE STRATEGY (unchanged from v5):
     stale-while-revalidate with 5-min TTL. Serves from cache
     instantly, refreshes in background.

   RESPONSE FORMAT (from Worker v4):
     /api/posts → { success: true, results: [PostMetadata...] }
     /api/post/:slug → { success: true, ...PostMetadata, content: Block[] }

     PostMetadata shape is already sanitized by the Worker —
     no parseBlogPage() needed on the frontend anymore.

   API_BASE is read from CONFIG.WORKER_URL (config.js must load first).
   ================================================================ */

/* ── BASE URL from config.js ─────────────────────────────────────── */
// Falls back to hardcoded URL if config.js hasn't loaded yet
const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.WORKER_URL)
  ? CONFIG.WORKER_URL
  : 'https://quiddity-blog-api.midnightytacc.workers.dev';

/* ── IN-MEMORY CACHE: stale-while-revalidate ─────────────────────── */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const _listCache = { data: null, time: 0, promise: null };

// Per-slug cache for single posts
const _postCache = new Map(); // slug → { data, time }

/* ================================================================
   PUBLIC API — used by all pages
   ================================================================ */

/**
 * Fetch all published posts (metadata only, no blocks).
 * Uses stale-while-revalidate: returns instantly from cache,
 * refreshes in background after TTL.
 */
async function fetchPublishedBlogs() {
  const now     = Date.now();
  const isStale = now - _listCache.time > CACHE_TTL_MS;

  // Fresh cache — serve immediately
  if (_listCache.data && !isStale) {
    return _listCache.data;
  }

  // Stale cache — serve stale and refresh in background
  if (_listCache.data && isStale) {
    _refreshListCache();
    return _listCache.data;
  }

  // No cache — must wait for first load
  if (!_listCache.promise) {
    _listCache.promise = _fetchPostList();
  }

  _listCache.data    = await _listCache.promise;
  _listCache.time    = Date.now();
  _listCache.promise = null;
  return _listCache.data;
}

/**
 * Fetch a single published post including its full block content.
 * Uses a per-slug cache.
 */
async function fetchBlogBySlug(slug) {
  if (!slug) return null;

  const now     = Date.now();
  const cached  = _postCache.get(slug);
  const isStale = cached && (now - cached.time > CACHE_TTL_MS);

  if (cached && !isStale) return cached.data;

  // Stale: serve stale and refresh in background
  if (cached && isStale) {
    _refreshPostCache(slug);
    return cached.data;
  }

  // No cache — fetch now
  const post = await _fetchSinglePost(slug);
  if (post) _postCache.set(slug, { data: post, time: Date.now() });
  return post;
}

/* ================================================================
   FETCH IMPLEMENTATIONS
   ================================================================ */

async function _fetchPostList() {
  const res = await fetch(`${API_BASE}/api/posts`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Unknown API error');
  // Sort by date (newest first) — Worker already sorts, this is a safety net
  return (data.results || []).sort((a, b) => {
    const da = a.date || a.createdTime || '';
    const db = b.date || b.createdTime || '';
    return db.localeCompare(da);
  });
}

async function _fetchSinglePost(slug) {
  const res = await fetch(`${API_BASE}/api/post/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Unknown API error');
  // Remove success flag — return the post object directly
  const { success: _s, ...post } = data;
  return post;
}

async function _refreshListCache() {
  if (_listCache.promise) return;
  try {
    _listCache.promise = _fetchPostList();
    _listCache.data    = await _listCache.promise;
    _listCache.time    = Date.now();
  } catch (e) {
    console.warn('[Quiddity] Background list refresh failed:', e.message);
  } finally {
    _listCache.promise = null;
  }
}

async function _refreshPostCache(slug) {
  try {
    const post = await _fetchSinglePost(slug);
    if (post) _postCache.set(slug, { data: post, time: Date.now() });
  } catch (e) {
    console.warn('[Quiddity] Background post refresh failed:', e.message);
  }
}

/* ================================================================
   RENDER NOTION BLOCKS → HTML
   The Worker v4 returns sanitized block objects. Block shapes are
   unchanged from Notion's API — only internal metadata is stripped.
   ================================================================ */
function renderBlocks(blocks) {
  if (!blocks || !blocks.length) return '';

  let html     = '';
  let listBuf  = [];
  let listType = null;

  function flushList() {
    if (!listBuf.length) return;
    const tag = listType === 'bulleted_list_item' ? 'ul' : 'ol';
    html += `<${tag} class="blog-list">${listBuf.join('')}</${tag}>`;
    listBuf  = [];
    listType = null;
  }

  for (const block of blocks) {
    const type = block.type;
    if (!type) continue;
    const b = block[type] || {};

    // Accumulate list items before flushing
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      if (listType !== type) { flushList(); listType = type; }
      listBuf.push(`<li>${richTextToHtml(b.rich_text)}</li>`);
      continue;
    }
    flushList();

    switch (type) {
      case 'paragraph': {
        const text = richTextToHtml(b.rich_text);
        html += text ? `<p>${text}</p>` : '<br>';
        break;
      }
      case 'heading_1':
        html += `<h1 id="${headingId(b.rich_text)}">${richTextToHtml(b.rich_text)}</h1>`;
        break;
      case 'heading_2':
        html += `<h2 id="${headingId(b.rich_text)}">${richTextToHtml(b.rich_text)}</h2>`;
        break;
      case 'heading_3':
        html += `<h3 id="${headingId(b.rich_text)}">${richTextToHtml(b.rich_text)}</h3>`;
        break;
      case 'image': {
        const src = b.file?.url || b.external?.url || '';
        const cap = (b.caption || []).map(c => c.plain_text).join('');
        if (src) {
          html += `<figure class="blog-figure">
            <img src="${escAttr(src)}" alt="${escAttr(cap || 'Blog image')}" loading="lazy"/>
            ${cap ? `<figcaption>${escHtml(cap)}</figcaption>` : ''}
          </figure>`;
        }
        break;
      }
      case 'quote':
        html += `<blockquote>${richTextToHtml(b.rich_text)}</blockquote>`;
        break;
      case 'divider':
        html += `<hr class="blog-hr"/>`;
        break;
      case 'callout': {
        const icon = b.icon?.emoji
          || (b.icon?.external?.url
              ? `<img src="${b.icon.external.url}" style="width:1.1em;vertical-align:middle" alt=""/>`
              : '💡');
        html += `<div class="blog-callout"><span class="callout-icon">${icon}</span><div>${richTextToHtml(b.rich_text)}</div></div>`;
        break;
      }
      case 'code': {
        const code = (b.rich_text || []).map(t => t.plain_text).join('');
        const lang = escAttr(b.language || '');
        html += `<pre class="blog-code" data-lang="${lang}"><code>${escHtml(code)}</code></pre>`;
        break;
      }
      case 'toggle':
        html += `<details class="blog-toggle">
          <summary>${richTextToHtml(b.rich_text)}</summary>
        </details>`;
        break;
      case 'table_of_contents':
        break; // rendered client-side via buildTOC()
      default:
        break;
    }
  }

  flushList();
  return html;
}

/** Generate a URL-safe ID for heading anchor links. */
function headingId(richText = []) {
  return (richText || [])
    .map(t => t.plain_text || '')
    .join('')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 60) || 'section';
}

/* ================================================================
   RICH TEXT → HTML
   ================================================================ */
function richTextToHtml(arr = []) {
  if (!arr) return '';
  return arr.map(t => {
    let s = escHtml(t.plain_text || '');
    const a = t.annotations || {};
    if (a.bold)          s = `<strong>${s}</strong>`;
    if (a.italic)        s = `<em>${s}</em>`;
    if (a.underline)     s = `<u>${s}</u>`;
    if (a.strikethrough) s = `<s>${s}</s>`;
    if (a.code)          s = `<code>${s}</code>`;
    if (t.href)          s = `<a href="${escAttr(t.href)}" target="_blank" rel="noopener noreferrer">${s}</a>`;
    return s;
  }).join('');
}

/* ================================================================
   HTML ESCAPING
   ================================================================ */
function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str = '') {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ================================================================
   AUTHOR COMPONENTS
   ================================================================ */

/**
 * Full author card displayed at the bottom of a blog post.
 * @param {object} author — from post.author (sanitized by Worker)
 */
function buildAuthorCard(author) {
  if (!author) return '';
  const name     = escHtml(author.name || 'Quiddity Digital');
  const initials = (author.name || 'QD').trim().split(/\s+/)
                     .map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

  const avatarHtml = author.image
    ? `<img src="${escAttr(author.image)}" alt="${name}" class="bp-author-card-av bp-author-card-av--photo" loading="lazy"/>`
    : `<div class="bp-author-card-av">${initials}</div>`;

  const linkedinHtml = author.linkedin
    ? `<a href="${escAttr(author.linkedin)}" class="bp-author-social bp-author-social--li"
          target="_blank" rel="noopener noreferrer" aria-label="${name} on LinkedIn">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
         LinkedIn
       </a>`
    : '';

  const twitterHtml = author.twitter
    ? `<a href="${escAttr(author.twitter)}" class="bp-author-social bp-author-social--tw"
          target="_blank" rel="noopener noreferrer" aria-label="${name} on X / Twitter">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
         X / Twitter
       </a>`
    : '';

  const socialsHtml = (linkedinHtml || twitterHtml)
    ? `<div class="bp-author-socials">${linkedinHtml}${twitterHtml}</div>`
    : '';

  return `
    <div class="bp-author-card">
      ${avatarHtml}
      <div class="bp-author-card-info">
        <div class="bp-author-card-name">${name}</div>
        <div class="bp-author-card-role">Quiddity Digital Team</div>
        <div class="bp-author-card-bio">${escHtml(author.bio || 'Growth strategist and digital consultant at Quiddity Digital.')}</div>
        ${socialsHtml}
      </div>
    </div>`;
}

/**
 * Compact inline author bar for the blog post hero.
 * @param {object} author — from post.author
 */
function buildAuthorBar(author) {
  if (!author) return '';
  const name     = escHtml(author.name || 'Quiddity Digital');
  const initials = (author.name || 'QD').trim().split(/\s+/)
                     .map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

  const avatarHtml = author.image
    ? `<img src="${escAttr(author.image)}" alt="${name}" class="bp-av bp-av--photo" loading="lazy"/>`
    : `<div class="bp-av">${initials}</div>`;

  const liHtml = author.linkedin
    ? `<a href="${escAttr(author.linkedin)}" class="bp-av-social" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
         <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
       </a>`
    : '';

  const twHtml = author.twitter
    ? `<a href="${escAttr(author.twitter)}" class="bp-av-social" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter">
         <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
       </a>`
    : '';

  return `
    <div class="bp-author-bar">
      ${avatarHtml}
      <div>
        <div class="bp-author-name">${name}</div>
        <div class="bp-author-role">Quiddity Digital Team</div>
      </div>
      ${liHtml}${twHtml}
    </div>`;
}

/* ================================================================
   BLOG CARD HTML — homepage + all-posts grid
   ================================================================ */
function buildBlogCard(blog, delay = 0) {
  const thumb = blog.coverImage
    ? `<img src="${escAttr(blog.coverImage)}" alt="${escAttr(blog.title)}" loading="lazy" width="400" height="225"/>`
    : `<span class="blog-thumb-ph">📝</span>`;

  const cat        = escHtml(blog.category  || 'Insights');
  const readTime   = escHtml(blog.readTime  || '5 min read');
  const desc       = escHtml(blog.description || '');
  const delayClass = delay ? ` d${delay}` : '';
  const authorName = escHtml(
    (typeof blog.author === 'object' ? blog.author?.name : blog.author) || 'Quiddity Digital'
  );

  // Internal blog links should NOT open in new tab (same site)
  return `
    <a href="blog.html?slug=${encodeURIComponent(blog.slug)}"
       class="blog-card reveal${delayClass}">
      <div class="blog-thumb">
        ${thumb}
        <div class="bt-overlay"></div>
      </div>
      <div class="blog-body">
        <div class="blog-meta">
          <span class="bc">${cat}</span>
          <span>·</span>
          <span>${readTime}</span>
          <span>·</span>
          <span>${authorName}</span>
        </div>
        <h3>${escHtml(blog.title)}</h3>
        ${desc ? `<p class="blog-exc">${desc}</p>` : ''}
        <span class="blog-cta">Read article →</span>
      </div>
    </a>`;
}
