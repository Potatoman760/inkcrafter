/* Fixture data for the UI kit. Mirrors the shapes in @shared/*, with the
   example project from the repo's screenshots. */
const PROJECT = { title: 'Breedhaven', path: '~/InkCrafter/breedhaven', main: 'ink/main.ink' };

const FILES = [
  { path: 'ink/chapter1.ink' }, { path: 'ink/chapter2.ink' }, { path: 'ink/chapter3.ink' },
  { path: 'ink/chapter4.ink' }, { path: 'ink/chapter5.ink' }, { path: 'ink/main.ink' },
  { path: 'ink/state.ink' }
];

const CODEX = [
  { id: 'k', type: 'Characters', name: 'Kael', folder: 'cast', count: 42 },
  { id: 'm', type: 'Characters', name: 'Maren', folder: 'cast', count: 17 },
  { id: 'w', type: 'Characters', name: 'The Warden', folder: 'cast', count: 0 },
  { id: 'c', type: 'Locations', name: 'The Cove', folder: '', count: 9 },
  { id: 'b', type: 'Locations', name: 'Breedhaven', folder: '', count: 31 },
  { id: 't', type: 'Lore', name: 'The Tithe', folder: 'lore', count: 4 }
];

const INK = [
  { n: 32, spans: [['comment', '// the cove, after the storm']] },
  { n: 33, spans: [['keyword', 'VAR'], ' lantern ', ['operator', '='], ' ', ['number', 'false']] },
  { n: 34, spans: [] },
  { n: 35, spans: [['heading', '=== the_cove ===']] },
  { n: 36, spans: ['The boat is still there, half-swamped and turned against the rocks.'] },
  { n: 37, spans: [['meta', '# bg:cove/dawn  # char:kael/wary']] },
  { n: 38, spans: [['mention', 'Kael'], ' says nothing for a long moment.'] },
  { n: 39, spans: [] },
  { n: 40, spans: [['keyword', '*'], ' ', ['label', '(push)'], ' [Push it out] ', ['operator', '~'], ' trust ', ['operator', '+='], ' ', ['number', '1']] },
  { n: 41, spans: ['    ', ['link', '->'], ' the_open_water'] },
  { n: 42, spans: [['keyword', '*'], ' [Wait for ', ['mention', 'Kael'], ' to speak first]'] },
  { n: 43, spans: ['    ', ['link', '->'], ' the_waiting'] },
  { n: 44, spans: [['keyword', '*'], ' ', ['operator', '{'], 'lantern', ['operator', '}'], ' [Light the lantern]'] },
  { n: 45, spans: ['    ', ['link', '->'], ' the_signal'] },
  { n: 46, spans: [['keyword', '-'], ' ', ['meta', 'TODO: write the refusal branch']] },
  { n: 47, spans: [] },
  { n: 48, spans: [['heading', '=== the_waiting ===']] },
  { n: 49, spans: ['He watches the water instead of you.'] }
];

const DIAGNOSTICS = [
  { severity: 'error', line: 52, message: "Expected a knot name after '->'. 'the_singal' is not defined." },
  { severity: 'warning', line: 12, message: 'main.ink includes ink/state.ink twice.' },
  { severity: 'todo', line: 88, file: 'ink/chapter4.ink', message: 'TODO: write the refusal branch.' }
];

const PLAN = [
  { title: 'Act One — The Tithe', summary: 'Breedhaven pays, and Kael refuses.', chapters: [
    { title: 'Arrival', status: 'done', summary: 'The boat comes in on a tide nobody expected.', tags: ['coast'], cast: ['Kael'], files: ['chapter1.ink'], knot: 'arrival', scenes: 4 },
    { title: 'The Cove', status: 'drafting', summary: 'Kael finds the boat, and decides whether the crossing is still on the table.', tags: ['coast', 'night'], cast: ['Kael', 'Maren'], files: ['chapter3.ink'], knot: 'the_cove', scenes: 3 },
    { title: 'The Warden Calls', status: 'planned', summary: '', tags: [], cast: ['The Warden'], files: [], knot: 'warden_calls', scenes: 0 }
  ]},
  { title: 'Act Two — The Crossing', summary: '', chapters: [
    { title: 'Open Water', status: 'planned', summary: 'Three days out, and the lantern matters.', tags: ['sea'], cast: [], files: ['chapter4.ink'], knot: 'open_water', scenes: 2 }
  ]}
];

