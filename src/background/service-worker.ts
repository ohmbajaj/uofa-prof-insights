import { isTrustedRuntimeSender, parseOutgoingMessage } from '@shared/validation';
import { handleMessage } from './message-handler';

console.log('[UPI] Service worker loaded');

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isTrustedRuntimeSender(sender, chrome.runtime.id)) {
    sendResponse({ type: 'ERROR', message: 'Message rejected: untrusted sender' });
    return false;
  }

  const parsed = parseOutgoingMessage(message);
  if (!parsed) {
    sendResponse({ type: 'ERROR', message: 'Message rejected: invalid payload' });
    return false;
  }

  handleMessage(parsed)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        type: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    });

  // Keeps the message channel open for the async response above.
  return true;
});
