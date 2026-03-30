/**
 * Timeline Chart Component
 * Визуализация выполнения шагов с разделением Plugin Overhead / Page Delay
 */

(function() {
  'use strict';

  const isRu = () => document.documentElement.lang === 'ru';
  const t = (en, ru) => (isRu() ? ru : en);

  window.TimelineChart = class TimelineChart {
    constructor(canvasId, options = {}) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) {
        throw new Error(`Canvas with id "${canvasId}" not found`);
      }
      
      this.ctx = this.canvas.getContext('2d');
      this.options = {
        padding: options.padding || { top: 40, right: 20, bottom: 60, left: 60 },
        colors: {
          pluginOverhead: options.pluginColor || 'rgba(99, 102, 241, 0.8)',      // Indigo
          pageDelay: options.pageColor || 'rgba(203, 213, 225, 0.7)',           // Gray
          networkWait: options.networkColor || 'rgba(251, 146, 60, 0.7)',       // Orange
          renderWait: options.renderColor || 'rgba(34, 197, 94, 0.7)',          // Green
          gridLines: options.gridColor || 'rgba(0, 0, 0, 0.1)',
          text: options.textColor || '#334155',
          textSecondary: options.textSecondaryColor || '#64748b'
        },
        showGrid: options.showGrid !== false,
        showLabels: options.showLabels !== false,
        showTooltip: options.showTooltip !== false,
        maxBars: options.maxBars || 50
      };
      
      this.data = null;
      this.hoveredBar = null;
      this.tooltip = null;
      
      if (this.options.showTooltip) {
        this.createTooltip();
        this.setupEventListeners();
      }
    }

    /**
     * Создать tooltip element
     */
    createTooltip() {
      this.tooltip = document.createElement('div');
      this.tooltip.id = 'timeline-tooltip';
      this.tooltip.style.cssText = `
        position: fixed;
        display: none;
        background: rgba(15, 23, 42, 0.95);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        pointer-events: none;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        max-width: 300px;
        line-height: 1.6;
      `;
      document.body.appendChild(this.tooltip);
    }

    /**
     * Setup event listeners для hover
     */
    setupEventListeners() {
      this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
      this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    /**
     * Handle mouse move
     */
    handleMouseMove(e) {
      if (!this.data || !this.data.steps) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const barIndex = this.getBarAtPosition(x, y);
      
      if (barIndex !== null && barIndex !== this.hoveredBar) {
        this.hoveredBar = barIndex;
        this.showTooltip(e.clientX, e.clientY, this.data.steps[barIndex], barIndex);
      } else if (barIndex === null && this.hoveredBar !== null) {
        this.hoveredBar = null;
        this.hideTooltip();
      }
    }

    /**
     * Handle mouse leave
     */
    handleMouseLeave() {
      this.hoveredBar = null;
      this.hideTooltip();
    }

    /**
     * Get bar at position (учитывает режим сравнения — maxSteps)
     */
    getBarAtPosition(x, y) {
      if (!this.chartArea || !this.data?.steps) return null;
      
      const { left, top, width, height } = this.chartArea;
      
      if (x < left || x > left + width || y < top || y > top + height) {
        return null;
      }
      
      const currentSteps = this.data.steps;
      const baselineSteps = this.comparisonData?.steps || [];
      const maxSteps = Math.max(currentSteps.length, baselineSteps.length);
      const barWidth = width / maxSteps;
      const index = Math.floor((x - left) / barWidth);
      
      return index >= 0 && index < currentSteps.length ? index : null;
    }

    /**
     * Show tooltip
     * @param {number} columnIndex - индекс колонки (для корректного отображения номера шага)
     */
    showTooltip(x, y, step, columnIndex = 0) {
      if (!this.tooltip) return;
      
      const timing = step.timing || {};
      const total = timing.sinceLastStep || 0;
      const plugin = timing.pluginOverhead || 0;
      const page = timing.pageDelay || 0;
      const stepNum = columnIndex + 1;
      const stepTypeLabel = this.translateStepType(step.stepType);
      
      this.tooltip.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">
          ${t('Step', 'Шаг')} ${stepNum}: ${stepTypeLabel}
        </div>
        <div style="display: grid; gap: 4px;">
          <div style="display: flex; justify-content: space-between; gap: 16px;">
            <span style="color: #94a3b8;">${t('Total', 'Всего')}:</span>
            <span style="font-weight: 600;">${total.toFixed(2)}ms</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 16px;">
            <span style="color: #94a3b8;">${t('Plugin', 'Плагин')}:</span>
            <span style="color: ${this.options.colors.pluginOverhead};">${plugin.toFixed(2)}ms</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 16px;">
            <span style="color: #94a3b8;">${t('Page', 'Страница')}:</span>
            <span style="color: ${this.options.colors.pageDelay};">${page.toFixed(2)}ms</span>
          </div>
          ${timing.delays && timing.delays.networkWait > 0 ? `
          <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.1);">
            <span style="color: #94a3b8;">${t('Network', 'Сеть')}:</span>
            <span style="color: ${this.options.colors.networkWait};">${timing.delays.networkWait.toFixed(2)}ms</span>
          </div>
          ` : ''}
        </div>
      `;
      
      // Position tooltip
      this.tooltip.style.left = (x + 10) + 'px';
      this.tooltip.style.top = (y - 10) + 'px';
      this.tooltip.style.display = 'block';
    }

    translateStepType(type) {
      if (!type) return '';
      const map = {
        click: t('click', 'клик'),
        navigation: t('navigation', 'навигация'),
        navigate: t('navigate', 'навигация'),
        analysis: t('analysis', 'анализ'),
        input: t('input', 'ввод'),
        wait: t('wait', 'ожидание'),
        scroll: t('scroll', 'прокрутка')
      };
      return map[type.toLowerCase()] || type;
    }

    /**
     * Hide tooltip
     */
    hideTooltip() {
      if (this.tooltip) {
        this.tooltip.style.display = 'none';
      }
    }

    /**
     * Render chart
     */
    render(data) {
      this.data = data;
      this.comparisonData = null; // Clear comparison
      
      if (!data || !data.steps || data.steps.length === 0) {
        this.renderEmptyState();
        return;
      }
      
      this.clearCanvas();
      this.calculateChartArea();
      this.drawGrid();
      this.drawBars();
      this.drawLabels();
      this.drawLegend();
    }

    /**
     * Render comparison with baseline
     */
    renderComparison(current, baseline) {
      this.data = current;
      this.comparisonData = baseline;
      
      if (!current || !current.steps || current.steps.length === 0) {
        this.renderEmptyState();
        return;
      }
      
      this.clearCanvas();
      this.calculateChartArea();
      this.drawGrid();
      this.drawComparisonBars();
      this.drawLabels();
      this.drawComparisonLegend();
    }

    /**
     * Clear canvas
     */
    clearCanvas() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Calculate chart area
     */
    calculateChartArea() {
      const p = this.options.padding;
      this.chartArea = {
        left: p.left,
        top: p.top,
        width: this.canvas.width - p.left - p.right,
        height: this.canvas.height - p.top - p.bottom
      };
    }

    /**
     * Draw grid
     */
    drawGrid() {
      if (!this.options.showGrid) return;
      
      const { left, top, width, height } = this.chartArea;
      const maxTime = this.getMaxTime();
      const gridLines = 5;
      
      this.ctx.strokeStyle = this.options.colors.gridLines;
      this.ctx.lineWidth = 1;
      this.ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      this.ctx.fillStyle = this.options.colors.textSecondary;
      this.ctx.textAlign = 'right';
      
      for (let i = 0; i <= gridLines; i++) {
        const y = top + (height / gridLines) * i;
        const value = maxTime - (maxTime / gridLines) * i;
        
        // Grid line
        this.ctx.beginPath();
        this.ctx.moveTo(left, y);
        this.ctx.lineTo(left + width, y);
        this.ctx.stroke();
        
        // Y-axis label
        this.ctx.fillText(`${value.toFixed(0)}ms`, left - 10, y + 4);
      }
    }

    /**
     * Draw bars
     */
    drawBars() {
      const { left, top, width, height } = this.chartArea;
      const steps = this.data.steps;
      const barWidth = width / steps.length;
      const maxTime = this.getMaxTime();
      const scale = height / maxTime;
      
      steps.forEach((step, index) => {
        const x = left + index * barWidth;
        const timing = step.timing || {};
        const total = timing.sinceLastStep || 0;
        const plugin = timing.pluginOverhead || 0;
        const page = timing.pageDelay || 0;
        
        const barPadding = Math.min(barWidth * 0.2, 4);
        const actualBarWidth = barWidth - barPadding * 2;
        
        // Draw page delay (bottom)
        if (page > 0) {
          const pageHeight = page * scale;
          this.ctx.fillStyle = this.options.colors.pageDelay;
          this.ctx.fillRect(
            x + barPadding,
            top + height - pageHeight,
            actualBarWidth,
            pageHeight
          );
        }
        
        // Draw plugin overhead (top)
        if (plugin > 0) {
          const pluginHeight = plugin * scale;
          const pluginY = top + height - total * scale;
          this.ctx.fillStyle = this.options.colors.pluginOverhead;
          this.ctx.fillRect(
            x + barPadding,
            pluginY,
            actualBarWidth,
            pluginHeight
          );
        }
        
        // Highlight hovered bar
        if (this.hoveredBar === index) {
          this.ctx.strokeStyle = 'rgba(99, 102, 241, 1)';
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(
            x + barPadding,
            top + height - total * scale,
            actualBarWidth,
            total * scale
          );
        }
      });
    }

    /**
     * Draw labels
     */
    drawLabels() {
      if (!this.options.showLabels) return;
      
      const { left, top, width, height } = this.chartArea;
      const steps = this.data.steps;
      const baselineSteps = this.comparisonData?.steps || [];
      const maxSteps = Math.max(steps.length, baselineSteps.length);
      const barWidth = width / maxSteps;
      
      this.ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      this.ctx.fillStyle = this.options.colors.text;
      this.ctx.textAlign = 'center';
      
      steps.forEach((step, index) => {
        const x = left + index * barWidth + barWidth / 2;
        const y = top + height + 20;
        
        // Step number (1-based to match test editor)
        this.ctx.fillText(`${(step.stepIndex ?? index) + 1}`, x, y);
      });
      
      // Step types - показываем умно, чтобы не накладывались
      // Вычисляем минимальное расстояние между подписями
      const minLabelSpacing = 60; // pixels
      const labelInterval = Math.max(1, Math.ceil(minLabelSpacing / barWidth));
      
      // Показываем только каждый N-й label
      steps.forEach((step, index) => {
        if (index % labelInterval === 0 || index === steps.length - 1) {
          const x = left + index * barWidth + barWidth / 2;
          const y = top + height + 20;
          
          this.ctx.save();
          this.ctx.translate(x, y + 12);
          this.ctx.rotate(-Math.PI / 4); // 45 градусов
          this.ctx.fillStyle = this.options.colors.textSecondary;
          this.ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          this.ctx.textAlign = 'right';
          
          // Ограничиваем длину текста
          const stepTypeText = this.translateStepType(step.stepType);
          const maxLength = 10;
          const displayText = stepTypeText.length > maxLength 
            ? stepTypeText.substring(0, maxLength) + '…'
            : stepTypeText;
          
          this.ctx.fillText(displayText, 0, 0);
          this.ctx.restore();
        }
      });
      
      // Y-axis label
      this.ctx.save();
      this.ctx.translate(15, this.chartArea.top + this.chartArea.height / 2);
      this.ctx.rotate(-Math.PI / 2);
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = this.options.colors.text;
      this.ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      this.ctx.fillText(t('Time (ms)', 'Время (мс)'), 0, 0);
      this.ctx.restore();
      
      // X-axis label
      this.ctx.textAlign = 'center';
      this.ctx.fillText(t('Steps', 'Шаги'), left + width / 2, this.canvas.height - 10);
    }

    /**
     * Draw legend
     */
    drawLegend() {
      const legendItems = [
        { label: t('Plugin Overhead', 'Накладные расходы плагина'), color: this.options.colors.pluginOverhead },
        { label: t('Page Delay', 'Задержка страницы'), color: this.options.colors.pageDelay }
      ];
      
      const legendX = this.chartArea.left;
      const legendY = 15;
      const itemWidth = 120;
      
      this.ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      this.ctx.textAlign = 'left';
      
      legendItems.forEach((item, index) => {
        const x = legendX + index * itemWidth;
        
        // Color box
        this.ctx.fillStyle = item.color;
        this.ctx.fillRect(x, legendY - 8, 12, 12);
        
        // Label
        this.ctx.fillStyle = this.options.colors.text;
        this.ctx.fillText(item.label, x + 18, legendY + 2);
      });
    }

    /**
     * Get max time
     */
    getMaxTime() {
      const times = this.data.steps.map(s => (s.timing?.sinceLastStep || 0));
      return Math.max(...times, 100); // Minimum 100ms for scale
    }

    /**
     * Render empty state
     */
    renderEmptyState() {
      this.clearCanvas();
      
      this.ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      this.ctx.fillStyle = this.options.colors.textSecondary;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        t('No performance data available', 'Нет данных производительности'),
        this.canvas.width / 2,
        this.canvas.height / 2
      );
    }

    /**
     * Draw comparison bars (current vs baseline)
     */
    drawComparisonBars() {
      const { left, top, width, height } = this.chartArea;
      const currentSteps = this.data.steps;
      const baselineSteps = this.comparisonData?.steps || [];
      
      const maxSteps = Math.max(currentSteps.length, baselineSteps.length);
      const barWidth = width / maxSteps;
      
      // Calculate max time from both datasets
      const currentMax = Math.max(...currentSteps.map(s => s.timing?.sinceLastStep || 0));
      const baselineMax = baselineSteps.length > 0 
        ? Math.max(...baselineSteps.map(s => s.timing?.sinceLastStep || 0))
        : 0;
      const maxTime = Math.max(currentMax, baselineMax, 100);
      const scale = height / maxTime;
      
      // Draw baseline bars first (outlined/faded)
      baselineSteps.forEach((step, index) => {
        const x = left + index * barWidth;
        const timing = step.timing || {};
        const total = timing.sinceLastStep || 0;
        
        const barPadding = Math.min(barWidth * 0.2, 4);
        const actualBarWidth = barWidth - barPadding * 2;
        const totalHeight = total * scale;
        
        // Draw as outlined bar (baseline)
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([4, 2]);
        this.ctx.strokeRect(
          x + barPadding,
          top + height - totalHeight,
          actualBarWidth,
          totalHeight
        );
        this.ctx.setLineDash([]);
      });
      
      // Draw current bars (solid, color-coded by performance)
      currentSteps.forEach((step, index) => {
        const x = left + index * barWidth;
        const timing = step.timing || {};
        const total = timing.sinceLastStep || 0;
        const plugin = timing.pluginOverhead || 0;
        const page = timing.pageDelay || 0;
        
        const barPadding = Math.min(barWidth * 0.2, 4);
        const actualBarWidth = barWidth - barPadding * 2;
        
        // Check if regression compared to baseline
        const baselineStep = baselineSteps[index];
        const baselineTime = baselineStep?.timing?.sinceLastStep || 0;
        const isRegression = baselineTime > 0 && total > baselineTime * 1.1; // >10% slower
        const isImprovement = baselineTime > 0 && total < baselineTime * 0.9; // >10% faster
        
        // Color coding
        const pageColor = isRegression 
          ? 'rgba(239, 68, 68, 0.4)'      // Red for regression
          : isImprovement 
            ? 'rgba(34, 197, 94, 0.4)'    // Green for improvement
            : this.options.colors.pageDelay;
        
        const pluginColor = isRegression
          ? 'rgba(239, 68, 68, 0.7)'
          : isImprovement
            ? 'rgba(34, 197, 94, 0.7)'
            : this.options.colors.pluginOverhead;
        
        // Draw page delay (bottom)
        if (page > 0) {
          const pageHeight = page * scale;
          this.ctx.fillStyle = pageColor;
          this.ctx.fillRect(
            x + barPadding,
            top + height - pageHeight,
            actualBarWidth,
            pageHeight
          );
        }
        
        // Draw plugin overhead (top)
        if (plugin > 0) {
          const pluginHeight = plugin * scale;
          const pluginY = top + height - total * scale;
          this.ctx.fillStyle = pluginColor;
          this.ctx.fillRect(
            x + barPadding,
            pluginY,
            actualBarWidth,
            pluginHeight
          );
        }
      });
    }

    /**
     * Draw comparison legend
     */
    drawComparisonLegend() {
      const legendItems = [
        { label: t('Current', 'Текущий'), type: 'solid' },
        { label: t('Baseline', 'Базовая линия'), type: 'dashed' },
        { label: t('Faster', 'Быстрее'), color: 'rgba(34, 197, 94, 0.7)' },
        { label: t('Slower', 'Медленнее'), color: 'rgba(239, 68, 68, 0.7)' }
      ];
      
      const legendX = this.chartArea.left;
      const legendY = 15;
      const itemWidth = 95;
      
      this.ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      this.ctx.textAlign = 'left';
      
      legendItems.forEach((item, index) => {
        const x = legendX + index * itemWidth;
        
        if (item.type === 'solid') {
          // Solid bar
          this.ctx.fillStyle = this.options.colors.pluginOverhead;
          this.ctx.fillRect(x, legendY - 8, 12, 12);
        } else if (item.type === 'dashed') {
          // Dashed outline
          this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
          this.ctx.lineWidth = 2;
          this.ctx.setLineDash([3, 2]);
          this.ctx.strokeRect(x, legendY - 8, 12, 12);
          this.ctx.setLineDash([]);
        } else if (item.color) {
          // Color box
          this.ctx.fillStyle = item.color;
          this.ctx.fillRect(x, legendY - 8, 12, 12);
        }
        
        // Label
        this.ctx.fillStyle = this.options.colors.text;
        this.ctx.fillText(item.label, x + 18, legendY + 2);
      });
    }

    /**
     * Export chart to PNG
     * @param {string} filename - Name of file to download
     */
    exportToPNG(filename = 'timeline-chart.png') {
      try {
        const dataURL = this.canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      } catch (error) {
        console.error('Failed to export PNG:', error);
        return false;
      }
    }

    /**
     * Copy chart to clipboard as image
     */
    async copyToClipboard() {
      try {
        const blob = await new Promise(resolve => this.canvas.toBlob(resolve));
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        return true;
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
      }
    }

    /**
     * Get data URL for embedding
     */
    getDataURL(type = 'image/png') {
      return this.canvas.toDataURL(type);
    }

    /**
     * Destroy chart
     */
    destroy() {
      if (this.tooltip) {
        this.tooltip.remove();
      }
      this.data = null;
    }
  };

})();
