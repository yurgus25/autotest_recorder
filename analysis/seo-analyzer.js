/**
 * SEO Analysis Module  
 * Анализ SEO-оптимизации страницы
 * v0.9.4.9
 */

(function() {
  'use strict';

  const SEOAnalyzer = {
    
    /**
     * Анализ метаданных
     */
    analyzeMetadata() {
      const title = document.querySelector('title')?.textContent || '';
      const description = document.querySelector('meta[name="description"]')?.content || '';
      const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
      
      const ogTags = {};
      document.querySelectorAll('meta[property^="og:"]').forEach(meta => {
        ogTags[meta.getAttribute('property')] = meta.content;
      });
      
      return {
        title: {
          content: title,
          length: title.length,
          optimal: title.length >= 50 && title.length <= 60,
          issues: [
            title.length === 0 ? 'Отсутствует title' : null,
            title.length < 30 ? 'Title слишком короткий (<30)' : null,
            title.length > 60 ? 'Title слишком длинный (>60)' : null
          ].filter(Boolean)
        },
        description: {
          content: description,
          length: description.length,
          optimal: description.length >= 150 && description.length <= 160,
          issues: [
            description.length === 0 ? 'Отсутствует description' : null,
            description.length < 120 ? 'Description слишком короткий (<120)' : null,
            description.length > 160 ? 'Description слишком длинный (>160)' : null
          ].filter(Boolean)
        },
        canonical: {
          url: canonical,
          present: !!canonical,
          issues: canonical ? [] : ['Отсутствует canonical URL']
        },
        openGraph: {
          tags: ogTags,
          present: Object.keys(ogTags).length > 0,
          missing: ['og:title', 'og:description', 'og:image', 'og:type', 'og:url']
            .filter(tag => !ogTags[tag])
        }
      };
    },

    /**
     * Анализ структуры заголовков
     */
    analyzeHeadings() {
      const headings = {
        h1: document.querySelectorAll('h1'),
        h2: document.querySelectorAll('h2'),
        h3: document.querySelectorAll('h3'),
        h4: document.querySelectorAll('h4'),
        h5: document.querySelectorAll('h5'),
        h6: document.querySelectorAll('h6')
      };
      
      const counts = {};
      Object.keys(headings).forEach(tag => {
        counts[tag] = headings[tag].length;
      });
      
      const issues = [
        counts.h1 === 0 ? 'Отсутствует H1' : null,
        counts.h1 > 1 ? `Несколько H1 (${counts.h1})` : null,
        counts.h2 === 0 && counts.h3 > 0 ? 'H3 без H2' : null
      ].filter(Boolean);
      
      return {
        counts,
        structure: issues.length === 0 ? 'good' : 'poor',
        issues
      };
    },

    /**
     * Анализ изображений
     */
    analyzeImages() {
      const images = Array.from(document.querySelectorAll('img'));
      const total = images.length;
      const missingAlt = images.filter(img => !img.alt).length;
      const emptyAlt = images.filter(img => img.alt === '').length;
      
      return {
        total,
        missingAlt,
        emptyAlt,
        withAlt: total - missingAlt,
        issues: [
          missingAlt > 0 ? `${missingAlt} изображений без alt` : null,
          emptyAlt > 0 ? `${emptyAlt} изображений с пустым alt` : null
        ].filter(Boolean),
        recommendations: missingAlt > 0 ? ['Добавить alt ко всем изображениям'] : []
      };
    },

    /**
     * Анализ ссылок
     */
    analyzeLinks() {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const internal = links.filter(a => a.hostname === window.location.hostname);
      const external = links.filter(a => a.hostname !== window.location.hostname);
      const nofollow = links.filter(a => a.rel && a.rel.includes('nofollow'));
      
      return {
        total: links.length,
        internal: internal.length,
        external: external.length,
        nofollow: nofollow.length,
        broken: 0 // Требует проверки HTTP-статусов
      };
    },

    /**
     * Расчёт SEO score
     */
    calculateScore(analysis) {
      let score = 100;
      
      // Title
      if (!analysis.metadata.title.optimal) score -= 10;
      if (analysis.metadata.title.issues.length > 0) score -= 5;
      
      // Description
      if (!analysis.metadata.description.optimal) score -= 10;
      
      // Canonical
      if (!analysis.metadata.canonical.present) score -= 5;
      
      // OG tags
      if (analysis.metadata.openGraph.missing.length > 2) score -= 10;
      
      // Headings
      if (analysis.headings.issues.length > 0) score -= 10;
      
      // Images
      if (analysis.images.missingAlt > 0) score -= 15;
      
      return Math.max(0, score);
    },

    /**
     * Полный SEO анализ
     */
    fullSEOAnalysis() {
      const metadata = this.analyzeMetadata();
      const headings = this.analyzeHeadings();
      const images = this.analyzeImages();
      const links = this.analyzeLinks();
      
      const analysis = {
        metadata,
        headings,
        images,
        links,
        timestamp: Date.now()
      };
      
      analysis.score = this.calculateScore(analysis);
      analysis.rating = analysis.score >= 80 ? 'excellent' : 
                       analysis.score >= 60 ? 'good' :
                       analysis.score >= 40 ? 'fair' : 'poor';
      
      return analysis;
    }
  };

  window.SEOAnalyzer = SEOAnalyzer;

})();
