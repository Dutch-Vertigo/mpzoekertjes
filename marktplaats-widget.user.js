// ==UserScript==
// @name         Zoekertjes-app – Marktplaats & 2dehands
// @namespace    mp-widget
// @version      2.2.2
// @description  Widget met nieuwe berichten en zoekertjes (wisselt om de 30 s), plus een app om op Marktplaats én 2dehands te zoeken, zoekopdrachten op te slaan, resultaten als lijst, raster of kaart te bekijken en een ophaalrit te plannen.
// @homepageURL  https://github.com/Dutch-Vertigo/mpzoekertjes
// @supportURL   https://github.com/Dutch-Vertigo/mpzoekertjes/issues
// @updateURL    https://raw.githubusercontent.com/Dutch-Vertigo/mpzoekertjes/main/marktplaats-widget.user.js
// @downloadURL  https://raw.githubusercontent.com/Dutch-Vertigo/mpzoekertjes/main/marktplaats-widget.user.js
// @match        https://www.marktplaats.nl/*
// @match        https://www.2dehands.be/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @connect      www.marktplaats.nl
// @connect      www.2dehands.be
// @connect      api.pdok.nl
// @connect      api.emailjs.com
// @connect      *
// @require      https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Instellingen ----------
  const CONFIG = {
    switchSeconds: 30,       // widget: wisselen tussen berichten en zoekertjes
    refreshSeconds: 60,      // widget: data opnieuw ophalen
    widgetItems: 6,
    notifyMinutes: 5,        // meldingen: elke zoveel minuten controleren (zolang een MP/2dh-tabblad open is)
    defaultSearch: {
      name: '',
      query: '',
      postcode: '',          // leeg: wordt in de app ingevuld en onthouden
      radiusKm: 100,
      priceMin: '',
      priceMax: '',
      sort: 'newest',        // newest | price_asc | price_desc | distance
      age: 'all',            // 24 | 48 | 72 | older | all
      sources: { mp: true, tdh: true },
      maxPerSource: 200,
    },
  };

  const SOURCES = {
    mp: { name: 'Marktplaats', short: 'MP', color: '#e8893a', base: 'https://www.marktplaats.nl', country: 'NL' },
    tdh: { name: '2dehands', short: '2dh', color: '#2f6fcf', base: 'https://www.2dehands.be', country: 'BE' },
  };

  // Referentiepostcodes per land. De zoek-API's accepteren alleen postcodes van hun eigen land,
  // dus voor de "andere" site zoeken we vanaf de dichtstbijzijnde referentie met een ruimere straal
  // en filteren daarna op de echte afstand tot je eigen postcode.
  const REF_POSTCODES = {
    NL: [
      ['1012', 52.373, 4.893], ['3011', 51.920, 4.480], ['2511', 52.078, 4.312], ['3511', 52.091, 5.118],
      ['5611', 51.441, 5.478], ['6211', 50.851, 5.690], ['6041', 51.194, 5.987], ['5911', 51.370, 6.168],
      ['6411', 50.888, 5.980], ['6131', 51.000, 5.868], ['6001', 51.252, 5.706], ['4811', 51.589, 4.776],
      ['5038', 51.560, 5.083], ['5211', 51.690, 5.304], ['4331', 51.499, 3.611], ['4531', 51.335, 3.828],
      ['4611', 51.495, 4.287], ['6511', 51.842, 5.853], ['6811', 51.985, 5.899], ['5401', 51.660, 5.617],
      ['5751', 51.461, 5.795], ['4701', 51.531, 4.465], ['5501', 51.418, 5.403],
    ],
    BE: [
      ['1000', 50.846, 4.352], ['2000', 51.219, 4.402], ['2300', 51.322, 4.945], ['2400', 51.191, 5.116],
      ['2800', 51.028, 4.480], ['3000', 50.879, 4.700], ['3290', 50.989, 5.051], ['3500', 50.930, 5.338],
      ['3600', 50.965, 5.500], ['3630', 50.966, 5.692], ['3640', 51.145, 5.742], ['3680', 51.098, 5.787],
      ['3900', 51.209, 5.418], ['3930', 51.252, 5.548], ['3960', 51.141, 5.597], ['3700', 50.780, 5.464],
      ['3800', 50.816, 5.186], ['4000', 50.633, 5.567], ['4700', 50.629, 6.036], ['4800', 50.589, 5.862],
      ['5000', 50.467, 4.872], ['6000', 50.411, 4.444], ['6700', 49.683, 5.817], ['6900', 50.227, 5.344],
      ['6800', 49.920, 5.379], ['7000', 50.454, 3.952], ['7500', 50.606, 3.388], ['8000', 51.209, 3.225],
      ['8400', 51.216, 2.928], ['8500', 50.828, 3.265], ['8800', 50.946, 3.123], ['9000', 51.054, 3.717],
      ['9100', 51.165, 4.144], ['9300', 50.938, 4.040], ['9700', 50.845, 3.605], ['1300', 50.717, 4.601],
      ['1400', 50.598, 4.328], ['2200', 51.177, 4.836], ['2500', 51.131, 4.570], ['3200', 50.987, 4.836],
      ['5500', 50.261, 4.912], ['6600', 50.003, 5.719], ['4900', 50.492, 5.866], ['2950', 51.313, 4.433],
      ['9900', 51.186, 3.564],
    ],
  };

  // ---------- Opslag (gedeeld tussen marktplaats.nl en 2dehands.be via GM_*) ----------
  const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const store = {
    get(key, fallback) {
      try {
        const raw = hasGM ? GM_getValue(key) : localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        const raw = JSON.stringify(value);
        if (hasGM) GM_setValue(key, raw);
        else localStorage.setItem(key, raw);
      } catch (e) {}
    },
  };
  const K = { seen: 'mpw-seen', searches: 'mpw-searches', last: 'mpw-last-search', trip: 'mpw-trip', view: 'mpw-view', geo: 'mpw-geo', notifyAt: 'mpw-notify-at', email: 'mpw-email', emailState: 'mpw-email-state' };

  // ---------- Netwerk ----------
  function getJSON(url) {
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((ok, fail) =>
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: { Accept: 'application/json' },
          timeout: 20000,
          onload: (r) => {
            if (r.status < 200 || r.status >= 300) return fail(Object.assign(new Error('HTTP ' + r.status), { status: r.status }));
            try { ok(JSON.parse(r.responseText)); } catch (e) { fail(e); }
          },
          onerror: () => fail(new Error('Netwerkfout')),
          ontimeout: () => fail(new Error('Time-out')),
        })
      );
    }
    return fetch(url, { credentials: 'include' }).then((r) => {
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      return r.json();
    });
  }

  // ---------- Hulpfuncties ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function dist(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function formatPrice(pi) {
    if (!pi) return '';
    if (pi.priceType === 'FREE') return 'Gratis';
    if (pi.priceType === 'SEE_DESCRIPTION') return 'Zie omschrijving';
    if (pi.priceType === 'RESERVED') return 'Gereserveerd';
    if (pi.priceType === 'EXCHANGE') return 'Ruilen';
    if (pi.priceType === 'NOTK' || pi.priceType === 'ON_REQUEST') return 'Op aanvraag';
    if ((pi.priceType === 'MIN_BID' || pi.priceType === 'FAST_BID') && !pi.priceCents) return 'Bieden';
    const euro = '€ ' + (pi.priceCents / 100).toLocaleString('nl-NL', { minimumFractionDigits: pi.priceCents % 100 ? 2 : 0 });
    return pi.priceType === 'MIN_BID' ? 'Bieden vanaf ' + euro : euro;
  }

  // Datumlabels uit de zoek-API: "Vandaag", "Gisteren", "Eergisteren" of "12 okt 26".
  const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  function dayAge(label) {
    const t = String(label || '').trim().toLowerCase();
    if (t === 'vandaag') return 0;
    if (t === 'gisteren') return 1;
    if (t === 'eergisteren') return 2;
    const m = /^(\d{1,2})\s+([a-z]{3})\.?\s*'?(\d{2,4})?$/.exec(t);
    if (!m || MONTHS.indexOf(m[2]) < 0) return null;
    const now = new Date();
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    const d = new Date(y, MONTHS.indexOf(m[2]), +m[1]);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - d) / 864e5);
  }

  // Tijdvakken. "api" = het filter "Aangeboden sinds" van de site zelf (werkelijke plaatsingsdatum);
  // maxDays/minDays filteren daarnaast op het datumlabel (alleen per dag nauwkeurig).
  const AGES = {
    '24': { label: 'Laatste 24 uur', api: 'Vandaag' },
    '48': { label: 'Laatste 48 uur', api: 'Gisteren' },
    '72': { label: 'Laatste 72 uur', api: 'Een week', maxDays: 2 },
    older: { label: 'Ouder dan 72 uur', minDays: 3 },
    all: { label: 'Altijd' },
  };

  function countryOf(postcode) {
    const pc = postcode.replace(/\s+/g, '').toUpperCase();
    if (/^\d{4}[A-Z]{2}$/.test(pc)) return 'NL';
    if (/^\d{4}$/.test(pc)) return 'BE'; // 4 cijfers zonder letters: Belgisch
    return null;
  }

  // ---------- Geocoderen van je eigen postcode ----------
  async function geocode(postcode) {
    const pc = postcode.replace(/\s+/g, '').toUpperCase();
    const cache = store.get(K.geo, {});
    if (cache[pc]) return cache[pc];
    const country = countryOf(pc);
    let home;
    if (country === 'NL') {
      const d = await getJSON('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fl=centroide_ll,weergavenaam&q=' + encodeURIComponent(pc));
      const doc = d.response && d.response.docs[0];
      const m = doc && /POINT\(([\d.]+) ([\d.]+)\)/.exec(doc.centroide_ll);
      if (!m) throw new Error('Postcode ' + pc + ' niet gevonden');
      home = { lat: +m[2], lng: +m[1], name: doc.weergavenaam, postcode: pc, country };
    } else if (country === 'BE') {
      // Geen open Belgische geocoder zonder sleutel: neem de plaats van advertenties vlak bij deze postcode.
      // De zoek-API geeft niets zonder zoekterm; "te koop" levert in de praktijk de meeste treffers op.
      let near = [];
      for (const [q, m] of [['te koop', 3000], ['te koop', 10000], ['a', 10000]]) {
        try {
          const d = await getJSON(SOURCES.tdh.base + '/lrp/api/search?limit=30&query=' + encodeURIComponent(q) + '&postcode=' + pc + '&distanceMeters=' + m);
          near = (d.listings || []).filter((l) => l.location && l.location.latitude != null);
        } catch (e) {}
        if (near.length) break;
      }
      if (!near.length) throw new Error('Postcode ' + pc + ' niet gevonden');
      const minD = Math.min(...near.map((l) => l.location.distanceMeters));
      const pick = near.filter((l) => l.location.distanceMeters === minD);
      home = {
        lat: pick.reduce((a, l) => a + l.location.latitude, 0) / pick.length,
        lng: pick.reduce((a, l) => a + l.location.longitude, 0) / pick.length,
        name: pc + ' ' + (pick[0].location.cityName || ''),
        postcode: pc,
        country,
      };
    } else {
      throw new Error('Gebruik een NL-postcode (1234AB) of BE-postcode (1234)');
    }
    cache[pc] = home;
    store.set(K.geo, cache);
    return home;
  }

  // ---------- Zoeken ----------
  const SORT_API = {
    newest: ['SORT_INDEX', 'DECREASING'],
    price_asc: ['PRICE', 'INCREASING'],
    price_desc: ['PRICE', 'DECREASING'],
    distance: ['SORT_INDEX', 'DECREASING'],
  };

  function normalize(src, l, home) {
    const loc = l.location || {};
    const pic = (l.pictures && l.pictures[0]) || {};
    const fallbackImg = l.imageUrls && l.imageUrls[0] ? 'https:' + l.imageUrls[0] : '';
    const hasGeo = loc.latitude != null && loc.longitude != null;
    const pi = l.priceInfo || {};
    return {
      key: src + ':' + l.itemId,
      src,
      title: String(l.title || '').replace(/\s+/g, ' ').trim(),
      desc: l.description || '',
      priceCents: pi.priceCents || 0,
      price: formatPrice(pi),
      city: loc.cityName || '',
      lat: hasGeo ? loc.latitude : null,
      lng: hasGeo ? loc.longitude : null,
      km: hasGeo && home ? Math.round(dist(home, { lat: loc.latitude, lng: loc.longitude })) : null,
      date: l.date || '',
      img: pic.mediumUrl || fallbackImg,
      imgL: pic.largeUrl || pic.mediumUrl || fallbackImg,
      url: SOURCES[src].base + (String(l.vipUrl || '').startsWith('/') ? l.vipUrl : '/'),
    };
  }

  async function searchSource(src, s, home, onProgress, isCancelled) {
    const S = SOURCES[src];
    let postcode = home.postcode;
    let radiusKm = s.radiusKm;
    let crossBorder = false;
    if (home.country !== S.country) {
      // Dichtstbijzijnde referentiepostcode in het land van deze site.
      const ref = REF_POSTCODES[S.country]
        .map(([pc, lat, lng]) => ({ pc, d: dist(home, { lat, lng }) }))
        .sort((a, b) => a.d - b.d)[0];
      if (ref.d - 15 > s.radiusKm) return { items: [], total: 0, note: S.name + ': buiten straal' };
      postcode = ref.pc;
      radiusKm = Math.ceil(s.radiusKm + ref.d + 10);
      crossBorder = true;
    }
    const age = AGES[s.age] || AGES.all;
    // "Ouder dan 72 uur" lezen we in nieuwste-volgorde vanaf het punt waar de oude advertenties beginnen;
    // de gekozen sortering wordt daarna in de app toegepast.
    const [sortBy, sortOrder] = age.minDays != null ? SORT_API.newest : SORT_API[s.sort] || SORT_API.newest;
    const min = Math.round(parseFloat(s.priceMin) * 100);
    const max = Math.round(parseFloat(s.priceMax) * 100);
    const url = (offset, limit) => {
      const p = new URLSearchParams({
        query: s.query || '',
        limit: String(limit),
        offset: String(offset),
        sortBy,
        sortOrder,
        postcode,
        distanceMeters: String(radiusKm * 1000),
      });
      if (min > 0 || max > 0) p.append('attributeRanges[]', 'PriceCents:' + (min > 0 ? min : 'null') + ':' + (max > 0 ? max : 'null'));
      if (age.api) p.append('attributesByKey[]', 'offeredSince:' + age.api);
      return S.base + '/lrp/api/search?' + p;
    };

    let start = 0;
    if (age.minDays != null) {
      start = await findAgeBoundary(url, age.minDays, isCancelled);
      if (start == null) return { items: [], total: 0, note: S.name + ': te veel recente advertenties om de oudere te bereiken; verklein straal of maak de zoekterm specifieker' };
    }

    const items = [];
    let total = 0;
    const pageSize = 100;
    for (let offset = start; offset < start + s.maxPerSource; offset += pageSize) {
      if (isCancelled()) break;
      const data = await getJSON(url(offset, Math.min(pageSize, start + s.maxPerSource - offset)));
      total = data.totalResultCount || 0;
      const list = data.listings || [];
      for (const l of list) {
        const it = normalize(src, l, home);
        if (crossBorder && (it.km == null || it.km > s.radiusKm)) continue;
        if (it.km != null && it.km > s.radiusKm + 10) continue; // plaatscoördinaten wijken soms af van de postcode-afstand
        if (max > 0 && it.priceCents > max) continue;
        if (min > 0 && it.priceCents && it.priceCents < min) continue;
        const d = dayAge(l.date);
        if (age.maxDays != null && (d == null || d > age.maxDays)) continue;
        if (age.minDays != null && (d == null || d < age.minDays)) continue;
        items.push(it);
      }
      onProgress(src, items.length, total);
      if (list.length < pageSize) break;
    }
    return { items, total, note: crossBorder ? S.name + ': gefilterd op afstand' : '' };
  }

  // Binair zoeken naar de eerste positie (in nieuwste-volgorde) met een advertentie van minstens minDays oud.
  const MAX_OFFSET = 4900;
  async function findAgeBoundary(url, minDays, isCancelled) {
    const ageAt = async (o) => {
      const d = await getJSON(url(o, 1));
      const l = (d.listings || [])[0];
      return { age: l ? dayAge(l.date) : Infinity, total: d.totalResultCount || 0 };
    };
    const first = await ageAt(0);
    if (first.age >= minDays) return 0;
    let hi = Math.min(first.total - 1, MAX_OFFSET);
    if (hi <= 0 || (await ageAt(hi)).age < minDays) return null;
    let lo = 0;
    while (lo < hi && !isCancelled()) {
      const mid = (lo + hi) >> 1;
      if ((await ageAt(mid)).age >= minDays) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  function mergeResults(lists, sort) {
    const all = [].concat(...lists);
    if (sort === 'price_asc') return all.sort((a, b) => a.priceCents - b.priceCents);
    if (sort === 'price_desc') return all.sort((a, b) => b.priceCents - a.priceCents);
    if (sort === 'distance') return all.sort((a, b) => (a.km == null ? 1e9 : a.km) - (b.km == null ? 1e9 : b.km));
    // Nieuwste: beide bronnen zijn al op datum gesorteerd, dus om en om samenvoegen.
    const out = [];
    const n = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < n; i++) lists.forEach((l) => l[i] && out.push(l[i]));
    return out;
  }

  async function runSearch(s, onProgress, isCancelled) {
    // De zoek-API's van beide sites geven niets terug zonder zoekterm.
    if (!String(s.query || '').trim()) throw new Error('Vul een zoekterm in (zoeken zonder zoekterm kan niet op Marktplaats/2dehands)');
    if (!String(s.postcode || '').trim()) throw new Error('Vul je postcode in (NL: 1234AB, BE: 1234)');
    const home = await geocode(s.postcode);
    const srcs = Object.keys(SOURCES).filter((k) => s.sources[k]);
    const settled = await Promise.allSettled(srcs.map((k) => searchSource(k, s, home, onProgress || (() => {}), isCancelled || (() => false))));
    const lists = [];
    const notes = [];
    const totals = {};
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        lists.push(r.value.items);
        totals[srcs[i]] = r.value.total;
        if (r.value.note) notes.push(r.value.note);
      } else notes.push(SOURCES[srcs[i]].name + ': fout (' + r.reason.message + ')');
    });
    return { home, items: mergeResults(lists, s.sort), notes, totals };
  }

  // ---------- Meldingen ----------
  function notify(title, text, image, url) {
    if (typeof GM_notification === 'function') {
      GM_notification({ title, text, image: image || undefined, onclick: () => window.open(url, '_blank') });
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body: text, icon: image || undefined });
      n.onclick = () => { window.open(url, '_blank'); n.close(); };
    }
  }

  async function ensureNotifyPermission() {
    if (typeof GM_notification === 'function') return true;
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'default') await Notification.requestPermission();
    return Notification.permission === 'granted';
  }

  let notifyBusy = false;
  async function checkNotifications(force) {
    if (notifyBusy) return;
    // Gedeelde tijdstempel voorkomt dubbele meldingen als er meerdere tabbladen open zijn.
    const now = Date.now();
    if (!force && now - store.get(K.notifyAt, 0) < CONFIG.notifyMinutes * 60000 - 30000) return;
    store.set(K.notifyAt, now);
    notifyBusy = true;
    try {
      for (const s of store.get(K.searches, []).filter((x) => x.notify)) {
        try {
          const r = await runSearch({ ...CONFIG.defaultSearch, ...s, sort: 'newest', maxPerSource: 100 });
          const key = 'mpw-notified-' + s.id;
          const prev = store.get(key, null);
          if (prev) {
            const ps = new Set(prev);
            const fresh = r.items.filter((i) => !ps.has(i.key));
            if (fresh.length === 1) {
              const i = fresh[0];
              notify('Nieuw (' + s.name + '): ' + i.title,
                [i.price, i.city, i.km != null ? i.km + ' km' : '', SOURCES[i.src].name].filter(Boolean).join(' · '), i.imgL, i.url);
            } else if (fresh.length > 1) {
              notify(fresh.length + ' nieuwe advertenties – ' + s.name,
                fresh.slice(0, 4).map((i) => '• ' + i.title + (i.price ? ' (' + i.price + ')' : '')).join('\n'), fresh[0].imgL, fresh[0].url);
            }
          }
          store.set(key, [...new Set([...(prev || []), ...r.items.map((i) => i.key)])].slice(-3000));
        } catch (e) {}
      }
    } finally {
      notifyBusy = false;
    }
  }

  // ---------- E-mailmeldingen ----------
  // Een browserscript kan zelf geen e-mail versturen. Dat gaat via EmailJS (gratis account, koppelt
  // bv. je Gmail) of via een webhook (Make, Zapier, n8n, …) die de e-mail verstuurt.
  const EMAIL_DEFAULTS = {
    enabled: false,
    to: '',
    from: '08:00',
    until: '22:00',
    everyH: 1,
    everyM: 0,
    listings: true,
    messages: true,
    searchIds: null, // null = alle opgeslagen zoekopdrachten
    provider: 'emailjs',
    serviceId: '',
    templateId: '',
    publicKey: '',
    webhookUrl: '',
  };
  const emailCfg = () => ({ ...EMAIL_DEFAULTS, ...store.get(K.email, {}) });
  const emailState = () => ({ lastCheckAt: 0, lastSentAt: 0, listingSeen: {}, msgSeen: {}, lastResult: '', lastError: '', ...store.get(K.emailState, {}) });

  function minutesOf(t) {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  // Venster mag over middernacht lopen (bv. 22:00 tot 07:00).
  function inWindow(cfg, d = new Date()) {
    const now = d.getHours() * 60 + d.getMinutes();
    const a = minutesOf(cfg.from), b = minutesOf(cfg.until);
    if (a === b) return true;
    return a < b ? now >= a && now < b : now >= a || now < b;
  }
  const intervalMs = (cfg) => Math.max(5, (+cfg.everyH || 0) * 60 + (+cfg.everyM || 0)) * 60000;

  function postJSON(url, body, viaPage) {
    if (!viaPage && typeof GM_xmlhttpRequest === 'function') {
      return new Promise((ok, fail) =>
        GM_xmlhttpRequest({
          method: 'POST',
          url,
          data: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000,
          onload: (r) => (r.status >= 200 && r.status < 300 ? ok(r.responseText) : fail(new Error('HTTP ' + r.status + ': ' + String(r.responseText).slice(0, 150)))),
          onerror: () => fail(new Error('Netwerkfout')),
          ontimeout: () => fail(new Error('Time-out')),
        })
      );
    }
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => {
      const t = await r.text();
      if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 150));
      return t;
    });
  }

  async function sendEmail(cfg, subject, html, text, payload) {
    const to = String(cfg.to).split(/[,;\s]+/).filter(Boolean);
    if (!to.length) throw new Error('Vul minstens één e-mailadres in');
    if (cfg.provider === 'webhook') {
      if (!/^https:\/\//.test(cfg.webhookUrl) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(cfg.webhookUrl)) throw new Error('De webhook-URL moet met https:// beginnen');
      return postJSON(cfg.webhookUrl, { to, subject, html, text, ...payload });
    }
    if (!cfg.serviceId || !cfg.templateId || !cfg.publicKey) throw new Error('Vul Service ID, Template ID en Public key van EmailJS in');
    // EmailJS staat standaard alleen aanroepen vanuit een browserpagina toe, dus via fetch in de pagina.
    return postJSON('https://api.emailjs.com/api/v1.0/email/send', {
      service_id: cfg.serviceId,
      template_id: cfg.templateId,
      user_id: cfg.publicKey,
      template_params: { to_email: to.join(','), subject, message_html: html, message_text: text },
    }, true);
  }

  async function conversations(src) {
    const S = SOURCES[src];
    const url = S.base + '/messages/api/rpc/conversations.getConversations';
    if (location.origin === S.base) {
      const r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!(r.headers.get('content-type') || '').includes('json')) throw new Error('niet ingelogd');
      return r.json();
    }
    return getJSON(url); // andere site: via GM_xmlhttpRequest met jouw cookies voor die site
  }

  async function collectNewMessages(state) {
    const out = [];
    for (const src of Object.keys(SOURCES)) {
      let d;
      try { d = await conversations(src); } catch (e) { continue; } // niet ingelogd op die site
      for (const c of (d.result && d.result.data) || []) {
        if (!(c.unreadMessagesCount > 0)) continue;
        const last = c.latestMessage || {};
        const key = src + ':' + c.conversationId;
        if (state.msgSeen[key] === last.id) continue; // dit laatste bericht is al gemaild
        out.push({
          key,
          lastId: last.id,
          src,
          from: (c.otherParticipant || {}).name || 'Onbekend',
          title: c.title || '',
          text: String(last.text || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          unread: c.unreadMessagesCount,
          url: SOURCES[src].base + '/messages/' + encodeURIComponent(c.conversationId),
        });
      }
    }
    return out;
  }

  async function collectNewListings(cfg, state) {
    const groups = [];
    const searches = store.get(K.searches, []).filter((s) => !cfg.searchIds || cfg.searchIds.includes(s.id));
    for (const s of searches) {
      let r;
      try { r = await runSearch({ ...CONFIG.defaultSearch, ...s, sort: 'newest', maxPerSource: 100 }); } catch (e) { continue; }
      const keys = r.items.map((i) => i.key);
      const prev = state.listingSeen[s.id];
      if (!prev) { state.listingSeen[s.id] = keys; continue; } // eerste keer: huidige stand vastleggen, niets mailen
      const ps = new Set(prev);
      const fresh = r.items.filter((i) => !ps.has(i.key));
      if (fresh.length) groups.push({ search: s, items: fresh, keys });
    }
    return groups;
  }

  function emailHtml(groups, msgs) {
    const meta = (i) => esc([SOURCES[i.src].name, i.city, i.km != null ? i.km + ' km' : '', i.date].filter(Boolean).join(' · '));
    const row = (i) => `<tr><td style="padding:6px 10px 6px 0;vertical-align:top;width:110px">${i.img ? `<a href="${esc(i.url)}"><img src="${esc(i.img)}" width="100" style="border-radius:6px;display:block" alt=""></a>` : ''}</td>
      <td style="padding:6px 0;vertical-align:top;font:14px Arial,sans-serif"><a href="${esc(i.url)}" style="color:#2d3c4d;font-weight:bold;text-decoration:none">${esc(i.title)}</a><br>
      <b>${esc(i.price)}</b><br><span style="color:#666;font-size:12px">${meta(i)}</span></td></tr>`;
    let h = '<div style="font:14px Arial,sans-serif;color:#1d1d1b;max-width:640px">';
    if (msgs.length) {
      h += `<h2 style="font-size:17px;margin:16px 0 6px">Nieuwe berichten (${msgs.length})</h2><table cellspacing="0" cellpadding="0">` +
        msgs.map((m) => `<tr><td style="padding:6px 0;font:14px Arial,sans-serif"><a href="${esc(m.url)}" style="color:#2d3c4d;font-weight:bold;text-decoration:none">${esc(m.from)}${m.title ? ' – ' + esc(m.title) : ''}</a>
          <span style="color:#666;font-size:12px">(${SOURCES[m.src].name}, ${m.unread} ongelezen)</span><br><span style="color:#444">${esc(m.text)}</span></td></tr>`).join('') + '</table>';
    }
    for (const g of groups) {
      h += `<h2 style="font-size:17px;margin:16px 0 6px">${esc(g.search.name)} – ${g.items.length} nieuw</h2><table cellspacing="0" cellpadding="0">` +
        g.items.slice(0, 25).map(row).join('') + '</table>' +
        (g.items.length > 25 ? `<p style="color:#666">…en nog ${g.items.length - 25} meer.</p>` : '');
    }
    return h + '<p style="color:#999;font-size:11px;margin-top:20px">Verstuurd door de Zoekertjes-app (Marktplaats &amp; 2dehands).</p></div>';
  }

  function emailText(groups, msgs) {
    const lines = [];
    if (msgs.length) {
      lines.push('NIEUWE BERICHTEN (' + msgs.length + ')');
      msgs.forEach((m) => lines.push('- ' + m.from + (m.title ? ' – ' + m.title : '') + ': ' + m.text + '\n  ' + m.url));
      lines.push('');
    }
    for (const g of groups) {
      lines.push(g.search.name.toUpperCase() + ' – ' + g.items.length + ' NIEUW');
      g.items.slice(0, 25).forEach((i) => lines.push('- ' + i.title + ' | ' + i.price + ' | ' + [SOURCES[i.src].name, i.city, i.km != null ? i.km + ' km' : ''].filter(Boolean).join(', ') + '\n  ' + i.url));
      lines.push('');
    }
    return lines.join('\n');
  }

  const slim = (i) => ({ title: i.title, price: i.price, city: i.city, km: i.km, site: SOURCES[i.src].name, url: i.url, image: i.imgL || i.img, date: i.date });

  let emailBusy = false;
  async function checkEmail(force) {
    const cfg = emailCfg();
    if (!force && (!cfg.enabled || !inWindow(cfg))) return;
    if (emailBusy) return;
    const state = emailState();
    const now = Date.now();
    // Gedeelde tijdstempel: met meerdere tabbladen open wordt er toch maar één keer gecontroleerd.
    if (!force && now - state.lastCheckAt < intervalMs(cfg) - 30000) return;
    emailBusy = true;
    state.lastCheckAt = now;
    store.set(K.emailState, state);
    try {
      const groups = cfg.listings ? await collectNewListings(cfg, state) : [];
      const msgs = cfg.messages ? await collectNewMessages(state) : [];
      const n = groups.reduce((a, g) => a + g.items.length, 0);
      if (n || msgs.length) {
        const subject = 'Zoekertjes: ' + [
          n ? n + ' nieuwe advertentie' + (n > 1 ? 's' : '') : '',
          msgs.length ? msgs.length + (msgs.length > 1 ? ' nieuwe berichten' : ' nieuw bericht') : '',
        ].filter(Boolean).join(' en ');
        await sendEmail(cfg, subject, emailHtml(groups, msgs), emailText(groups, msgs), {
          listings: groups.flatMap((g) => g.items.map((i) => ({ search: g.search.name, ...slim(i) }))),
          messages: msgs.map(({ key, lastId, ...m }) => ({ ...m, site: SOURCES[m.src].name })),
        });
        // Pas na geslaagde verzending als "gemaild" markeren.
        groups.forEach((g) => { state.listingSeen[g.search.id] = [...new Set([...(state.listingSeen[g.search.id] || []), ...g.keys])].slice(-3000); });
        msgs.forEach((m) => { state.msgSeen[m.key] = m.lastId; });
        state.lastSentAt = Date.now();
        state.lastResult = subject;
      } else {
        state.lastResult = 'Niets nieuws gevonden';
      }
      state.lastError = '';
    } catch (e) {
      state.lastError = e.message;
    } finally {
      store.set(K.emailState, state);
      emailBusy = false;
    }
    return state;
  }

  async function sendTestEmail(cfg) {
    const s = store.get(K.searches, [])[0];
    let groups = [];
    if (s) {
      try {
        const r = await runSearch({ ...CONFIG.defaultSearch, ...s, sort: 'newest', maxPerSource: 100 });
        groups = [{ search: { ...s, name: s.name + ' (voorbeeld)' }, items: r.items.slice(0, 3) }];
      } catch (e) {}
    }
    const html = '<p style="font:14px Arial,sans-serif">Dit is een testmail van de Zoekertjes-app. Zo ziet een melding eruit:</p>' + emailHtml(groups, []);
    await sendEmail(cfg, 'Testmail Zoekertjes-app', html, 'Testmail van de Zoekertjes-app.\n\n' + emailText(groups, []), {
      test: true,
      listings: groups.flatMap((g) => g.items.map((i) => ({ search: g.search.name, ...slim(i) }))),
      messages: [],
    });
  }

  // ---------- Widget ----------
  const widgetCss = `
  #mpw{position:fixed;right:16px;bottom:16px;width:340px;max-width:calc(100vw - 32px);z-index:2147483000;
    font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d1d1b;background:#fff;
    border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);overflow:hidden;border:1px solid #e6e6e6}
  #mpw.min .mpw-body,#mpw.min .mpw-bar,#mpw.min .mpw-tabs{display:none}
  .mpw-head{display:flex;align-items:center;gap:6px;padding:8px 8px 8px 12px;background:#eda566;color:#1d1d1b}
  .mpw-head b{flex:1;font-size:13px;letter-spacing:.2px}
  .mpw-tabs{display:flex;border-bottom:1px solid #eee}
  .mpw-tab{flex:1;padding:8px;border:0;background:none;cursor:pointer;font:inherit;font-weight:600;color:#777;border-bottom:3px solid transparent}
  .mpw-tab.on{color:#1d1d1b;border-bottom-color:#2d3c4d}
  .mpw-tab .n{display:inline-block;min-width:18px;padding:0 5px;margin-left:4px;border-radius:9px;background:#e4572e;color:#fff;font-size:11px;line-height:18px}
  .mpw-tab .n:empty{display:none}
  .mpw-bar{height:3px;background:#f1f1f1}
  .mpw-bar i{display:block;height:100%;width:0;background:#2d3c4d;transition:width 1s linear}
  .mpw-body{max-height:380px;overflow:auto}
  .mpw-item{display:flex;gap:10px;padding:8px 12px;text-decoration:none;color:inherit;border-bottom:1px solid #f3f3f3;align-items:center}
  .mpw-item:hover{background:#faf6f2}
  .mpw-item img,.mpw-item .ph{width:52px;height:52px;border-radius:6px;object-fit:cover;flex:none;background:#eee}
  .mpw-item .t{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mpw-item .s{color:#666;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mpw-item .m{min-width:0;flex:1}
  .mpw-item.new .t::before{content:"NIEUW";font-size:10px;background:#2d3c4d;color:#fff;border-radius:4px;padding:1px 5px;margin-right:6px;vertical-align:1px}
  .mpw-empty{padding:18px 12px;color:#666;text-align:center}
  .mpw-empty a{color:#2d3c4d}
  .mpw-icon{border:0;background:rgba(255,255,255,.35);border-radius:6px;min-width:26px;height:26px;cursor:pointer;font-size:13px;line-height:26px;padding:0 6px}
  .mpw-icon:hover{background:rgba(255,255,255,.6)}
  .mpw-src{display:inline-block;font-size:10px;font-weight:700;color:#fff;border-radius:4px;padding:0 4px;margin-right:4px;vertical-align:1px}
  `;

  const root = document.createElement('div');
  root.id = 'mpw';
  root.innerHTML = `
    <style>${widgetCss}</style>
    <div class="mpw-head">
      <b>Zoekertjes live</b>
      <button class="mpw-icon" data-a="app" title="Open de zoekertjes-app (lijst, raster, kaart)">Zoeken ▦</button>
      <button class="mpw-icon" data-a="pause" title="Pauzeer wisselen">⏸</button>
      <button class="mpw-icon" data-a="min" title="Minimaliseren">–</button>
    </div>
    <div class="mpw-tabs">
      <button class="mpw-tab" data-tab="messages">Berichten<span class="n"></span></button>
      <button class="mpw-tab" data-tab="listings">Nieuwe zoekertjes<span class="n"></span></button>
    </div>
    <div class="mpw-bar"><i></i></div>
    <div class="mpw-body"></div>`;
  document.body.appendChild(root);

  const $w = (s) => root.querySelector(s);
  const wBody = $w('.mpw-body');
  const wBar = $w('.mpw-bar i');
  const ws = { tab: 'messages', paused: false, hover: false, left: CONFIG.switchSeconds, messages: null, listings: null };
  let seen = new Set(store.get(K.seen, []));

  function srcBadge(src) {
    const S = SOURCES[src];
    return `<span class="mpw-src" style="background:${S.color}">${S.short}</span>`;
  }

  // Interne berichten-API die de berichtenpagina van Marktplaats/2dehands zelf gebruikt.
  async function fetchMessages() {
    const res = await fetch('/messages/api/rpc/conversations.getConversations', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 403) return { loggedOut: true, items: [] };
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('json')) {
      // Niet ingelogd geeft soms een HTML-pagina terug in plaats van JSON.
      if (type.includes('html')) return { loggedOut: true, items: [] };
      throw new Error('Berichten: HTTP ' + res.status);
    }
    const data = await res.json();
    const list = (data.result && data.result.data) || [];
    // Ongelezen eerst, daarna op datum van het laatste bericht.
    list.sort((a, b) => (b.unreadMessagesCount > 0) - (a.unreadMessagesCount > 0) ||
      String(b.latestReceivedDate || '').localeCompare(String(a.latestReceivedDate || '')));
    const items = list.slice(0, CONFIG.widgetItems).map((c) => {
      const other = c.otherParticipant || {};
      const last = c.latestMessage || {};
      return {
        title: (other.name || 'Onbekend') + (c.title ? ' – ' + c.title : ''),
        sub: String(last.text || '').replace(/\s+/g, ' ').trim(),
        unread: c.unreadMessagesCount || 0,
        img: c.imageUrl || '',
        url: '/messages/' + encodeURIComponent(c.conversationId || ''),
      };
    });
    return { loggedOut: false, items };
  }

  async function headerUnreadCount() {
    try {
      const r = await fetch('/header/messages/message-count', { credentials: 'include', headers: { Accept: 'application/json' } });
      const d = await r.json();
      return typeof d.unreadMessagesCount === 'number' ? d.unreadMessagesCount : null;
    } catch (e) {
      return null;
    }
  }

  // De widget toont de nieuwste advertenties van je eerste opgeslagen zoekopdracht.
  function widgetSearch() {
    const saved = store.get(K.searches, []);
    const base = saved[0] || store.get(K.last, null) || CONFIG.defaultSearch;
    return { ...CONFIG.defaultSearch, ...base, sort: 'newest', maxPerSource: 30 };
  }

  function wItemHtml(it, cls, badge) {
    const img = it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : '<span class="ph"></span>';
    return `<a class="mpw-item ${cls}" href="${esc(it.url)}" target="_blank" rel="noopener">${img}
      <span class="m"><div class="t">${badge || ''}${esc(it.title)}</div><div class="s">${esc(it.sub)}</div></span></a>`;
  }

  function wRender() {
    root.querySelectorAll('.mpw-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === ws.tab));
    const msg = ws.messages;
    const lst = ws.listings;
    const unread = msg && !msg.error ? (msg.headerCount != null ? msg.headerCount : msg.items.reduce((a, i) => a + (i.unread || 0), 0)) : 0;
    const newCount = lst && !lst.error ? lst.items.filter((i) => i.isNew).length : 0;
    $w('[data-tab="messages"] .n').textContent = unread || '';
    $w('[data-tab="listings"] .n').textContent = newCount || '';

    if (ws.tab === 'messages') {
      if (!msg) wBody.innerHTML = '<div class="mpw-empty">Berichten laden…</div>';
      else if (msg.error) wBody.innerHTML = `<div class="mpw-empty">${esc(msg.error)}<br><a href="/messages">Open berichten</a></div>`;
      else if (msg.loggedOut) wBody.innerHTML = '<div class="mpw-empty">Log in om je berichten te zien.</div>';
      else if (!msg.items.length)
        wBody.innerHTML = `<div class="mpw-empty">${msg.headerCount ? msg.headerCount + ' ongelezen bericht(en)' : 'Geen nieuwe berichten'}<br><a href="/messages">Open berichten</a></div>`;
      else wBody.innerHTML = msg.items.map((i) => wItemHtml(i, i.unread ? 'new' : '')).join('');
    } else {
      if (!lst) wBody.innerHTML = '<div class="mpw-empty">Zoekertjes laden…</div>';
      else if (lst.error) wBody.innerHTML = `<div class="mpw-empty">${esc(lst.error)}</div>`;
      else if (!lst.items.length) wBody.innerHTML = '<div class="mpw-empty">Geen zoekertjes gevonden.</div>';
      else wBody.innerHTML = lst.items.map((i) => wItemHtml(i, i.isNew ? 'new' : '', srcBadge(i.src))).join('');
    }
  }

  async function wRefresh() {
    const [m, l] = await Promise.allSettled([fetchMessages(), runSearch(widgetSearch())]);
    ws.messages = m.status === 'fulfilled' ? { ...m.value, headerCount: await headerUnreadCount() } : { error: 'Berichten konden niet geladen worden.' };
    if (l.status === 'fulfilled') {
      const found = l.value.items.slice(0, CONFIG.widgetItems);
      if (!seen.size) { found.forEach((i) => seen.add(i.key)); saveSeen(); } // eerste keer: huidige stand = gezien
      ws.listings = {
        items: found.map((i) => ({ ...i, sub: [i.price, i.city, i.km != null ? i.km + ' km' : '', i.date].filter(Boolean).join(' · '), isNew: !seen.has(i.key) })),
      };
    } else ws.listings = { error: /zoekterm|postcode/.test(l.reason && l.reason.message) ? 'Open “Zoeken ▦” en sla een zoekopdracht op; de eerste verschijnt hier.' : 'Zoekertjes konden niet geladen worden.' };
    wRender();
  }

  function saveSeen() {
    store.set(K.seen, [...seen].slice(-800));
  }

  function wSwitch(tab) {
    if (ws.tab === 'listings' && ws.listings && ws.listings.items) {
      ws.listings.items.forEach((i) => seen.add(i.key));
      saveSeen();
    }
    ws.tab = tab || (ws.tab === 'messages' ? 'listings' : 'messages');
    ws.left = CONFIG.switchSeconds;
    wRender();
    wTick();
  }

  function wTick() {
    wBar.style.width = ((CONFIG.switchSeconds - ws.left) / CONFIG.switchSeconds) * 100 + '%';
  }

  setInterval(() => {
    if (ws.paused || ws.hover) return;
    ws.left -= 1;
    if (ws.left <= 0) wSwitch();
    else wTick();
  }, 1000);

  root.addEventListener('mouseenter', () => (ws.hover = true));
  root.addEventListener('mouseleave', () => (ws.hover = false));
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-a]');
    if (!t) return;
    if (t.dataset.tab) return wSwitch(t.dataset.tab);
    const a = t.dataset.a;
    if (a === 'pause') {
      ws.paused = !ws.paused;
      t.textContent = ws.paused ? '▶' : '⏸';
      t.title = ws.paused ? 'Hervat wisselen' : 'Pauzeer wisselen';
    } else if (a === 'min') {
      root.classList.toggle('min');
      t.textContent = root.classList.contains('min') ? '+' : '–';
    } else if (a === 'app') {
      openApp();
    }
  });

  // ---------- App: lijst, raster, kaart, opgeslagen zoekopdrachten, rit ----------
  const appCss = `
  #mpa{position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;background:#f6f5f3;
    font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d1d1b}
  #mpa *{box-sizing:border-box}
  #mpa button{font:inherit}
  #mpa .top{display:flex;align-items:center;gap:10px;padding:8px 14px;background:#2d3c4d;color:#fff;flex-wrap:wrap}
  #mpa .top h1{font-size:16px;margin:0;flex:1;min-width:120px}
  #mpa .seg{display:flex;background:rgba(255,255,255,.12);border-radius:8px;padding:2px}
  #mpa .seg button{border:0;background:none;color:#fff;padding:5px 12px;border-radius:6px;cursor:pointer;font-weight:600}
  #mpa .seg button.on{background:#fff;color:#2d3c4d}
  #mpa .x{border:0;background:rgba(255,255,255,.15);color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px}
  #mpa .tgl-side{display:none}
  #mpa .body{flex:1;display:flex;min-height:0}
  #mpa .side{width:310px;flex:none;overflow-y:auto;overflow-x:hidden;background:#fff;border-right:1px solid #e4e2de}
  #mpa .sec{padding:12px 14px;border-bottom:1px solid #eee}
  #mpa .sec h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#666}
  #mpa form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
  #mpa form label{font-size:12px;color:#555;display:flex;flex-direction:column;gap:3px}
  #mpa form .full{grid-column:1/-1}
  #mpa form input,#mpa form select{font:inherit;padding:6px 8px;border:1px solid #ccc;border-radius:6px;min-width:0;background:#fff;color:inherit}
  #mpa .srcs{grid-column:1/-1;display:flex;gap:8px}
  #mpa .srcs label{flex:1;flex-direction:row;align-items:center;gap:6px;border:1px solid #ddd;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:13px;color:#1d1d1b}
  #mpa .btns{grid-column:1/-1;display:flex;gap:8px}
  #mpa .btn{flex:1;padding:8px;border:0;border-radius:6px;background:#2d3c4d;color:#fff;cursor:pointer;font-weight:600}
  #mpa .btn.alt{background:#eee;color:#1d1d1b}
  #mpa .btn:disabled{opacity:.6;cursor:default}
  #mpa .saved{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
  #mpa .saved li{display:flex;align-items:center;gap:6px;border:1px solid #eee;border-radius:6px;padding:6px 8px;cursor:pointer}
  #mpa .saved li:hover{background:#faf6f2}
  #mpa .saved li.on{border-color:#2d3c4d;background:#f0f3f6}
  #mpa .saved li .nm{flex:1;min-width:0}
  #mpa .saved li .nm b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #mpa .saved li .nm small{color:#666;font-size:11px}
  #mpa .saved li button{border:0;background:none;color:#999;cursor:pointer;font-size:14px}
  #mpa .saved li button:hover{color:#b33}
  #mpa .muted{color:#666;font-size:12px}
  #mpa .trip ol{margin:6px 0;padding-left:20px;display:flex;flex-direction:column;gap:6px}
  #mpa .trip li{font-size:13px}
  #mpa .trip li a{color:#2d3c4d;font-weight:600;text-decoration:none}
  #mpa .trip li small{display:block;color:#666}
  #mpa .linkbtn{border:0;background:none;color:#b33;cursor:pointer;font-size:12px;padding:0}
  #mpa .go{display:block;text-align:center;padding:8px;border-radius:6px;background:#0a7d4f;color:#fff;font-weight:600;text-decoration:none;margin-top:6px}
  #mpa .main{flex:1;min-width:0;display:flex;flex-direction:column}
  #mpa .status{padding:8px 14px;font-size:13px;color:#555;background:#fff;border-bottom:1px solid #e4e2de}
  #mpa .res{flex:1;overflow:auto;padding:12px 14px}
  #mpa .mapbox{flex:1;min-height:0;display:none}
  #mpa.view-map .res{display:none}
  #mpa.view-map .mapbox{display:block}
  #mpa .badge{display:inline-block;font-size:10px;font-weight:700;color:#fff;border-radius:4px;padding:1px 5px}
  #mpa .new{background:#e4572e}
  #mpa .list{display:flex;flex-direction:column;gap:8px;max-width:980px}
  #mpa .row{display:flex;gap:12px;background:#fff;border-radius:10px;padding:8px;border:1px solid #ebe9e5;align-items:stretch}
  #mpa .row:hover{border-color:#cfc9c0}
  #mpa .row .ph{width:140px;height:105px;flex:none;border-radius:8px;overflow:hidden;background:#eee;display:block}
  #mpa .row .ph img{width:100%;height:100%;object-fit:cover;display:block}
  #mpa .row .info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
  #mpa .row .ttl{font-weight:650;color:#1d1d1b;text-decoration:none;font-size:15px}
  #mpa .row .ttl:hover{text-decoration:underline}
  #mpa .row .price{font-weight:700}
  #mpa .row .desc{color:#555;font-size:12.5px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  #mpa .meta{color:#666;font-size:12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  #mpa .acts{display:flex;gap:6px;margin-top:auto}
  #mpa .acts button{border:1px solid #ddd;background:#fff;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px}
  #mpa .acts button:hover{background:#f3f3f3}
  #mpa .acts button.in{background:#0a7d4f;color:#fff;border-color:#0a7d4f}
  #mpa .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
  #mpa .card{background:#fff;border-radius:10px;overflow:hidden;border:1px solid #ebe9e5;display:flex;flex-direction:column}
  #mpa .card:hover{box-shadow:0 4px 14px rgba(0,0,0,.08)}
  #mpa .card .ph{position:relative;display:block;aspect-ratio:4/3;background:#eee}
  #mpa .card .ph img{width:100%;height:100%;object-fit:cover;display:block}
  #mpa .card .ph .badges{position:absolute;left:6px;top:6px;display:flex;gap:4px}
  #mpa .card .info{padding:8px 10px;display:flex;flex-direction:column;gap:3px;flex:1}
  #mpa .card .ttl{font-weight:650;color:#1d1d1b;text-decoration:none;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:2.6em}
  #mpa .empty{padding:40px;text-align:center;color:#666}
  #mpa .legend{position:absolute;right:10px;bottom:24px;z-index:500;background:#fff;border-radius:8px;padding:6px 10px;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.2);display:flex;gap:10px}
  #mpa .legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:-1px}
  #mpa .modal{position:absolute;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:2000;padding:16px}
  #mpa .modal[hidden]{display:none}
  #mpa .dlg{background:#fff;border-radius:12px;width:min(560px,100%);max-height:100%;overflow:auto;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.3)}
  #mpa .dlg h2{margin:0 0 4px;font-size:18px}
  #mpa .dlg fieldset{grid-column:1/-1;border:1px solid #e4e2de;border-radius:8px;padding:8px 10px;margin:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
  #mpa .dlg fieldset[hidden]{display:none}
  #mpa .dlg legend{font-size:12px;color:#555;padding:0 4px}
  #mpa .dlg .chk{flex-direction:row;align-items:center;gap:6px;color:#1d1d1b;font-size:13px}
  #mpa .dlg .help{grid-column:1/-1;font-size:12px;color:#555;margin:0}
  #mpa .dlg .help code{background:#f3f1ee;padding:0 4px;border-radius:4px}
  #mpa .dlg .msg{grid-column:1/-1;font-size:13px;min-height:1.2em}
  #mpa .dlg .msg.err{color:#b33}
  #mpa .dlg .msg.ok{color:#0a7d4f}
  #mpa .dlg .sids{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px 14px}
  .mpa-tip{padding:0!important;border:0!important;border-radius:8px!important;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.25)!important}
  .mpa-tip .c{width:230px;font:13px/1.3 system-ui,sans-serif;white-space:normal}
  .mpa-tip img{display:block;width:230px;height:160px;object-fit:cover;background:#eee}
  .mpa-tip .b{padding:7px 9px}
  .mpa-tip .t{font-weight:600}
  .mpa-tip .s{color:#666;font-size:12px;margin-top:2px}
  .mpa-pop{width:230px}
  .mpa-pop .c{width:230px;font:13px/1.3 system-ui,sans-serif}
  .mpa-pop img{display:block;width:230px;height:150px;object-fit:cover;background:#eee;border-radius:6px}
  .mpa-pop .t{font-weight:600;margin-top:6px}
  .mpa-pop .s{color:#666;font-size:12px}
  .mpa-pop a{display:block;margin-top:6px;font-weight:600}
  .mpa-pop button{display:block;width:100%;margin-top:6px;border:0;border-radius:6px;padding:6px 8px;background:#2d3c4d;color:#fff;cursor:pointer;font:inherit;font-weight:600}
  .mpa-pin{width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)}
  .mpa-pin.in{background:#0a7d4f!important;width:18px;height:18px}
  .mpa-home{font-size:24px;line-height:24px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))}
  @media (max-width:760px){
    #mpa .tgl-side{display:block}
    #mpa .body{flex-direction:column}
    #mpa .side{width:auto;max-height:55vh;border-right:0;border-bottom:1px solid #e4e2de;display:none}
    #mpa.side-open .side{display:block}
    #mpa .row .ph{width:96px;height:80px}
    #mpa .grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
  }
  `;

  let app = null;

  function openApp() {
    if (app) {
      app.el.style.display = 'flex';
      if (app.view === 'map') app.showMap();
      return;
    }
    const el = document.createElement('div');
    el.id = 'mpa';
    el.innerHTML = `<style>${appCss}</style>
      <div class="top">
        <button class="x tgl-side" data-a="side" title="Filters">☰</button>
        <h1>Zoekertjes</h1>
        <div class="seg" role="tablist">
          <button data-view="list">Lijst</button><button data-view="grid">Raster</button><button data-view="map">Kaart</button>
        </div>
        <button class="x" data-a="close" title="Sluiten (Esc)">✕</button>
      </div>
      <div class="body">
        <aside class="side">
          <div class="sec">
            <h3>Zoeken</h3>
            <form>
              <label class="full">Zoekterm<input name="query" placeholder="bv. fiets, kast, lego" required></label>
              <label>Postcode<input name="postcode" placeholder="1234AB of 1234" required></label>
              <label>Straal (km)<input name="radiusKm" type="number" min="1" max="250"></label>
              <label>Prijs min (€)<input name="priceMin" type="number" min="0" step="1"></label>
              <label>Prijs max (€)<input name="priceMax" type="number" min="0" step="1"></label>
              <label>Sorteren<select name="sort">
                <option value="newest">Nieuwste eerst</option>
                <option value="price_asc">Prijs laag → hoog</option>
                <option value="price_desc">Prijs hoog → laag</option>
                <option value="distance">Dichtstbij eerst</option>
              </select></label>
              <label>Geplaatst<select name="age">
                ${Object.entries(AGES).map(([k, a]) => `<option value="${k}">${a.label}</option>`).join('')}
              </select></label>
              <label>Max. per site<input name="maxPerSource" type="number" min="100" max="1000" step="100"></label>
              <div class="srcs">
                <label><input type="checkbox" name="src_mp"> Marktplaats</label>
                <label><input type="checkbox" name="src_tdh"> 2dehands</label>
              </div>
              <div class="btns">
                <button class="btn" type="submit">Zoeken</button>
                <button class="btn alt" type="button" data-a="save">Opslaan…</button>
              </div>
            </form>
          </div>
          <div class="sec">
            <h3>Opgeslagen zoekopdrachten</h3>
            <ul class="saved"></ul>
            <p class="muted" style="margin:8px 0 4px">🔔 = melding bij nieuwe advertenties binnen het tijdvak van die zoekopdracht. Elke ${CONFIG.notifyMinutes} min gecontroleerd zolang er een Marktplaats- of 2dehands-tabblad open is.</p>
            <button class="linkbtn" data-a="testnotify" style="color:#2d3c4d">Testmelding sturen</button>
          </div>
          <div class="sec">
            <h3>E-mailmeldingen</h3>
            <div class="muted emailsum"></div>
            <button class="btn alt" type="button" data-a="email" style="width:100%;margin-top:8px">E-mail instellen…</button>
          </div>
          <div class="sec trip"></div>
        </aside>
        <section class="main">
          <div class="status">Klaar om te zoeken.</div>
          <div class="res"></div>
          <div class="mapbox" style="position:relative"></div>
        </section>
      </div>
      <div class="modal" hidden>
        <div class="dlg" role="dialog" aria-label="E-mailmeldingen">
          <h2>E-mailmeldingen</h2>
          <p class="muted" style="margin:0 0 12px">Stuurt een e-mail als er nieuwe advertenties of berichten zijn. Werkt zolang er een Marktplaats- of 2dehands-tabblad open is.</p>
          <form class="emailform">
            <label class="chk full"><input type="checkbox" name="enabled"> E-mailmeldingen aan</label>
            <label class="full">Naar (meerdere adressen met komma's scheiden)<input name="to" type="text" placeholder="jij@voorbeeld.nl, iemand@voorbeeld.be" autocomplete="off"></label>
            <label>Van<input name="from" type="time"></label>
            <label>Tot<input name="until" type="time"></label>
            <label>Elke … uur<input name="everyH" type="number" min="0" max="48"></label>
            <label>en … minuten<input name="everyM" type="number" min="0" max="59" step="5"></label>
            <label class="chk"><input type="checkbox" name="listings"> Nieuwe zoekertjes</label>
            <label class="chk"><input type="checkbox" name="messages"> Nieuwe berichten</label>
            <fieldset class="sidbox"><legend>Voor deze opgeslagen zoekopdrachten</legend><div class="sids"></div></fieldset>
            <label class="full">Verzenden via<select name="provider">
              <option value="emailjs">EmailJS (gratis, koppel je eigen Gmail/Outlook)</option>
              <option value="webhook">Webhook (Make, Zapier, n8n, …)</option>
            </select></label>
            <fieldset data-p="emailjs"><legend>EmailJS</legend>
              <label>Service ID<input name="serviceId" autocomplete="off"></label>
              <label>Template ID<input name="templateId" autocomplete="off"></label>
              <label class="full">Public key<input name="publicKey" autocomplete="off"></label>
              <p class="help">Maak een gratis account op emailjs.com, voeg een e-mailservice toe (bv. Gmail) en maak een template met
                <b>To Email</b> = <code>{{to_email}}</code>, <b>Subject</b> = <code>{{subject}}</code> en als inhoud <code>{{{message_html}}}</code> (drie accolades, zodat de opmaak en foto's meekomen).
                De Public key staat bij Account → General.</p>
            </fieldset>
            <fieldset data-p="webhook" hidden><legend>Webhook</legend>
              <label class="full">Webhook-URL<input name="webhookUrl" type="url" placeholder="https://hook.eu1.make.com/…" autocomplete="off"></label>
              <p class="help">De app stuurt JSON met <code>to</code>, <code>subject</code>, <code>html</code>, <code>text</code>, <code>listings</code> en <code>messages</code>. Laat je automatisering daarmee een e-mail versturen.</p>
            </fieldset>
            <div class="msg"></div>
            <div class="btns">
              <button class="btn" type="submit">Opslaan</button>
              <button class="btn alt" type="button" data-e="test">Testmail</button>
              <button class="btn alt" type="button" data-e="now">Nu controleren</button>
              <button class="btn alt" type="button" data-e="close">Sluiten</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.appendChild(el);

    const form = el.querySelector('form');
    const statusEl = el.querySelector('.status');
    const resEl = el.querySelector('.res');
    const mapEl = el.querySelector('.mapbox');

    app = {
      el,
      view: store.get(K.view, 'grid'),
      search: { ...CONFIG.defaultSearch, ...store.get(K.last, {}) },
      activeId: null,
      result: null,
      newKeys: new Set(),
      trip: store.get(K.trip, []),
      map: null,
      markers: new Map(),
      token: 0,
      showMap,
    };

    // --- formulier ---
    function fillForm(s) {
      form.query.value = s.query || '';
      form.postcode.value = s.postcode || '';
      form.radiusKm.value = s.radiusKm;
      form.priceMin.value = s.priceMin || '';
      form.priceMax.value = s.priceMax || '';
      form.sort.value = s.sort || 'newest';
      form.age.value = AGES[s.age] ? s.age : 'all';
      form.maxPerSource.value = s.maxPerSource;
      form.src_mp.checked = !!s.sources.mp;
      form.src_tdh.checked = !!s.sources.tdh;
    }
    function readForm() {
      return {
        query: form.query.value.trim(),
        postcode: form.postcode.value.trim(),
        radiusKm: Math.min(250, Math.max(1, +form.radiusKm.value || 100)),
        priceMin: form.priceMin.value,
        priceMax: form.priceMax.value,
        sort: form.sort.value,
        age: form.age.value,
        maxPerSource: Math.min(1000, Math.max(100, +form.maxPerSource.value || 200)),
        sources: { mp: form.src_mp.checked, tdh: form.src_tdh.checked },
      };
    }
    function describe(s) {
      const bits = ['“' + (s.query || '') + '”', s.postcode + ' +' + s.radiusKm + ' km'];
      if (s.priceMin || s.priceMax) bits.push('€' + (s.priceMin || 0) + '–' + (s.priceMax || '∞'));
      if (s.age && s.age !== 'all') bits.push(AGES[s.age].label.toLowerCase());
      bits.push(Object.keys(SOURCES).filter((k) => s.sources[k]).map((k) => SOURCES[k].short).join('+'));
      return bits.join(' · ');
    }

    // --- opgeslagen zoekopdrachten ---
    function renderSaved() {
      const list = store.get(K.searches, []);
      const ul = el.querySelector('.saved');
      if (!list.length) {
        ul.innerHTML = '<li class="muted" style="cursor:default;border-style:dashed">Nog niets opgeslagen. Stel een zoekopdracht in en klik op “Opslaan…”. De eerste in de lijst verschijnt ook in de widget.</li>';
        return;
      }
      ul.innerHTML = list.map((s) => `<li data-id="${esc(s.id)}" class="${s.id === app.activeId ? 'on' : ''}">
        <span class="nm"><b>${esc(s.name)}</b><small>${esc(describe(s))}</small></span>
        <button data-bell="${esc(s.id)}" title="${s.notify ? 'Meldingen staan aan – klik om uit te zetten' : 'Meldingen aanzetten'}" style="${s.notify ? 'color:#e4572e' : ''}">${s.notify ? '🔔' : '🔕'}</button>
        <button data-del="${esc(s.id)}" title="Verwijderen">✕</button></li>`).join('');
    }
    el.querySelector('.saved').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      const bell = e.target.closest('[data-bell]');
      const list = store.get(K.searches, []);
      if (bell) {
        e.stopPropagation();
        const s = list.find((x) => x.id === bell.dataset.bell);
        if (!s) return;
        s.notify = !s.notify;
        store.set(K.searches, list);
        renderSaved();
        if (s.notify) {
          ensureNotifyPermission();
          checkNotifications(true); // legt de huidige stand vast, zodat je alleen écht nieuwe krijgt
        }
        return;
      }
      if (del) {
        e.stopPropagation();
        const s = list.find((x) => x.id === del.dataset.del);
        if (s && confirm('Zoekopdracht “' + s.name + '” verwijderen?')) {
          store.set(K.searches, list.filter((x) => x.id !== s.id));
          if (app.activeId === s.id) app.activeId = null;
          renderSaved();
        }
        return;
      }
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const s = list.find((x) => x.id === li.dataset.id);
      if (!s) return;
      app.activeId = s.id;
      fillForm({ ...CONFIG.defaultSearch, ...s });
      el.classList.remove('side-open');
      doSearch();
    });
    el.querySelector('[data-a="testnotify"]').onclick = async () => {
      await ensureNotifyPermission();
      notify('Testmelding', 'Zo zien meldingen over nieuwe advertenties eruit.', '', location.href);
    };
    el.querySelector('[data-a="save"]').onclick = () => {
      const s = readForm();
      const list = store.get(K.searches, []);
      const current = list.find((x) => x.id === app.activeId);
      const name = prompt('Naam voor deze zoekopdracht:', current ? current.name : s.query || 'Alles rond ' + s.postcode);
      if (!name) return;
      if (current && current.name === name.trim()) Object.assign(current, s, { notify: current.notify });
      else {
        const id = 's' + Date.now().toString(36);
        list.push({ id, name: name.trim(), ...s });
        app.activeId = id;
      }
      store.set(K.searches, list);
      renderSaved();
    };

    // --- weergaven ---
    function setView(v) {
      app.view = v;
      store.set(K.view, v);
      el.classList.toggle('view-map', v === 'map');
      el.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
      if (v === 'map') showMap();
      else renderResults();
    }

    function inTrip(key) {
      return app.trip.some((t) => t.key === key);
    }

    function metaHtml(it) {
      const S = SOURCES[it.src];
      return `<span class="badge" style="background:${S.color}">${S.short}</span>
        ${app.newKeys.has(it.key) ? '<span class="badge new">NIEUW</span>' : ''}
        <span>${esc([it.city, it.km != null ? it.km + ' km' : '', it.date].filter(Boolean).join(' · '))}</span>`;
    }
    function actsHtml(it) {
      return `<div class="acts">
        ${it.lat != null ? `<button data-pin="${esc(it.key)}" title="Toon op kaart">📍 Kaart</button>` : ''}
        ${it.lat != null ? `<button data-trip="${esc(it.key)}" class="${inTrip(it.key) ? 'in' : ''}">${inTrip(it.key) ? '✓ In rit' : '+ Rit'}</button>` : ''}
      </div>`;
    }

    function renderResults() {
      const r = app.result;
      if (!r) { resEl.innerHTML = '<div class="empty">Kies een opgeslagen zoekopdracht of klik op Zoeken.</div>'; return; }
      if (!r.items.length) { resEl.innerHTML = '<div class="empty">Geen advertenties gevonden.</div>'; return; }
      if (app.view === 'list') {
        resEl.innerHTML = '<div class="list">' + r.items.map((it) => `<div class="row">
          <a class="ph" href="${esc(it.url)}" target="_blank" rel="noopener">${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : ''}</a>
          <div class="info">
            <a class="ttl" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
            <div class="price">${esc(it.price)}</div>
            <div class="meta">${metaHtml(it)}</div>
            <div class="desc">${esc(it.desc)}</div>
            ${actsHtml(it)}
          </div></div>`).join('') + '</div>';
      } else {
        resEl.innerHTML = '<div class="grid">' + r.items.map((it) => `<div class="card">
          <a class="ph" href="${esc(it.url)}" target="_blank" rel="noopener">${it.imgL ? `<img src="${esc(it.imgL)}" alt="" loading="lazy">` : ''}</a>
          <div class="info">
            <a class="ttl" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
            <div class="price">${esc(it.price)}</div>
            <div class="meta">${metaHtml(it)}</div>
            ${actsHtml(it)}
          </div></div>`).join('') + '</div>';
      }
    }

    resEl.addEventListener('click', (e) => {
      const pin = e.target.closest('[data-pin]');
      const trip = e.target.closest('[data-trip]');
      const find = (k) => app.result && app.result.items.find((i) => i.key === k);
      if (pin) {
        const it = find(pin.dataset.pin);
        if (!it) return;
        setView('map');
        const m = app.markers.get(it.key);
        if (m) app.cluster.zoomToShowLayer(m, () => m.openPopup());
      } else if (trip) {
        const it = find(trip.dataset.trip);
        if (it) toggleTrip(it);
      }
    });

    // --- kaart ---
    function pinIcon(it) {
      return L.divIcon({
        className: '',
        html: `<div class="mpa-pin${inTrip(it.key) ? ' in' : ''}" style="background:${SOURCES[it.src].color}"></div>`,
        iconSize: [18, 18],
      });
    }
    function tipHtml(it) {
      return `<div class="c">${it.imgL ? `<img src="${esc(it.imgL)}" alt="">` : ''}<div class="b">
        <div class="t">${esc(it.title)}</div>
        <div class="s">${esc([SOURCES[it.src].name, it.price, it.city, it.km != null ? it.km + ' km' : ''].filter(Boolean).join(' · '))}</div></div></div>`;
    }

    function ensureMap() {
      if (app.map) return;
      if (typeof L === 'undefined' || !L.markerClusterGroup) {
        mapEl.innerHTML = '<div class="empty">De kaartbibliotheek kon niet geladen worden.</div>';
        return;
      }
      for (const href of [
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css',
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css',
      ]) {
        if (!document.querySelector(`link[href="${href}"]`)) {
          const l = document.createElement('link');
          l.rel = 'stylesheet';
          l.href = href;
          l.onload = () => app.map && app.map.invalidateSize();
          document.head.appendChild(l);
        }
      }
      const map = L.map(mapEl).setView([51.6, 5.0], 7); // Nederland en Vlaanderen
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      app.map = map;
      app.cluster = L.markerClusterGroup({ maxClusterRadius: 40, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
      map.addLayer(app.cluster);
      app.overlay = L.layerGroup().addTo(map);
      app.tripLine = L.layerGroup().addTo(map);
      const legend = document.createElement('div');
      legend.className = 'legend';
      legend.innerHTML = Object.values(SOURCES).map((S) => `<span><i style="background:${S.color}"></i>${S.name}</span>`).join('') +
        '<span><i style="background:#0a7d4f"></i>In rit</span>';
      mapEl.appendChild(legend);
      drawMap();
    }

    function drawMap() {
      if (!app.map) return;
      app.cluster.clearLayers();
      app.overlay.clearLayers();
      app.markers.clear();
      const r = app.result;
      if (!r) return;
      const home = r.home;
      L.marker([home.lat, home.lng], {
        icon: L.divIcon({ className: '', html: '<div class="mpa-home">🏠</div>', iconSize: [24, 24] }),
        zIndexOffset: 1000,
      }).bindTooltip(esc(home.name)).addTo(app.overlay);
      L.circle([home.lat, home.lng], { radius: r.radiusKm * 1000, color: '#eda566', weight: 2, fillOpacity: 0.04, interactive: false }).addTo(app.overlay);
      const markers = r.items.filter((it) => it.lat != null).map((it) => {
        const m = L.marker([it.lat, it.lng], { icon: pinIcon(it) });
        m.bindTooltip(tipHtml(it), { direction: 'top', offset: [0, -8], className: 'mpa-tip', opacity: 1 });
        m.bindPopup(() => {
          const d = document.createElement('div');
          d.className = 'mpa-pop';
          d.innerHTML = `<div class="c">${it.imgL ? `<img src="${esc(it.imgL)}" alt="">` : ''}
            <div class="t">${esc(it.title)}</div>
            <div class="s">${esc([SOURCES[it.src].name, it.price, it.city, it.km != null ? it.km + ' km' : '', it.date].filter(Boolean).join(' · '))}</div></div>
            <a href="${esc(it.url)}" target="_blank" rel="noopener">Bekijk advertentie ↗</a>
            <button>${inTrip(it.key) ? 'Verwijderen uit rit' : '+ Toevoegen aan rit'}</button>`;
          d.querySelector('button').onclick = () => { toggleTrip(it); m.closePopup(); };
          return d;
        });
        m.on('popupopen', () => m.closeTooltip());
        app.markers.set(it.key, m);
        return m;
      });
      app.cluster.addLayers(markers);
      // Grenzen van de cirkel zelf berekenen: werkt ook als de kaart nog niet zichtbaar was.
      app.fitTo = L.latLng(home.lat, home.lng).toBounds(r.radiusKm * 2000);
      app.needsFit = true;
      drawTripLine();
    }

    function showMap() {
      ensureMap();
      if (!app.map) return;
      requestAnimationFrame(() => {
        app.map.invalidateSize();
        if (app.needsFit && app.fitTo) {
          app.map.fitBounds(app.fitTo);
          app.needsFit = false;
        }
      });
    }

    // --- rit ---
    function orderTrip(home, stops) {
      const left = stops.slice();
      const ordered = [];
      let cur = home;
      while (left.length) {
        let best = 0;
        left.forEach((s, i) => { if (dist(cur, s) < dist(cur, left[best])) best = i; });
        cur = left.splice(best, 1)[0];
        ordered.push(cur);
      }
      return ordered;
    }

    function toggleTrip(it) {
      if (inTrip(it.key)) app.trip = app.trip.filter((t) => t.key !== it.key);
      else app.trip.push({ key: it.key, src: it.src, title: it.title, city: it.city, price: it.price, lat: it.lat, lng: it.lng, url: it.url });
      store.set(K.trip, app.trip);
      const m = app.markers.get(it.key);
      if (m) m.setIcon(pinIcon(it));
      renderTrip();
      if (app.view !== 'map') renderResults();
    }

    function tripHome() {
      return (app.result && app.result.home) || null;
    }

    function drawTripLine() {
      if (!app.map) return;
      app.tripLine.clearLayers();
      const home = tripHome();
      if (!home || !app.trip.length) return;
      const pts = [home, ...orderTrip(home, app.trip), home];
      L.polyline(pts.map((p) => [p.lat, p.lng]), { color: '#0a7d4f', weight: 3, dashArray: '6 6' }).addTo(app.tripLine);
    }

    function renderTrip() {
      const box = el.querySelector('.trip');
      drawTripLine();
      if (!app.trip.length) {
        box.innerHTML = '<h3>Jouw rit</h3><div class="muted">Klik op “+ Rit” bij een advertentie (of op een punt op de kaart) om een ophaalronde samen te stellen.</div>';
        return;
      }
      const home = tripHome();
      const ordered = home ? orderTrip(home, app.trip) : app.trip;
      let km = 0;
      if (home) {
        const pts = [home, ...ordered, home];
        for (let i = 1; i < pts.length; i++) km += dist(pts[i - 1], pts[i]);
      }
      const wp = ordered.slice(0, 9).map((s) => `${s.lat},${s.lng}`).join('|');
      const gmaps = 'https://www.google.com/maps/dir/?api=1&travelmode=driving' +
        (home ? `&origin=${home.lat},${home.lng}&destination=${home.lat},${home.lng}` : `&destination=${ordered[0].lat},${ordered[0].lng}`) +
        '&waypoints=' + encodeURIComponent(wp);
      box.innerHTML = `<h3>Jouw rit · ${ordered.length} stop${ordered.length > 1 ? 's' : ''}</h3>
        ${home ? `<div class="muted">± ${Math.round(km * 1.25)} km rijden heen en terug (schatting)</div>` : '<div class="muted">Zoek eerst om de route vanaf je postcode te berekenen.</div>'}
        <ol>${ordered.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>
          <small>${esc([SOURCES[s.src] ? SOURCES[s.src].short : '', s.price, s.city].filter(Boolean).join(' · '))}</small>
          <button class="linkbtn" data-rm="${esc(s.key)}">verwijderen</button></li>`).join('')}</ol>
        ${ordered.length > 9 ? '<div class="muted">Google Maps neemt maximaal 9 tussenstops mee.</div>' : ''}
        <a class="go" href="${gmaps}" target="_blank" rel="noopener">Route openen in Google Maps</a>
        <button class="linkbtn" data-a="clear" style="margin-top:6px">Rit leegmaken</button>`;
    }
    el.querySelector('.trip').addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) {
        const t = app.trip.find((x) => x.key === rm.dataset.rm);
        if (t) toggleTrip(t);
      } else if (e.target.closest('[data-a="clear"]')) {
        const old = app.trip;
        app.trip = [];
        store.set(K.trip, []);
        old.forEach((t) => { const m = app.markers.get(t.key); if (m) m.setIcon(pinIcon(t)); });
        renderTrip();
        if (app.view !== 'map') renderResults();
      }
    });

    // --- e-mailmeldingen ---
    const modal = el.querySelector('.modal');
    const ef = el.querySelector('.emailform');
    const emsg = ef.querySelector('.msg');
    const fmtTime = (t) => (t ? new Date(t).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

    function renderEmailSummary() {
      const c = emailCfg();
      const st = emailState();
      const box = el.querySelector('.emailsum');
      if (!c.enabled) { box.textContent = 'Uit. Stel een e-mailadres en tijden in om meldingen per mail te krijgen.'; return; }
      const every = [c.everyH ? c.everyH + ' u' : '', c.everyM ? c.everyM + ' min' : ''].filter(Boolean).join(' ') || '5 min';
      box.innerHTML = `Aan · naar ${esc(c.to || '—')}<br>${esc(c.from)}–${esc(c.until)}, elke ${esc(every)}` +
        `<br>Laatste mail: ${esc(fmtTime(st.lastSentAt))}` +
        (st.lastError ? `<br><span style="color:#b33">Fout: ${esc(st.lastError)}</span>` : st.lastResult ? `<br>Laatste controle: ${esc(st.lastResult)}` : '');
    }

    function fillEmailForm() {
      const c = emailCfg();
      ['to', 'from', 'until', 'everyH', 'everyM', 'serviceId', 'templateId', 'publicKey', 'webhookUrl', 'provider'].forEach((k) => (ef[k].value = c[k]));
      ['enabled', 'listings', 'messages'].forEach((k) => (ef[k].checked = !!c[k]));
      const list = store.get(K.searches, []);
      ef.querySelector('.sids').innerHTML = list.length
        ? list.map((s) => `<label class="chk"><input type="checkbox" data-sid="${esc(s.id)}" ${!c.searchIds || c.searchIds.includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')
        : '<span class="muted">Nog geen opgeslagen zoekopdrachten.</span>';
      toggleProvider();
      emsg.textContent = '';
      emsg.className = 'msg';
    }

    function readEmailForm() {
      const ids = [...ef.querySelectorAll('[data-sid]')];
      return {
        enabled: ef.enabled.checked,
        to: ef.to.value.trim(),
        from: ef.from.value || '08:00',
        until: ef.until.value || '22:00',
        everyH: Math.max(0, parseInt(ef.everyH.value, 10) || 0),
        everyM: Math.max(0, Math.min(59, parseInt(ef.everyM.value, 10) || 0)),
        listings: ef.listings.checked,
        messages: ef.messages.checked,
        searchIds: ids.length && ids.every((i) => i.checked) ? null : ids.filter((i) => i.checked).map((i) => i.dataset.sid),
        provider: ef.provider.value,
        serviceId: ef.serviceId.value.trim(),
        templateId: ef.templateId.value.trim(),
        publicKey: ef.publicKey.value.trim(),
        webhookUrl: ef.webhookUrl.value.trim(),
      };
    }

    function validateEmail(c) {
      const bad = String(c.to).split(/[,;\s]+/).filter(Boolean).filter((a) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));
      if (!c.to) return 'Vul minstens één e-mailadres in.';
      if (bad.length) return 'Ongeldig e-mailadres: ' + bad.join(', ');
      if (c.everyH * 60 + c.everyM < 5) return 'Kies een interval van minstens 5 minuten.';
      if (!c.listings && !c.messages) return 'Kies nieuwe zoekertjes en/of nieuwe berichten.';
      return '';
    }

    function say(text, kind) {
      emsg.textContent = text;
      emsg.className = 'msg' + (kind ? ' ' + kind : '');
    }

    function toggleProvider() {
      ef.querySelectorAll('fieldset[data-p]').forEach((f) => (f.hidden = f.dataset.p !== ef.provider.value));
    }
    ef.provider.onchange = toggleProvider;

    el.querySelector('[data-a="email"]').onclick = () => { fillEmailForm(); modal.hidden = false; };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    ef.onsubmit = (e) => {
      e.preventDefault();
      const c = readEmailForm();
      const err = c.enabled ? validateEmail(c) : '';
      if (err) return say(err, 'err');
      store.set(K.email, c);
      renderEmailSummary();
      say(c.enabled ? 'Opgeslagen. De eerste controle legt de huidige stand vast; daarna mail je alleen bij nieuwe zoekertjes of berichten.' : 'Opgeslagen (uit).', 'ok');
    };
    ef.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-e]');
      if (!b) return;
      if (b.dataset.e === 'close') { modal.hidden = true; return; }
      const c = readEmailForm();
      const err = validateEmail(c);
      if (err) return say(err, 'err');
      b.disabled = true;
      try {
        if (b.dataset.e === 'test') {
          say('Testmail versturen…');
          await sendTestEmail(c);
          say('Testmail verstuurd naar ' + c.to + '. Kijk ook even in je spammap.', 'ok');
        } else {
          store.set(K.email, c);
          say('Controleren op nieuwe zoekertjes en berichten…');
          const st = await checkEmail(true);
          if (!st) say('Er loopt al een controle; probeer het zo opnieuw.');
          else if (st.lastError) say('Fout: ' + st.lastError, 'err');
          else say(st.lastResult + '.', 'ok');
          renderEmailSummary();
        }
      } catch (er) {
        say('Fout: ' + er.message, 'err');
      } finally {
        b.disabled = false;
      }
    });

    // --- zoeken ---
    async function doSearch() {
      const s = readForm();
      if (!s.sources.mp && !s.sources.tdh) { statusEl.textContent = 'Kies minstens één site.'; return; }
      store.set(K.last, s);
      renderSaved();
      const token = ++app.token;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      const prog = {};
      statusEl.textContent = 'Zoeken…';
      try {
        const r = await runSearch(
          s,
          (src, n, total) => {
            if (token !== app.token) return;
            prog[src] = `${SOURCES[src].name} ${n}/${total.toLocaleString('nl-NL')}`;
            statusEl.textContent = 'Laden… ' + Object.values(prog).join(' · ');
          },
          () => token !== app.token
        );
        if (token !== app.token) return;
        r.radiusKm = s.radiusKm;
        // "Nieuw" = niet gezien bij de vorige keer dat deze opgeslagen zoekopdracht liep.
        app.newKeys = new Set();
        if (app.activeId) {
          const key = 'mpw-seen-' + app.activeId;
          const prev = store.get(key, null);
          if (prev) {
            const prevSet = new Set(prev);
            r.items.forEach((i) => { if (!prevSet.has(i.key)) app.newKeys.add(i.key); });
          }
          store.set(key, [...new Set([...(prev || []), ...r.items.map((i) => i.key)])].slice(-3000));
        }
        app.result = r;
        const perSrc = Object.keys(r.totals).map((k) => `${SOURCES[k].name}: ${r.items.filter((i) => i.src === k).length} van ${r.totals[k].toLocaleString('nl-NL')}`);
        statusEl.textContent = `${r.items.length} advertenties binnen ${s.radiusKm} km van ${r.home.name}` +
          (app.newKeys.size ? ` · ${app.newKeys.size} nieuw sinds vorige keer` : '') +
          ` (${perSrc.join(', ')})` + (r.notes.length ? ' · ' + r.notes.join(' · ') : '');
        drawMap();
        renderTrip();
        if (app.view === 'map') showMap();
        else renderResults();
      } catch (e) {
        if (token === app.token) statusEl.textContent = 'Fout: ' + e.message;
      } finally {
        if (token === app.token) btn.disabled = false;
      }
    }

    form.onsubmit = (e) => {
      e.preventDefault();
      el.classList.remove('side-open');
      doSearch();
    };
    el.querySelector('.top').addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]');
      if (v) return setView(v.dataset.view);
      const a = e.target.closest('[data-a]');
      if (!a) return;
      if (a.dataset.a === 'close') el.style.display = 'none';
      if (a.dataset.a === 'side') el.classList.toggle('side-open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || el.style.display === 'none') return;
      if (!modal.hidden) modal.hidden = true;
      else el.style.display = 'none';
    });

    fillForm(app.search);
    renderSaved();
    renderTrip();
    renderEmailSummary();
    setView(app.view);
    if (app.search.query && app.search.postcode) doSearch();
    else statusEl.textContent = 'Vul een zoekterm en je postcode in en klik op Zoeken. Je postcode wordt onthouden.';
  }

  wRender();
  wRefresh();
  setInterval(wRefresh, CONFIG.refreshSeconds * 1000);
  setTimeout(checkNotifications, 5000);
  setInterval(checkNotifications, 60000);
  setTimeout(checkEmail, 8000);
  setInterval(checkEmail, 60000);
})();
