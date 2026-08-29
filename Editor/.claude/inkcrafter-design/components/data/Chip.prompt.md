Tags, detected cast, attached files. Always inside `ChipRow`.

```jsx
<ChipRow>
  <Chip>coast</Chip>
  <Chip variant="detected" onClick={open}>Kael</Chip>
  <Chip mono onRemove={detach}>chapter3.ink</Chip>
</ChipRow>
```

`detected` (dashed) is reserved for things InkCrafter inferred — it tells the author what they did not write.
