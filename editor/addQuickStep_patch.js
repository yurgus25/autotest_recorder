// Патч для функции addQuickStep - добавление передачи subtype в addGenericStep

// ВАЖНО: Все вызовы addGenericStep нужно обновить, добавив третий параметр - subtype

// Пример замены:
// БЫЛО: this.addGenericStep('wait', 'Wait for specific value');
// СТАЛО: this.addGenericStep('wait', 'Wait for specific value', 'wait-value');

// Полный список замен для wait операций:
/*
case 'wait-option':
  this.addGenericStep('wait', 'Wait for dropdown option to appear', 'wait-option');
  break;
case 'wait-options-count':
  this.addGenericStep('wait', 'Wait for specific options count', 'wait-options-count');
  break;
case 'wait-enabled':
  this.addGenericStep('wait', 'Wait for element to be enabled', 'wait-enabled');
  break;
case 'wait-value':
  this.addGenericStep('wait', 'Wait for specific value', 'wait-value');
  break;
case 'wait-until':
  this.addGenericStep('wait', 'Wait until condition is met', 'wait-until');
  break;
*/

// Аналогично для всех остальных групп...
