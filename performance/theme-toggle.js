/**
 * Theme Toggle Utility
 * Quick Win - Dark Theme Support
 */

(function() {
  'use strict';

  const THEME_KEY = 'autotest_theme';
  
  /**
   * Get current theme
   */
  function getCurrentTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }
  
  /**
   * Set theme
   */
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    
    // Update toggle button
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      toggleBtn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    }
  }
  
  /**
   * Toggle theme
   */
  function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }
  
  /**
   * Initialize theme
   */
  function initTheme() {
    // Apply saved theme
    const savedTheme = getCurrentTheme();
    setTheme(savedTheme);
    
    // Create toggle button
    createToggleButton();
  }
  
  /**
   * Create toggle button
   */
  function createToggleButton() {
    const existingBtn = document.getElementById('themeToggle');
    if (existingBtn) return;
    
    const btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.className = 'theme-toggle';
    btn.textContent = getCurrentTheme() === 'dark' ? '☀️ Light' : '🌙 Dark';
    btn.onclick = toggleTheme;
    
    document.body.appendChild(btn);
  }
  
  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }
  
  // Export
  window.ThemeToggle = {
    getCurrentTheme,
    setTheme,
    toggleTheme
  };

})();
