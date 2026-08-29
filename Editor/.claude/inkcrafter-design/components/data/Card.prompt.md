Content card with head / summary / chips / foot, and a status stripe.

```jsx
<Card status="drafting" interactive>
  <CardHead><CardTitle>The Cove</CardTitle><Badge>3 scenes</Badge></CardHead>
  <CardSummary>Kael finds the boat.</CardSummary>
  <CardFoot><code>the_cove</code></CardFoot>
</Card>
```

The foot is monospace metadata only — knot names, counts. Actions go in the head.
