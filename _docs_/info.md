I answer inline below and also discuss the attached md file.

```
We think the top levels (graph -> nodes/edges -> slots) are more
clear, but we feel we don't fully grasp other elements of the system
such as protocols, states, tags, gates...
```

Just as an overall definition or discussion of capabilities:

- Protocols are things that get attached to a node or an edge of the
graph and "do stuff as time passes". They need to be constructed (and
during construction they are attached to a node or an edge or just
"float" without being attached to anything). Currently we do not have an
introspection API that tells you what a protocol is attached to after it
was constructed. I am marking this with TODO to find it later in this
email and put it on the issue tracker. Protocols need to be attached to
the simulation with the `@process` macro after they were constructed.
After that point, the `run` command will know to process anything
related to the protocol and the user probably will not even keep a
handle to the protocol itself anymore.

- States are represent the current state of a slot in a node. For
instance, slot 1 of node 1 can be in state "A" while slot 2 of node 3 is
in state "B". Here A and B are some complicated numerical representation
of the probability distribution of possible observed results if one was
actually to observe the quantum objects. Correlated states are also
possible, e.g. slot 2 of node 2 and slot 3 of node 3 might be
represented by a single state C (a state with two subsystems). There is
very little that the UI needs to do with states except create them,
`initialize!` slots to a certain state, and know that slots are already
initialized.

- Gates -- lets not worry about them in the first pass -- just
completely forget they exist, they are not too important right now

- Tags -- this is just some "metadata" attached to a node or a slot of a
node. For now let's just worry about showing that metadata, not about
modifying it. For various technical reasons it is currently represented
as a list of relatively weird sumtype instances. But we will set up an
API to cleanly list all currently present tags (TODO) -- there is
already a mostly complete version of that with the `query` function.

```
Below is a first diagram to illustrate our current understanding of
it, as well as some comments to help define what each object and
property represents and is intended for.

Please could you have a look and share some comments pointing to
missing pieces or misunderstood concepts?
```

Instead of Graph, there is RegisterNet. We can comfortably assume there
will be only one in the simulation, so no need for id, but some metadata
describing the simulation (your name and description entries) seem
appropriate for the ui.

Instead of Node, there is Register. It has slots. I think the type entry
for it is not needed. Currently its id is an integer, so maybe instead
of id (String) we can have id (Int) and slug (String). In our
simulations we refer to it by integer

Edge is not a directed edge -- there will not really be a difference
between source and target. Its id should really be just the ordered
tuple of source/target ints. But having a slug might be neat.

Protocols are their own things and can be assigned to a node to an edge
or not assigned to anything. We do not keep currently a mapping from a
node/edge to a list of protocols that have been assigned to it, but we
can add that.

Slot: id is an int, but we can add optional slugs; no gates or protocols
for it; representation is an instance of AbstractRepresentation and will
generally be a very simple structure. backgroundNoise is also a
similarly simple structure, not a string. Trait is a similarly simple
structure. States should probably not be visible for now as working with
it is complicated -- lets discuss it after most of the rest works.

BackgroundNoise can be a pretty arbitrary thing, it does not have a
simple schema. It would need to be constructable. We can provide
whatever introspection methods are needed to make that doable from the UI.

State and Gate are for later -- they are not really necessary for a
working version of the UI and reasonably orthogonal. State can mean a
few different things here, so we will need to introduce more vocabulary
to disambiguate.

Observable is for later -- it is reasonably orthogonal to everything else.

