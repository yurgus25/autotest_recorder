/**
 * i18n Page Router
 * Automatically redirects to the correct language version of a page.
 * 
 * Convention: page.html (English default), page_ru.html (Russian)
 */
(function() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('noredirect')) return;
  
  const currentFile = url.pathname.split('/').pop();
  const isRuPage = currentFile.includes('_ru.');

  async function getLang() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get('i18nLang');
        return result.i18nLang || null;
      }
    } catch(e) {}
    try { return localStorage.getItem('i18nLang'); } catch(e) {}
    return null;
  }

  function detectBrowserLang() {
    const langs = navigator.languages || [navigator.language || 'en'];
    for (const lang of langs) {
      if (lang.toLowerCase().startsWith('ru')) return 'ru';
    }
    return 'en';
  }

  async function route() {
    const saved = await getLang();
    const lang = saved || detectBrowserLang();
    
    if (lang === 'ru' && !isRuPage) {
      // On English page but need Russian → redirect to _ru
      const ruFile = currentFile.replace('.html', '_ru.html');
      try {
        const newPath = url.pathname.replace(currentFile, ruFile);
        const checkUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
          ? chrome.runtime.getURL(newPath.replace(/^\//, ''))
          : newPath;
        window.location.replace(checkUrl + url.search + url.hash);
      } catch(e) {}
    } else if (lang !== 'ru' && isRuPage) {
      // On Russian page but need English → redirect to base
      const enFile = currentFile.replace('_ru.html', '.html');
      try {
        const newPath = url.pathname.replace(currentFile, enFile);
        const checkUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
          ? chrome.runtime.getURL(newPath.replace(/^\//, ''))
          : newPath;
        window.location.replace(checkUrl + url.search + url.hash);
      } catch(e) {}
    }
  }

  route();
})();
