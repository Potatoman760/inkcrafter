The single button primitive; variant carries meaning, not decoration.

```jsx
<Button variant="primary" icon="plus">Add chapter</Button>
<Button variant="quiet" size="sm">Rescan</Button>
<Button variant="link">delete</Button>
```

Rules: one `primary` per pane at most; `quiet` is the default inside `.ic-toolbar` and `.ic-pane-header`; `danger` never sits next to `primary` — put destruction in a menu or on the far left of a dialog footer.
