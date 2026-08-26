Empty pane with its next action attached.

```jsx
<EmptyState title="No ink files yet"
  body="Chapters live as .ink files in this project's folder."
  action={<Button variant="primary" icon="plus">New file</Button>} />
```

Never ship a bare "Nothing here". `Hint` is the one-liner version for panes that already have content.
