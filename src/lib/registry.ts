import type { ClientEvents } from "discord.js";
import type { Command } from "./command.js";
import { DeclarationType, type Declared } from "./declared.js";
import type {
  CompatibleInteraction,
  InteractionHandler,
} from "./interaction.js";
import type { EventListener } from "./listener.js";

/**
 * Represents the declarations made by a module.
 */
export class Registry {
  /**
   * An array of commands declared by the module.
   * @private
   */
  private readonly _commands: Declared<Command>[];

  /**
   * An array of event listeners declared by the module.
   * @private
   */
  private readonly _listeners: Declared<EventListener<any>>[] = [];

  /**
   * An array of interaction handlers declared by the module.
   * @private
   */
  private readonly _interactionHandlers: Declared<InteractionHandler<any>>[] =
    [];

  /**
   * Creates a new instance of the ModuleRegistry.
   */
  constructor() {
    this._commands = [];
    this._listeners = [];
    this._interactionHandlers = [];
  }

  /**
   * Retrieves all registered commands.
   *
   * @returns An array of registered commands.
   */
  get commands(): Declared<Command>[] {
    return [...this._commands];
  }

  /**
   * Retrieves all registered event listeners.
   *
   * @returns An array of registered event listeners.
   */
  get listeners(): Declared<EventListener<any>>[] {
    return [...this._listeners];
  }

  /**
   * Retrieves all registered interaction handlers.
   *
   * @returns An array of registered interaction handlers.
   */
  get interactionHandlers(): Declared<InteractionHandler<any>>[] {
    return [...this._interactionHandlers];
  }

  /**
   * Registers a command with the module.
   * @param command The command to register.
   * @throws Will throw an error if the command type is invalid.
   * @deprecated Use `register` method instead.
   */
  registerCommand(command: Declared<Command>): void {
    if (command.type !== DeclarationType.Command) {
      throw new Error("Invalid command declaration type");
    }

    this._commands.push(command);
  }

  /**
   * Registers an event listener with the module.

   * @param listener The event listener to register.
   * @throws Will throw an error if the listener type is invalid.
   * @deprecated Use `register` method instead.
   */
  registerEventListener(listener: Declared<EventListener<any>>): void {
    if (listener.type !== DeclarationType.Listener) {
      throw new Error("Invalid event listener declaration type");
    }

    this._listeners.push(listener);
  }

  /**
   * Registers an interaction handler with the module.
   *
   * @param interactionHandle The interaction handler to register.
   * @throws Will throw an error if the interaction handler type is invalid.
   * @deprecated Use `register` method instead.
   */
  registerInteractionHandler(
    interactionHandle: Declared<InteractionHandler<any>>
  ) {
    if (interactionHandle.type !== DeclarationType.Interaction) {
      throw new Error("Invalid interaction handler declaration type");
    }

    this._interactionHandlers.push(interactionHandle);
  }

  /**
   * Registers a handler (command, event listener, or interaction handler) with the module.
   * @param handler The handler to register.
   * @throws Will throw an error if the handler type is unknown.
   */
  register<
    TEventType extends keyof ClientEvents,
    TCompatibleInteraction extends CompatibleInteraction,
  >(
    handler: Declared<
      | InteractionHandler<TCompatibleInteraction>
      | EventListener<TEventType>
      | Command
    >
  ) {
    switch (handler.type) {
      case DeclarationType.Command:
        this._commands.push(handler as Declared<Command>);
        break;
      case DeclarationType.Listener:
        this._listeners.push(handler as Declared<EventListener<TEventType>>);
        break;
      case DeclarationType.Interaction:
        this._interactionHandlers.push(
          handler as Declared<InteractionHandler<TCompatibleInteraction>>
        );
        break;
      default:
        throw new Error(`Unknown declaration type | type = ${handler.type}`);
    }
  }
}
