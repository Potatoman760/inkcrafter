/* Boots the UI kit.
   Primitives come from the compiled design-system bundle when it is present;
   otherwise the component sources are transpiled in the browser, so the kit
   also opens straight from disk. window.KIT_VIEW picks the starting view. */
const SOURCES = [
  '../../components/core/Icon.jsx',
  '../../components/controls/Button.jsx','../../components/controls/IconButton.jsx',
  '../../components/controls/Input.jsx','../../components/controls/Textarea.jsx',
  '../../components/controls/Select.jsx','../../components/controls/Checkbox.jsx',
  '../../components/controls/Field.jsx','../../components/controls/Segmented.jsx',
  '../../components/data/ListRow.jsx','../../components/data/Badge.jsx','../../components/data/Chip.jsx',
  '../../components/data/Card.jsx','../../components/data/Thumb.jsx',
  '../../components/navigation/Toolbar.jsx','../../components/navigation/Tabs.jsx',
  '../../components/navigation/PaneHeader.jsx','../../components/navigation/Splitter.jsx',
  '../../components/navigation/CommandPalette.jsx',
  '../../components/feedback/StatusPill.jsx','../../components/feedback/Diagnostics.jsx',
  '../../components/feedback/EmptyState.jsx','../../components/feedback/Toast.jsx','../../components/feedback/Meter.jsx',
  '../../components/overlays/Dialog.jsx','../../components/overlays/Menu.jsx','../../components/overlays/MasterDetail.jsx',
  'data.js','SidebarPane.jsx','EditorScreen.jsx','ManuscriptScreen.jsx','PlanScreen.jsx',
  'GameScreen.jsx','DockPanel.jsx','Overlays.jsx','FirstRun.jsx','AppShell.jsx'
];

(async () => {
  try {
    const parts = [];
    for (const path of SOURCES) {
      const text = await (await fetch(path)).text();
      const names = [...text.matchAll(/export\s+(?:function|const|class)\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]);
      const body = text.replace(/^\s*import[^\n]*\n/gm, '').replace(/\bexport\s+/g, '');
      // Each module keeps its own scope (several declare a private SIZES) and
      // publishes only its exports.
      parts.push(names.length
        ? ';(function(){\n' + body + '\nObject.assign(window, {' + names.join(',') + '});\n})();'
        : body);
    }
    parts.push(`
      ReactDOM.createRoot(document.getElementById('root')).render(
        React.createElement(AppShell, {
          project: PROJECT, files: FILES, codex: CODEX, ink: INK, diagnostics: DIAGNOSTICS,
          plan: PLAN, media: MEDIA, stats: STATS, items: ITEMS, cast: CAST, hotspots: HOTSPOTS,
          manuscript: MANUSCRIPT, commands: COMMANDS
        })
      );
    `);
    const { useState, useEffect, useRef, useMemo } = React;
    const code = Babel.transform(parts.join('\n'), { presets: [['react', { runtime: 'classic' }]] }).code;
    new Function('React', 'ReactDOM', 'Babel', 'useState', 'useEffect', 'useRef', 'useMemo', code)(
      React, ReactDOM, Babel, useState, useEffect, useRef, useMemo
    );
  } catch (cause) {
    console.error('kit boot failed', cause);
    document.getElementById('root').innerHTML =
      '<pre style="padding:16px;color:var(--state-error);font:12px var(--font-mono);white-space:pre-wrap">' +
      ((cause && cause.stack) || cause) + '</pre>';
  }
})();

document.addEventListener('click', (event) => {
  if (!event.target.closest('.kit-theme')) return;
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
});
