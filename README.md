The package exports a constructor for EventEmitter objects purpose built for replicating [Common Form servers](https://www.npmjs.com/packages/commonform-serve), which of this writing utilize [httpcallback](https://www.npmjs.com/packages/httpcallback) for registering and serving data to HTTP callback receiving servers.

The public API is:

1. `start` to start replication, with two arguments:
    1. A string URL with the protocol (HTTP or HTTPS), auth, host, and port of the server to replicate.
    2. A string URL that the server should POST to with new form digests.
2. `stop`, to stop replication, with no arguments.
3. `request`, to request replication of the content of a form, with one argument, a string digest for the form to replicate.

The most important events are:

1. `"digest"`, when the replicator becomes aware of the digest of a form on the replicated server, with one argument, a string form digest. You may with to call `replicator.request(digest)` with that argument to replicate its data.
2. `"form"`, when the replicator receives form data for a `replicator.request(digest)` call, with two arguments:
    1. A string digest for the form.
    2. A deserialized Common Form object.
3. `"error"`, with one argument, the error object. Replicators set an additional `"action"` property on errors to indicate the context in which they come about.

In general, the package approaches replication as a two-step process:

1. Register an HTTP callback for new writes.
2. Then, request an index of already existing forms, by digest. This request may be relatively long running.

This approach is inferior, in efficiency terms, to other common message broader and pub/sub approaches. It has one large offsetting benefit relevant to Common Form: It allows Common Form servers to avoid storing data that could be used to infer when a particular Common Form was added to the content-addressable, relative to other, unrelated forms. In graph terms, it enables Common Form servers to enable ordering trees of the forests they store.

The primary intended use case is to link smaller service providing indexing or other analysis to master Common Form servers. Such ancillary services might provide, for example:

1. What headings start with "Disclaimer of"?
2. "What forms define the term 'Liability'?"
3. "What forms contain the form with digest ...?"
