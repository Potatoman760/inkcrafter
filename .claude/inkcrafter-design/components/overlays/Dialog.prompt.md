Modal shell with scrim, Escape handling and a footer action bar.

```jsx
<Dialog title="Project settings" subtitle="~/stories/breedhaven" onClose={close}
  footer={<><Button variant="danger">Delete</Button><DialogSpacer /><Button onClick={close}>Cancel</Button><Button variant="primary">Save</Button></>}>
  …fields…
</Dialog>
```

Never stack a dialog on a dialog — swap them, as the app already does for project → libraries.
