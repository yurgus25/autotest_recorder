/**
 * Undo/Redo Manager for Test Editor
 * v0.9.6.0
 */

(function() {
  'use strict';

  class UndoRedoManager {
    constructor(options = {}) {
      this.maxHistory = options.maxHistory || 50;
      this.history = [];
      this.currentIndex = -1;
      this.onChange = options.onChange || (() => {});
    }

    /**
     * Save current state
     */
    saveState(state, description = '') {
      // Remove any states after current index
      this.history = this.history.slice(0, this.currentIndex + 1);
      
      // Add new state
      this.history.push({
        state: JSON.parse(JSON.stringify(state)), // Deep clone
        description: description,
        timestamp: Date.now()
      });
      
      // Limit history size
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      } else {
        this.currentIndex++;
      }
      
      this.onChange(this.getStatus());
    }

    /**
     * Undo to previous state
     */
    undo() {
      if (!this.canUndo()) {
        return null;
      }
      
      this.currentIndex--;
      const state = this.history[this.currentIndex].state;
      this.onChange(this.getStatus());
      
      return JSON.parse(JSON.stringify(state));
    }

    /**
     * Redo to next state
     */
    redo() {
      if (!this.canRedo()) {
        return null;
      }
      
      this.currentIndex++;
      const state = this.history[this.currentIndex].state;
      this.onChange(this.getStatus());
      
      return JSON.parse(JSON.stringify(state));
    }

    /**
     * Check if can undo
     */
    canUndo() {
      return this.currentIndex > 0;
    }

    /**
     * Check if can redo
     */
    canRedo() {
      return this.currentIndex < this.history.length - 1;
    }

    /**
     * Get current status
     */
    getStatus() {
      return {
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        currentIndex: this.currentIndex,
        historyLength: this.history.length,
        currentDescription: this.history[this.currentIndex]?.description || ''
      };
    }

    /**
     * Get history list
     */
    getHistory() {
      return this.history.map((item, index) => ({
        index: index,
        description: item.description,
        timestamp: item.timestamp,
        isCurrent: index === this.currentIndex
      }));
    }

    /**
     * Clear history
     */
    clear() {
      this.history = [];
      this.currentIndex = -1;
      this.onChange(this.getStatus());
    }

    /**
     * Jump to specific state
     */
    jumpTo(index) {
      if (index < 0 || index >= this.history.length) {
        return null;
      }
      
      this.currentIndex = index;
      const state = this.history[this.currentIndex].state;
      this.onChange(this.getStatus());
      
      return JSON.parse(JSON.stringify(state));
    }
  }

  // Export
  window.UndoRedoManager = UndoRedoManager;

})();
