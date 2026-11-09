import type { SkillManifest } from '@involvex/ctrl-s';

/** Built-in skills always available (enabled state comes from skills.json). */
export const BUILTIN_SKILLS: SkillManifest[] = [
  {
    id: 'knowledge-assistant',
    name: 'Knowledge assistant',
    description:
      'Prefer host knowledge search and memory when answering factual questions about the workspace.',
    instructions: [
      'You have access to the host knowledge base and memory review.',
      'When the user asks about stored notes, docs, or prior facts, search knowledge first and cite chunk hits.',
      'Prefer hybrid search when unsure whether the answer is keyword or semantic.',
      'Do not invent citations; say when nothing relevant was found.',
    ].join('\n'),
    toolNames: [],
    enabled: false,
    builtin: true,
  },
];
