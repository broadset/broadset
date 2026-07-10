import { z } from 'zod';

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export interface ExtensionEnvelope {
  readonly namespace: string;
  readonly schema: string;
  readonly version: number;
  readonly payload: JsonValue;
}

const extensionNamespaceSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u);

export const extensionEnvelopeSchema: z.ZodType<ExtensionEnvelope> = z.strictObject({
  namespace: extensionNamespaceSchema,
  schema: z.url(),
  version: z.number().int().positive(),
  payload: jsonValueSchema,
});
