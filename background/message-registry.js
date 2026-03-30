/**
 * Реестр обработчиков сообщений background script.
 *
 * @typedef {Object} HandlerContext
 * @property {*} manager - Экземпляр TestManager
 * @property {{ type: string } & Record<string, *>} message - Сообщение (message.type + payload)
 * @property {chrome.runtime.MessageSender} [sender]
 * @property {function(*): void} sendResponse - Отправить ответ (вызвать ровно один раз)
 *
 * @typedef {function(HandlerContext): Promise<void>|void} MessageHandler
 */

class MessageRegistry {
  constructor(manager) {
    this.manager = manager;
    this.handlers = new Map();
  }

  /**
   * @param {string} type - Тип сообщения (например 'GET_TESTS', 'PLAY_TEST')
   * @param {MessageHandler} handler
   */
  register(type, handler) {
    if (!type || typeof handler !== 'function') {
      return;
    }
    this.handlers.set(type, handler);
  }

  handle(type, message, sender, sendResponse) {
    var handler = this.handlers.get(type);
    if (!handler) return Promise.resolve(false);
    return Promise.resolve(handler({ manager: this.manager, message, sender, sendResponse })).then(function() { return true; });
  }
}

self.MessageRegistry = MessageRegistry;
