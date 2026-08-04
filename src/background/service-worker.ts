import type { OutgoingMessage } from '@shared/messages';
import { handleMessage } from './message-handler';

console.log('[UPI] Service worker loaded');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message as OutgoingMessage)
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
