Ctrl/Cmd+K palette — the system's answer to "features are hard to reach".

```jsx
{paletteOpen && <CommandPalette commands={COMMANDS} onRun={run} onClose={close} />}
```

Sections must match the application menus verbatim. Every command that exists in a menu or a toolbar has to appear here; that invariant is what lets panes stay clean.
