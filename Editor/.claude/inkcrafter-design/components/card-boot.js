/* Boots a component demo card.
   Loads the design-system component sources (they are plain JSX modules) and
   then the card's own demo file, named in window.CARD_DEMO. Independent of the
   compiled bundle, so a card renders wherever the file is opened. */
const CARD_SOURCES = [
  "../core/Icon.jsx",
  "../controls/Button.jsx",
  "../controls/IconButton.jsx",
  "../controls/Input.jsx",
  "../controls/Textarea.jsx",
  "../controls/Select.jsx",
  "../controls/Checkbox.jsx",
  "../controls/Field.jsx",
  "../controls/Segmented.jsx",
  "../data/ListRow.jsx",
  "../data/Badge.jsx",
  "../data/Chip.jsx",
  "../data/Card.jsx",
  "../data/Thumb.jsx",
  "../navigation/Toolbar.jsx",
  "../navigation/Tabs.jsx",
  "../navigation/PaneHeader.jsx",
  "../navigation/Splitter.jsx",
  "../navigation/CommandPalette.jsx",
  "../feedback/StatusPill.jsx",
  "../feedback/Diagnostics.jsx",
  "../feedback/EmptyState.jsx",
  "../feedback/Toast.jsx",
  "../feedback/Meter.jsx",
  "../overlays/Dialog.jsx",
  "../overlays/Menu.jsx",
  "../overlays/MasterDetail.jsx"
];

(async () => {
  try {
    const parts = [];
    for (const path of CARD_SOURCES.concat([window.CARD_DEMO])) {
      const text = await (await fetch(path)).text();
      const names = [...text.matchAll(/export\s+(?:function|const|class)\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]);
      const body = text.replace(/^\s*import[^\n]*\n/gm, '').replace(/\bexport\s+/g, '');
      parts.push(names.length
        ? ';(function(){\n' + body + '\nObject.assign(window, {' + names.join(',') + '});\n})();'
        : body);
    }
    parts.push("ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Demo));");
    const { useState, useEffect, useRef, useMemo } = React;
    const code = Babel.transform(parts.join('\n'), { presets: [['react', { runtime: 'classic' }]] }).code;
    new Function('React', 'ReactDOM', 'useState', 'useEffect', 'useRef', 'useMemo', code)(
      React, ReactDOM, useState, useEffect, useRef, useMemo
    );
  } catch (cause) {
    document.getElementById('root').innerHTML =
      '<pre style="padding:12px;color:var(--state-error);font:11px var(--font-mono);white-space:pre-wrap">' +
      ((cause && cause.stack) || cause) + '</pre>';
  }
})();
