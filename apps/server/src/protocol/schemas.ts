import { z } from 'zod';

const suitSchema = z.enum(['♠', '♥', '♦', '♣']);

const rankSchema = z.union([
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.literal(11),
  z.literal(12),
  z.literal(13),
  z.literal(14),
]);

const cardSchema = z.object({ suit: suitSchema, rank: rankSchema }).strict();

export const moveIntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('attack'), card: cardSchema }).strict(),
  z.object({ type: z.literal('defend'), card: cardSchema, against: cardSchema }).strict(),
  z.object({ type: z.literal('takeCards') }).strict(),
  z.object({ type: z.literal('endAttack') }).strict(),
]);

export type MoveIntent = z.infer<typeof moveIntentSchema>;

export const reconnectPayloadSchema = z.object({ sessionToken: z.string().min(16) }).strict();

export type ReconnectPayload = z.infer<typeof reconnectPayloadSchema>;
