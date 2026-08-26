Confirms writes the author cannot see happening — assistant edits, generated `state.ink`, exports.

```jsx
<ToastStack>
  <Toast tone="ok" title="Wrote ink/state.ink" detail="+1 INCLUDE in main.ink" onDismiss={dismiss} />
</ToastStack>
```

Never toast something already visible on screen. Two at most; the third replaces the oldest.

**Placement:** `ToastStack` is `position: absolute`, so mount it inside the content
pane it reports on — that pane needs `position: relative`. Do not mount it at the
window root: the window's bottom-right corner belongs to the dock composer and the
diagnostics strip, and a window-anchored toast will cover one of them at every size.
A toast must never cover a compile error or the Send button.
