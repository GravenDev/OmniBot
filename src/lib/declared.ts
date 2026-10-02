export enum DeclarationType {
  Module = "module",
  Command = "command",
  Listener = "listener",
  Service = "service",
  Interaction = "interaction",
  Task = "task",
}

/**
 * This is a utility type used to declare a file whose purpose is to be dynamically imported.
 * It adds a `type` property to the object, which is used to identify the type of the declared object.
 * This is useful for type safety and ensuring that the object conforms to a specific structure.
 */
export type Declared<T> = {
  type: DeclarationType;
} & T;