const MEDIA = {
  characters: [
    { name: 'kael', looks: 2, tag: 'char:kael/wary' },
    { name: 'maren', looks: 1, tag: 'char:maren/neutral' }
  ],
  backgrounds: [ { name: 'cove', looks: 2, tag: 'bg:cove/dawn' } ],
  unfiled: ['bg/test-cove.png', 'bg/unfiled-ruins.png']
};

const STATS = [
  { name: 'trust', kind: 'number', start: 0, min: 0, max: 10, uses: 6, category: 'Relationships' },
  { name: 'lantern', kind: 'flag', start: 'false', uses: 3, category: 'Inventory' },
  { name: 'coin', kind: 'number', start: 4, min: 0, max: 99, uses: 11, category: 'Inventory' }
];

const ITEMS = [
  { name: 'lantern', label: 'Storm lantern', desc: 'Burns for one crossing.', uses: 3 },
  { name: 'tithe_note', label: 'The tithe note', desc: 'Signed, unpaid.', uses: 1 }
];

const CAST = [
  { name: 'kael', sprite: 'kael', attrs: [ { key: 'trust', value: 6, min: 0, max: 10 }, { key: 'mood', value: 'wary' } ] },
  { name: 'maren', sprite: 'maren', attrs: [ { key: 'trust', value: 2, min: 0, max: 10 } ] }
];

const HOTSPOTS = [
  { name: 'The Cove', knot: 'the_cove', x: 22, y: 58, gated: false },
  { name: 'Breedhaven', knot: 'breedhaven', x: 61, y: 34, gated: false },
  { name: 'The Warden\'s House', knot: 'warden_house', x: 78, y: 66, gated: true }
];

const MANUSCRIPT = {
  entryLabel: 'ink/main.ink',
  wordCount: 1412,
  choicesTaken: 2,
  complete: false,
  traced: { knot: 'the_cove', steps: 2 },
  nodes: [
    { kind: 'prose', text: 'The boat is still there, half-swamped and turned against the rocks. Kael says nothing for a long moment, which is how you know the crossing is still on the table.', mention: 'Kael', line: 36 },
    { kind: 'junction', ordinal: 1, chosenIndex: 0, choices: [
      { index: 0, text: 'Push it out', line: 40 },
      { index: 1, text: 'Wait for Kael to speak first', line: 42 },
      { index: 2, text: 'Light the lantern', line: 44 }
    ]},
    { kind: 'prose', text: 'The hull grinds, then floats. Kael steps in after you without being asked.', mention: 'Kael', line: 61 },
    { kind: 'junction', ordinal: 2, chosenIndex: null, choices: [
      { index: 0, text: 'Row for the headland', line: 74 },
      { index: 1, text: 'Say the tithe is paid', line: 76 }
    ]}
  ]
};

const COMMANDS = [
  { id: '1', section: 'File', label: 'New file…', icon: 'file-plus', keys: 'Ctrl+N' },
  { id: '2', section: 'File', label: 'Save', icon: 'save', keys: 'Ctrl+S' },
  { id: '3', section: 'File', label: 'Export bundle…', icon: 'package', keys: '' },
  { id: '4', section: 'Project', label: 'Project settings…', icon: 'settings', keys: '' },
  { id: '5', section: 'Project', label: 'Manage cast', icon: 'users', keys: 'Ctrl+Shift+C' },
  { id: '6', section: 'Project', label: 'Stats & items', icon: 'package', keys: 'Ctrl+Shift+S' },
  { id: '7', section: 'Project', label: 'Media library', icon: 'image', keys: '' },
  { id: '8', section: 'Project', label: 'Edit the map', icon: 'map', keys: '' },
  { id: '9', section: 'View', label: 'Editor', icon: 'file-text', keys: 'Ctrl+1' },
  { id: '10', section: 'View', label: 'Manuscript', icon: 'book-open', keys: 'Ctrl+2' },
  { id: '11', section: 'View', label: 'Plan', icon: 'layout-grid', keys: 'Ctrl+3' },
  { id: '12', section: 'View', label: 'Game', icon: 'gamepad-2', keys: 'Ctrl+4' },
  { id: '13', section: 'Assistant', label: 'Ask the assistant', icon: 'sparkles', keys: 'Ctrl+Shift+A' }
];
