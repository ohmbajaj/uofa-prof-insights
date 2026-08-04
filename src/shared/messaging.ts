import type { IncomingMessage, MessageOfType, OutgoingMessage } from './messages';

/**
 * Sends a message to the service worker and narrows the reply to `expected`.
 *
 * Throws rather than returning a union, so every caller has exactly one failure
 * path to handle: a dead channel, an `ERROR` reply and an unexpected reply type
 * all surface the same way.
 */
export async function sendMessage<T extends IncomingMessage['type']>(
  message: OutgoingMessage,
  expected: T,
): Promise<MessageOfType<IncomingMessage, T>> {
  const reply = (await chrome.runtime.sendMessage(message)) as IncomingMessage | undefined;

  if (!reply) {
    // Service worker asleep, or the channel closed before it replied.
    throw new Error('no response from service worker');
  }
  if (reply.type === 'ERROR') {
    throw new Error(reply.message);
  }
  if (reply.type !== expected) {
    throw new Error(`expected ${expected} but received ${reply.type}`);
  }

  return reply as MessageOfType<IncomingMessage, T>;
}
