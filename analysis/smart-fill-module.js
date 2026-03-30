/**
 * Smart Fill Module с Fuzzy Matching
 * Улучшенное определение контекста полей
 */

(function() {
  'use strict';

  /**
   * Levenshtein distance для fuzzy matching
   */
  function levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1.charAt(i - 1) === str2.charAt(i - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Similarity score (0-1)
   */
  function similarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
    return (longer.length - distance) / longer.length;
  }

  /**
   * Context patterns with fuzzy keywords
   */
  const CONTEXT_PATTERNS = {
    firstName: {
      exact: [/first.*name/i, /fname/i, /given.*name/i],
      keywords: ['имя', 'name', 'first', 'prénom', 'nombre'],
      priority: 1
    },
    lastName: {
      exact: [/last.*name/i, /lname/i, /surname/i, /family.*name/i],
      keywords: ['фамилия', 'фамилия', 'surname', 'lastname', 'apellido'],
      priority: 1
    },
    email: {
      exact: [/e-?mail/i, /электронн/i],
      keywords: ['email', 'mail', 'почта', 'correo'],
      priority: 1
    },
    phone: {
      exact: [/phone/i, /телефон/i, /mobile/i, /tel/i],
      keywords: ['телефон', 'phone', 'tel', 'móvil', 'telephone'],
      priority: 1
    },
    birthDate: {
      exact: [/birth.*date/i, /дата.*рожд/i],
      keywords: ['рождения', 'birth', 'birthday', 'nacimiento'],
      priority: 2
    },
    city: {
      exact: [/city/i, /город/i],
      keywords: ['город', 'city', 'ciudad'],
      priority: 2
    },
    address: {
      exact: [/address/i, /адрес/i, /street/i],
      keywords: ['адрес', 'address', 'улица', 'street'],
      priority: 2
    },
    zipCode: {
      exact: [/zip/i, /postal/i, /индекс/i],
      keywords: ['индекс', 'zip', 'postal', 'código'],
      priority: 2
    },
    username: {
      exact: [/username/i, /login/i, /user.*name/i],
      keywords: ['username', 'login', 'логин', 'usuario'],
      priority: 1
    },
    password: {
      exact: [/password/i, /пароль/i],
      keywords: ['password', 'пароль', 'contraseña'],
      priority: 1
    }
  };

  /**
   * Improved context detection with fuzzy matching
   */
  window.SmartFillModule = window.SmartFillModule || {};
  
  window.SmartFillModule.detectFieldContextFuzzy = function(input) {
    const hints = [
      input.labels?.[0]?.textContent || '',
      input.name || '',
      input.id || '',
      input.placeholder || '',
      input.getAttribute('aria-label') || '',
      input.title || ''
    ].join(' ').toLowerCase();

    if (!hints.trim()) return null;

    const scores = {};

    // Try exact patterns first
    for (const [contextType, config] of Object.entries(CONTEXT_PATTERNS)) {
      for (const pattern of config.exact) {
        if (pattern.test(hints)) {
          scores[contextType] = { score: 1.0, method: 'exact' };
          break;
        }
      }
    }

    // If no exact match, try fuzzy matching
    if (Object.keys(scores).length === 0) {
      for (const [contextType, config] of Object.entries(CONTEXT_PATTERNS)) {
        let maxSimilarity = 0;
        
        for (const keyword of config.keywords) {
          const sim = similarity(hints, keyword);
          maxSimilarity = Math.max(maxSimilarity, sim);
          
          // Also check if keyword is substring
          if (hints.includes(keyword.toLowerCase())) {
            maxSimilarity = Math.max(maxSimilarity, 0.85);
          }
        }
        
        if (maxSimilarity > 0.6) { // Threshold for fuzzy match
          scores[contextType] = { 
            score: maxSimilarity, 
            method: 'fuzzy',
            priority: config.priority
          };
        }
      }
    }

    // Return best match
    if (Object.keys(scores).length === 0) return null;

    const best = Object.entries(scores)
      .sort((a, b) => {
        // Sort by priority first, then by score
        if (a[1].priority !== b[1].priority) {
          return a[1].priority - b[1].priority;
        }
        return b[1].score - a[1].score;
      })[0];

    if (!best || best[1].score < 0.6) return null;

    return {
      type: best[0],
      confidence: best[1].score,
      method: best[1].method
    };
  };

  /**
   * Original exact-match detection (backward compatible)
   */
  window.SmartFillModule.detectFieldContext = function(input) {
    // Try fuzzy first
    const fuzzyResult = window.SmartFillModule.detectFieldContextFuzzy(input);
    
    // If high confidence, use it
    if (fuzzyResult && fuzzyResult.confidence > 0.8) {
      return fuzzyResult.type;
    }
    
    // Otherwise fallback to original exact matching
    const hints = [
      input.labels?.[0]?.textContent || '',
      input.name || '',
      input.id || '',
      input.placeholder || ''
    ].join(' ').toLowerCase();

    for (const [contextType, config] of Object.entries(CONTEXT_PATTERNS)) {
      for (const pattern of config.exact) {
        if (pattern.test(hints)) {
          return contextType;
        }
      }
    }

    return null;
  };

})();
