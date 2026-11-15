import type { McpServerInfo, SkillManifest } from '@involvex/ctrl-i';
import type { ToolDefinition } from '@involvex/ctrl-s';

export type ToolsPanelProps = {
  toolItems: ToolDefinition[];
  mcpServers: McpServerInfo[];
  skillItems: SkillManifest[];
  mcpIdDraft: string;
  mcpNameDraft: string;
  mcpCommandDraft: string;
  mcpArgsDraft: string;
  setMcpIdDraft: (value: string) => void;
  setMcpNameDraft: (value: string) => void;
  setMcpCommandDraft: (value: string) => void;
  setMcpArgsDraft: (value: string) => void;
  onRefresh: () => void;
  onReloadMcp: () => void;
  onUpsertMcp: () => void;
  onDeleteMcp: (serverId: string) => void;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
};

export function ToolsPanel(props: ToolsPanelProps) {
  const {
    toolItems,
    mcpServers,
    skillItems,
    mcpIdDraft,
    mcpNameDraft,
    mcpCommandDraft,
    mcpArgsDraft,
    setMcpIdDraft,
    setMcpNameDraft,
    setMcpCommandDraft,
    setMcpArgsDraft,
    onRefresh,
    onReloadMcp,
    onUpsertMcp,
    onDeleteMcp,
    onToggleSkill,
  } = props;

  return (
    <aside className="host-panel knowledge-panel host-panel-scroll">
      <p className="host-title">tools / MCP / skills</p>
      <div className="host-row">
        <button type="button" className="ghost-btn" onClick={onRefresh}>
          refresh
        </button>
        <button type="button" className="ghost-btn" onClick={onReloadMcp}>
          reload MCP
        </button>
      </div>

      <section className="host-section">
        <p className="host-title">add / update MCP server</p>
        <p className="meta">
          stdio command + args (space-separated). empty command = stub.
        </p>
        <div className="host-row">
          <input
            className="host-input host-input-narrow"
            value={mcpIdDraft}
            onChange={(e) => setMcpIdDraft(e.target.value)}
            placeholder="id"
          />
          <input
            className="host-input"
            value={mcpNameDraft}
            onChange={(e) => setMcpNameDraft(e.target.value)}
            placeholder="name"
          />
        </div>
        <div className="host-row">
          <input
            className="host-input"
            value={mcpCommandDraft}
            onChange={(e) => setMcpCommandDraft(e.target.value)}
            placeholder="command (e.g. npx)"
          />
        </div>
        <div className="host-row">
          <input
            className="host-input"
            value={mcpArgsDraft}
            onChange={(e) => setMcpArgsDraft(e.target.value)}
            placeholder="args (space-separated)"
          />
          <button type="button" className="ghost-btn" onClick={onUpsertMcp}>
            save
          </button>
        </div>
      </section>

      <p className="host-title">MCP servers</p>
      <ul className="knowledge-list">
        {mcpServers.map((server) => (
          <li key={server.id}>
            <code>{server.id}</code> {server.name}
            {server.command
              ? ` · ${server.command} ${(server.args ?? []).join(' ')}`
              : ' · stub'}{' '}
            <button
              type="button"
              className="ghost-btn"
              onClick={() => onDeleteMcp(server.id)}
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      {mcpServers.length === 0 ? <p className="meta">no MCP servers</p> : null}

      <p className="host-title">skills</p>
      <ul className="knowledge-list">
        {skillItems.map((skill) => (
          <li key={skill.id}>
            <label className="host-row">
              <input
                type="checkbox"
                checked={skill.enabled}
                onChange={(e) => onToggleSkill(skill.id, e.target.checked)}
              />
              <span>
                <code>{skill.id}</code> {skill.name}
                {skill.builtin ? ' · builtin' : ''}
                {skill.description ? ` — ${skill.description}` : ''}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {skillItems.length === 0 ? <p className="meta">no skills</p> : null}

      <p className="host-title">registered tools</p>
      <ul className="knowledge-list">
        {toolItems.map((tool) => (
          <li key={tool.name}>
            <code>{tool.name}</code> [{tool.risk}]
            {tool.requiresApproval ? ' · approval' : ''} — {tool.description}
          </li>
        ))}
      </ul>
    </aside>
  );
}
