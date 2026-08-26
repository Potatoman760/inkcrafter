Native select, restyled. Use for 4+ mutually exclusive options; use `Segmented` for 2–3.

```jsx
<Select value={status} onChange={onStatus}>
  <option value="">—</option>
  <option value="planned">Planned</option>
</Select>
```

An action-select (a picker that does something on change) shows its verb in the first option: `+ ink file…`.
