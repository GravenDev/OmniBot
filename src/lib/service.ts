import { DeclarationType, type Declared } from "./declared.js";

export interface Service {}

export function declareService<T extends Service>(service: T): Declared<T> {
  return Object.assign(service, { type: DeclarationType.Service });
}
