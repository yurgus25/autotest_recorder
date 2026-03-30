/**
 * AutoTest Recorder - Player Initialization
 * Must be loaded AFTER player-core.js and all player-handlers-*.js modules
 */
(function() {
  'use strict';
  
  if (!window._TestPlayerClass) {
    console.error('[player-init] TestPlayer class not found!');
    return;
  }
  
  const TestPlayer = window._TestPlayerClass;
  
  // Инициализируем плеер
  const testPlayer = new TestPlayer();
  window.testPlayer = testPlayer;
  
  // Cleanup
  delete window._TestPlayerClass;
})();
