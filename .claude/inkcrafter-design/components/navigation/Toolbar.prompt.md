Top-of-window bar. Owns global identity, the view switch and status — nothing pane-specific.

```jsx
<Toolbar>
  <ToolbarBrand><Icon name="feather" size={15} />Breedhaven</ToolbarBrand>
  <Tabs items={views} value={view} onChange={setView} />
  <ToolbarFile>chapter3.ink</ToolbarFile>
  <ToolbarSpacer />
  <StatusPill state="ok">Compiled in 32ms</StatusPill>
</Toolbar>
```

At most two `quiet` icon buttons on the right. Everything else belongs to the command palette.
