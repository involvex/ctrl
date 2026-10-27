import {
  streamChat,
  updateProviderConfig,
  type RunSession,
} from '@involvex/ctrl-i';
import type { MutableRefObject } from 'react';
import type { ProviderEntry } from './stack';

export const CANCELLED_ERROR = 'cancelled';

export type CascadeGenerate = (prompt: string) => Promise<string>;

export type CascadeCallbacks = {
  onStatus: (line: string) => void;
  onDelta: (text: string) => void;
  litertGenerate: CascadeGenerate | null;
  litertUnavailable: string | null;
  ensureConversation: (baseUrl: string) => Promise<string>;
  sessionRef: MutableRefObject<RunSession | null>;
  gatewayUrl: string | null;
  /** Prefixed onto host/cloud turns (LiteRT uses engine systemPrompt). */
  systemPrefix?: string;
  isCancelled?: () => boolean;
};

export type CascadeResult = {
  text: string;
  providerId: string;
  providerLabel: string;
  origin: 'local' | 'gateway';
};

export function isCancelledError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase() === CANCELLED_ERROR;
}

function isHardFailure(err: unknown): boolean {
  if (isCancelledError(err)) {
    return false;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('denied') || lower.includes('empty prompt')) {
    return false;
  }
  return true;
}

function throwIfCancelled(isCancelled?: () => boolean): void {
  if (isCancelled?.()) {
    throw new Error(CANCELLED_ERROR);
  }
}

function abortGatewaySession(
  sessionRef: MutableRefObject<RunSession | null>
): void {
  const session = sessionRef.current;
  if (!session) {
    return;
  }
  try {
    session.cancel('user');
  } catch {
    try {
      session.close();
    } catch {
      // ignore
    }
  }
  sessionRef.current = null;
}

async function streamGatewayReply(
  baseUrl: string,
  conversationId: string,
  content: string,
  onDelta: (text: string) => void,
  sessionRef: MutableRefObject<RunSession | null>,
  isCancelled?: () => boolean
): Promise<string> {
  return new Promise((resolve, reject) => {
    let assembled = '';
    let settled = false;
    abortGatewaySession(sessionRef);

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (poll) {
        clearInterval(poll);
      }
      fn();
    };

    const poll = setInterval(() => {
      if (!isCancelled?.()) {
        return;
      }
      abortGatewaySession(sessionRef);
      settle(() => {
        reject(new Error(CANCELLED_ERROR));
      });
    }, 200);

    sessionRef.current = streamChat(baseUrl, conversationId, content, {
      onEvent: (event) => {
        if (settled) {
          return;
        }
        if (isCancelled?.()) {
          abortGatewaySession(sessionRef);
          settle(() => {
            reject(new Error(CANCELLED_ERROR));
          });
          return;
        }
        if (event.type === 'message.delta') {
          assembled += event.text;
          onDelta(assembled);
        }
        if (event.type === 'run.completed') {
          settle(() => {
            resolve(assembled || '(empty reply)');
          });
        }
        if (event.type === 'run.failed') {
          settle(() => {
            reject(new Error(event.error.message));
          });
        }
      },
      onError: (err) => {
        settle(() => {
          if (isCancelled?.()) {
            reject(new Error(CANCELLED_ERROR));
            return;
          }
          reject(err);
        });
      },
      onClose: () => {
        if (settled) {
          return;
        }
        if (isCancelled?.()) {
          settle(() => {
            reject(new Error(CANCELLED_ERROR));
          });
        }
      },
    });
  });
}

/**
 * Try enabled providers in order. Soft cancels / policy denials stop the chain.
 */
export async function runProviderCascade(
  providers: ProviderEntry[],
  content: string,
  cb: CascadeCallbacks
): Promise<CascadeResult> {
  if (!content.trim()) {
    throw new Error('empty prompt');
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    throwIfCancelled(cb.isCancelled);
    cb.onStatus(`trying ${provider.label}…`);
    cb.onDelta('');

    try {
      if (provider.kind === 'litert') {
        if (cb.litertUnavailable) {
          throw new Error(cb.litertUnavailable);
        }
        if (!cb.litertGenerate) {
          throw new Error(
            'On-device engine starting — wait a moment, then send again.'
          );
        }
        const text = await cb.litertGenerate(content);
        throwIfCancelled(cb.isCancelled);
        return {
          text,
          providerId: provider.id,
          providerLabel: provider.label,
          origin: 'local',
        };
      }

      if (!cb.gatewayUrl) {
        throw new Error('PC offline');
      }

      if (provider.kind === 'zen' || provider.kind === 'openai') {
        await updateProviderConfig(cb.gatewayUrl, { active: 'zen' });
        throwIfCancelled(cb.isCancelled);
      }

      const conversationId = await cb.ensureConversation(cb.gatewayUrl);
      throwIfCancelled(cb.isCancelled);
      const outbound =
        cb.systemPrefix && cb.systemPrefix.trim()
          ? `${cb.systemPrefix.trim()}\n\n---\n\n${content}`
          : content;
      const text = await streamGatewayReply(
        cb.gatewayUrl,
        conversationId,
        outbound,
        cb.onDelta,
        cb.sessionRef,
        cb.isCancelled
      );
      throwIfCancelled(cb.isCancelled);
      return {
        text,
        providerId: provider.id,
        providerLabel: provider.label,
        origin: 'gateway',
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;
      if (!isHardFailure(error)) {
        throw error;
      }
      cb.onStatus(`${provider.label} failed · ${error.message} · trying next…`);
    }
  }

  throw lastError ?? new Error('No providers available');
}
