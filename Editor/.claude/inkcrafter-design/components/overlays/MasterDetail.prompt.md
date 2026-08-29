Two-column catalogue layout used by every Game-view section.

```jsx
<MasterDetail
  master={<><Input size="sm" placeholder="Filter by name or tag…" /><MasterList>{rows}</MasterList></>}
  detail={selected ? <StatFields /> : <EmptyState title="Nothing selected" body="Pick a stat to edit it." centered />} />
```

The master column never scrolls its filter away; only `MasterList` scrolls.
