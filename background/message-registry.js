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

  async handle(type, message, sender, sendResponse) {
    const handler = this.handlers.get(type);
    if (!handler) {
      return false;
    }
    await handler({ manager: this.manager, message, sender, sendResponse });
    return true;
  }
}

self.MessageRegistry = MessageRegistry;
