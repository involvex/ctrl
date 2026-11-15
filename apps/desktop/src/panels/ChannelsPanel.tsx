import type { ChannelPublic } from '@involvex/ctrl-i';

export type ChannelKindOption = 'webhook' | 'telegram' | 'discord' | 'slack';

export type ChannelsPanelProps = {
  workspaceReady: boolean;
  channelKind: ChannelKindOption;
  channelName: string;
  channelBotToken: string;
  channelAppToken: string;
  channelTestRecipient: string;
  channelItems: ChannelPublic[];
  setChannelKind: (kind: ChannelKindOption) => void;
  setChannelName: (value: string) => void;
  setChannelBotToken: (value: string) => void;
  setChannelAppToken: (value: string) => void;
  setChannelTestRecipient: (value: string) => void;
  onCreateChannel: () => void;
  onTestChannel: (channel: ChannelPublic) => void;
  onRemoveChannel: (channelId: string) => void;
};

export function ChannelsPanel(props: ChannelsPanelProps) {
  const {
    workspaceReady,
    channelKind,
    channelName,
    channelBotToken,
    channelAppToken,
    channelTestRecipient,
    channelItems,
    setChannelKind,
    setChannelName,
    setChannelBotToken,
    setChannelAppToken,
    setChannelTestRecipient,
    onCreateChannel,
    onTestChannel,
    onRemoveChannel,
  } = props;

  return (
    <aside className="host-panel knowledge-panel host-panel-scroll">
      <section className="host-section">
        <p className="host-title">add channel</p>
        <p className="meta">
          webhook · telegram long-poll · discord gateway · slack socket mode ·
          status running = inbound connected
        </p>
        <div className="host-row">
          <select
            className="host-input host-input-narrow"
            value={channelKind}
            onChange={(e) => {
              const value = e.target.value;
              const next: ChannelKindOption =
                value === 'telegram' ||
                value === 'discord' ||
                value === 'slack' ||
                value === 'webhook'
                  ? value
                  : 'webhook';
              setChannelKind(next);
              setChannelName(next);
            }}
          >
            <option value="webhook">webhook</option>
            <option value="telegram">telegram</option>
            <option value="discord">discord</option>
            <option value="slack">slack</option>
          </select>
          <input
            className="host-input"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="channel name"
          />
        </div>
        {channelKind === 'telegram' ||
        channelKind === 'discord' ||
        channelKind === 'slack' ? (
          <div className="host-row">
            <input
              className="host-input"
              type="password"
              value={channelBotToken}
              onChange={(e) => setChannelBotToken(e.target.value)}
              placeholder="bot token"
              autoComplete="off"
            />
          </div>
        ) : null}
        {channelKind === 'slack' ? (
          <div className="host-row">
            <input
              className="host-input"
              type="password"
              value={channelAppToken}
              onChange={(e) => setChannelAppToken(e.target.value)}
              placeholder="app token (xapp-… Socket Mode)"
              autoComplete="off"
            />
          </div>
        ) : null}
        <div className="host-row">
          <button
            type="button"
            className="demo-btn"
            onClick={onCreateChannel}
            disabled={!workspaceReady}
          >
            add {channelKind}
          </button>
        </div>
      </section>

      <section className="host-section">
        <p className="host-title">configured</p>
        <div className="host-row">
          <input
            className="host-input"
            value={channelTestRecipient}
            onChange={(e) => setChannelTestRecipient(e.target.value)}
            placeholder="test recipient (chat / channel id)"
          />
        </div>
        <p className="meta">
          Test sends “ctrl channel test”. Webhook uses a desktop-test identity;
          bots need a chat/channel id above. Status <code>running</code> means
          inbound is connected.
        </p>
        <ul className="host-card-list">
          {channelItems.map((ch) => (
            <li key={ch.id} className="host-card">
              <div className="host-card-head">
                <span>
                  <code>{ch.kind}</code> {ch.name}
                </span>
                <span className="meta">
                  {ch.status}
                  {ch.lastError ? ` · ${ch.lastError}` : ''}
                </span>
              </div>
              <div className="host-row">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onTestChannel(ch)}
                >
                  test
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onRemoveChannel(ch.id)}
                >
                  remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        {channelItems.length === 0 ? (
          <p className="meta">no channels yet</p>
        ) : null}
      </section>
    </aside>
  );
}
