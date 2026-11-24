/**
 * The provider group the dev sidecar loads for local Turso databases (see
 * `alchemy/Local/Sidecar.ts`): its default export is the provider layer, so
 * `sqld` processes outlive hot reloads of the stack.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";
import { LocalDatabaseProvider } from "./database.ts";

export default LocalDatabaseProvider().pipe(Layer.provide(NodeServices.layer));
