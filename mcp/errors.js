/* A failure whose message is written to be shown to the assistant — an unknown
 * tag, a task that is not there, an id that names a series rule. tools.js hands
 * these back as a normal tool error the model can read and recover from.
 *
 * Anything that is NOT one of these (a Firestore outage, a bug) is logged on
 * the server and answered with a generic message: what the database said about
 * itself can carry project ids and paths, and none of it belongs in a client. */
export class McpToolError extends Error {
  constructor(message) {
    super(message)
    this.name = 'McpToolError'
  }
}
