Pane divider with pointer capture, keyboard steps and double-click reset.

```jsx
<Splitter value={sideWidth} onChange={setSideWidth} min={260} max={720} reset={420} invert label="Resize the right panel" />
```

Matches the app's existing `Splitter` behaviour exactly; only the visuals changed.
