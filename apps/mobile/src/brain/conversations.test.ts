import { describe, expect, test } from 'bun:test';
import {
  appendLocalMessage,
  createEmptyBrain,
  createLocalConversation,
  deleteConversation,
  listConversations,
  maybeTitleFromFirstMessage,
  renameConversation,
  switchConversation,
} from './store';

describe('brain conversations', () => {
  test('create and switch', () => {
    let brain = createEmptyBrain();
    const first = brain.activeConversationId;
    brain = createLocalConversation(brain, 'New chat');
    expect(brain.conversations).toHaveLength(2);
    expect(brain.activeConversationId).not.toBe(first);
    brain = switchConversation(brain, first);
    expect(brain.activeConversationId).toBe(first);
  });

  test('auto-title from first user message', () => {
    let brain = createEmptyBrain();
    brain = appendLocalMessage(brain, {
      role: 'user',
      content: '  Ship the cancel button today please  ',
      origin: 'local',
    });
    brain = maybeTitleFromFirstMessage(
      brain,
      '  Ship the cancel button today please  '
    );
    expect(brain.conversations[0]!.title).toBe(
      'Ship the cancel button today please'
    );
  });

  test('rename and delete keep one conversation', () => {
    let brain = createEmptyBrain();
    brain = createLocalConversation(brain);
    const doomed = brain.activeConversationId;
    brain = switchConversation(brain, brain.conversations[1]!.id);
    brain = renameConversation(brain, brain.activeConversationId, 'Keep me');
    brain = deleteConversation(brain, doomed);
    expect(brain.conversations).toHaveLength(1);
    expect(brain.conversations[0]!.title).toBe('Keep me');
    const alone = deleteConversation(brain, brain.activeConversationId);
    expect(alone.conversations).toHaveLength(1);
  });

  test('listConversations sorts by updatedAt desc', () => {
    let brain = createEmptyBrain();
    const older = brain.activeConversationId;
    brain = createLocalConversation(brain, 'Newer');
    const listed = listConversations(brain);
    expect(listed[0]!.id).toBe(brain.activeConversationId);
    expect(listed[1]!.id).toBe(older);
  });
});
