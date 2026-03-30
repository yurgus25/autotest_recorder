/**
 * AutoTest Recorder - Editor Initialization
 * Must be loaded AFTER editor-core.js and all editor-*.js modules
 */
(function() {
  'use strict';
  
  if (!window._TestEditorClass) {
    console.error('[editor-init] TestEditor class not found!');
    return;
  }
  
  const TestEditor = window._TestEditorClass;
  
  // Инициализируем редактор
  const testEditor = new TestEditor();
  
  // Cleanup  
  delete window._TestEditorClass;
})();
