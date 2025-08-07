import { z } from 'zod'

// This represents the full Todo object, like the one in your database.
export const TodoBaseSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1, 'Text cannot be empty'),
  completed: z.boolean(),
  createdAt: z.date(),
})

export const TodoCreateBodySchema = TodoBaseSchema.pick({
  text: true,
})

export const TodoUpdateBodySchema = TodoBaseSchema.pick({
  text: true,
  completed: true,
}).partial()

export const TodoResponseSchema = TodoBaseSchema
