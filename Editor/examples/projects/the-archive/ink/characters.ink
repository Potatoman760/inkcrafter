// Shared character state, pulled in by main.ink via INCLUDE.

VAR archivist_name = "Wren"
VAR archivist_trust = 0

=== function archivist(text) ===
~ return "{archivist_name}: \"{text}\""
