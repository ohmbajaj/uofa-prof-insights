import { useState } from 'react';
import Status from './pages/Status';
import Settings from './pages/Settings';

const TABS = [
  { id: 'status', label: 'Status' },
  { id: 'settings', label: 'Settings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function App() {
  const [tab, setTab] = useState<TabId>('status');

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">UofA Prof Insights</h1>
        <span className="app__version">v{__APP_VERSION__}</span>
      </header>

      <div className="tabs" role="tablist" aria-label="Sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className="tabs__tab"
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'status' ? <Status /> : <Settings />}
      </div>
    </div>
  );
}
