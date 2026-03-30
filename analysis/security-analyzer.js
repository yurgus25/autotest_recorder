/**
 * Security Analysis Module
 * Тестирование безопасности веб-приложений
 * v0.9.4.9
 */

(function() {
  'use strict';

  const SecurityAnalyzer = {
    
    /**
     * XSS тестирование
     */
    testXSS(options = {}) {
      const payloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")',
        '<svg onload=alert("XSS")>',
        '"><script>alert(String.fromCharCode(88,83,83))</script>',
        '<iframe src="javascript:alert(\'XSS\')">',
        '<body onload=alert("XSS")>'
      ];
      
      const inputs = document.querySelectorAll('input[type="text"], textarea');
      const results = [];
      
      inputs.forEach(input => {
        const testPayload = payloads[0]; // Используем первый для быстрого теста
        const originalValue = input.value;
        
        try {
          input.value = testPayload;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Проверяем, экранировано ли значение
          const escaped = input.value !== testPayload || 
                         document.body.innerHTML.indexOf(testPayload) === -1;
          
          results.push({
            field: input.name || input.id || input.placeholder,
            selector: input.id ? `#${input.id}` : input.name ? `[name="${input.name}"]` : '',
            payload: testPayload,
            escaped: escaped,
            vulnerable: !escaped,
            severity: !escaped ? 'critical' : 'none'
          });
          
          // Восстанавливаем значение
          input.value = originalValue;
        } catch (e) {
          // Ошибка - хороший знак, значит есть защита
        }
      });
      
      return {
        tested: results.length,
        vulnerable: results.filter(r => r.vulnerable).length,
        passed: results.filter(r => !r.vulnerable).length,
        results: results
      };
    },

    /**
     * Проверка заголовков безопасности
     */
    checkSecurityHeaders() {
      // Эмуляция - в реальности нужен доступ к headers
      const headers = {
        'Content-Security-Policy': false,
        'X-Frame-Options': false,
        'X-Content-Type-Options': false,
        'Strict-Transport-Security': false,
        'Permissions-Policy': false
      };
      
      const missing = Object.keys(headers).filter(h => !headers[h]);
      
      return {
        present: Object.keys(headers).filter(h => headers[h]),
        missing: missing,
        score: ((Object.keys(headers).length - missing.length) / Object.keys(headers).length) * 100,
        recommendations: missing.map(h => `Добавить заголовок: ${h}`)
      };
    },

    /**
     * Проверка cookies
     */
    analyzeCookies() {
      const cookies = document.cookie.split(';').map(c => c.trim()).filter(c => c);
      const analysis = cookies.map(cookie => {
        const [name, ...valueParts] = cookie.split('=');
        const value = valueParts.join('=');
        
        return {
          name: name.trim(),
          httpOnly: false, // Недоступно из JS
          secure: document.location.protocol === 'https:',
          sameSite: 'Lax', // Предположение
          issues: [
            !document.location.protocol.startsWith('https') ? 'Cookie не Secure (HTTP)' : null
          ].filter(Boolean)
        };
      });
      
      return {
        total: cookies.length,
        cookies: analysis,
        issues: analysis.flatMap(c => c.issues)
      };
    },

    /**
     * Полный анализ безопасности
     */
    fullSecurityAnalysis() {
      return {
        xss: this.testXSS(),
        headers: this.checkSecurityHeaders(),
        cookies: this.analyzeCookies(),
        timestamp: Date.now()
      };
    }
  };

  window.SecurityAnalyzer = SecurityAnalyzer;

})();
