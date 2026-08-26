Compiler output strip. Collapses to a 24px status line when clean.

```jsx
<Diagnostics items={result.diagnostics} onSelect={goToLine} />
```

Severity sits in a fixed 56px column so messages align. Rows are clickable and jump to the line — a diagnostic that cannot be navigated to is a dead end.
