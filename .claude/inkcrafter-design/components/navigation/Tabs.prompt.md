Every tab strip in the app, at three levels.

```jsx
<Tabs level="pane" label="Right panel" value={tab} onChange={setTab}
  items={[{value:'assistant',label:'Assistant'},{value:'preview',label:'Preview'}]} />
```

A tab always switches the content of the pane it sits in — never another column. Max three levels deep; if you need a fourth, it is a view.
