import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  checkHealth,
  createConversation,
  createWorkspace,
  listConversations,
  listWorkspaces,
  setClientAuth,
  uploadAttachmentText,
} from '@involvex/ctrl-i';
import { loadSavedConnection } from '../connection/storage';

const MAX_CHARS = 80_000;

export type PickedTextFile =
  { ok: true; filename: string; text: string } | { ok: false; error: string };

export type AttachTextResult =
  | {
      ok: true;
      filename: string;
      text: string;
      uploaded: boolean;
      message: string;
    }
  | { ok: false; error: string };

export async function pickTextFile(): Promise<PickedTextFile> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'text/*',
      'text/plain',
      'text/markdown',
      'application/json',
      'application/xml',
      '*/*',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) {
    return { ok: false, error: 'cancelled' };
  }
  const asset = result.assets[0];
  const filename = asset.name ?? 'note.txt';
  try {
    const text = await FileSystem.readAsStringAsync(asset.uri);
    if (!text.trim()) {
      return { ok: false, error: 'File is empty.' };
    }
    if (text.length > MAX_CHARS) {
      return {
        ok: false,
        error: `File too large for chat attach (max ${MAX_CHARS} chars).`,
      };
    }
    return { ok: true, filename, text };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Could not read file as text.',
    };
  }
}

/**
 * Pick a text file, optionally upload to gateway knowledge when paired,
 * and return text for inserting into the chat draft / local message.
 */
export async function attachTextFileToChat(opts: {
  gatewayConversationId?: string | null;
}): Promise<AttachTextResult> {
  const picked = await pickTextFile();
  if (!picked.ok) {
    return {
      ok: false,
      error: picked.error === 'cancelled' ? 'cancelled' : picked.error,
    };
  }

  const saved = await loadSavedConnection();
  if (!saved) {
    return {
      ok: true,
      filename: picked.filename,
      text: picked.text,
      uploaded: false,
      message: 'Attached locally (PC offline / not paired).',
    };
  }

  setClientAuth({ token: saved.token || undefined });
  try {
    await checkHealth(saved.gatewayUrl);
  } catch {
    return {
      ok: true,
      filename: picked.filename,
      text: picked.text,
      uploaded: false,
      message: 'Attached locally · PC offline.',
    };
  }

  try {
    const workspaces = await listWorkspaces(saved.gatewayUrl);
    let ws = workspaces[0] ?? null;
    if (!ws) {
      ws = await createWorkspace(saved.gatewayUrl, 'Mobile');
    }
    let conversationId = opts.gatewayConversationId ?? null;
    if (!conversationId) {
      const conversations = await listConversations(saved.gatewayUrl, ws.id);
      conversationId = conversations[0]?.id ?? null;
      if (!conversationId) {
        const cv = await createConversation(saved.gatewayUrl, ws.id, 'Chat');
        conversationId = cv.id;
      }
    }
    await uploadAttachmentText(saved.gatewayUrl, ws.id, {
      filename: picked.filename,
      mimeType: mimeForName(picked.filename),
      text: picked.text,
      conversationId,
    });
    return {
      ok: true,
      filename: picked.filename,
      text: picked.text,
      uploaded: true,
      message: `Ingested ${picked.filename} on PC · also in draft.`,
    };
  } catch (err: unknown) {
    return {
      ok: true,
      filename: picked.filename,
      text: picked.text,
      uploaded: false,
      message:
        err instanceof Error
          ? `Local only · upload failed: ${err.message}`
          : 'Local only · upload failed.',
    };
  }
}

function mimeForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown';
  }
  if (lower.endsWith('.json')) {
    return 'application/json';
  }
  if (lower.endsWith('.xml')) {
    return 'application/xml';
  }
  return 'text/plain';
}

export function formatAttachmentDraft(filename: string, text: string): string {
  return `Attached file: ${filename}\n\n${text}`;
}
