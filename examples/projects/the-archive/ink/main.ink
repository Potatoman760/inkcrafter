// The entry point named by project.md.
// A two-file story, to exercise INCLUDE resolution.

INCLUDE characters.ink

VAR has_lantern = false

-> the_door

=== the_door ===
The door to the archive is shut, and the corridor behind you is very quiet. #scene:corridor

* [Try the handle]
    It turns. Of course it turns.
    -> inside

* [Look for another way]
    There is a grate at ankle height, breathing cold air.
    Someone left a lantern just inside, still warm.
    ~ has_lantern = true
    -> inside

=== inside ===
Inside, the shelves go up further than the light does.
{has_lantern: You raise the lantern and the nearest spines resolve into titles.|You wish you had thought to bring a light.}

Wren does not look up from the ledger.
{archivist("You're late.")}
~ archivist_trust = archivist_trust - 1

* ["I didn't know I was expected."]
    {archivist("Everyone is expected. That's the point of a door.")}
    -> ending
* [Say nothing]
    ~ archivist_trust = archivist_trust - 1
    -> ending

=== ending ===
The archive keeps what it keeps. #trust:{archivist_trust}
-> END
