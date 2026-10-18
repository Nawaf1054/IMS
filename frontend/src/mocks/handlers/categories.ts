import { http } from 'msw'

import { categoryView, db } from '../db'
import { API, fail, idParam, readBody, requireAdmin, requireUser, route } from '../http'

interface CategoryInput {
  name?: string
  parent_id?: number | null
}

function validate(input: CategoryInput, exceptId?: number) {
  const name = input.name?.trim() ?? ''
  if (!name) fail(422, 'VALIDATION_ERROR', 'Enter a name for the category.')
  if (db.categories.some((c) => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase())) {
    fail(409, 'CATEGORY_EXISTS', `“${name}” already exists. Category names must be unique.`)
  }
  const parentId = input.parent_id ?? null
  if (parentId !== null) {
    const parent = db.categories.find((c) => c.id === parentId)
    if (!parent) fail(422, 'VALIDATION_ERROR', 'Parent category not found.')
    // CAT-2: one level of subcategories.
    if (parent.parent_id !== null) fail(422, 'NESTING_TOO_DEEP', 'Subcategories can’t have their own subcategories.')
    if (parent.id === exceptId) fail(422, 'VALIDATION_ERROR', 'A category can’t be its own parent.')
  }
  return { name, parentId }
}

export const categoryHandlers = [
  http.get(
    `${API}/categories`,
    route(({ request }) => {
      requireUser(request)
      return db.categories.map(categoryView)
    }),
  ),

  http.post(
    `${API}/categories`,
    route(async ({ request }) => {
      requireAdmin(request)
      const { name, parentId } = validate(await readBody<CategoryInput>(request))
      const category = {
        id: db.categories.reduce((max, c) => Math.max(max, c.id), 0) + 1,
        name,
        parent_id: parentId,
        created_at: new Date().toISOString(),
      }
      db.categories.push(category)
      return categoryView(category)
    }),
  ),

  http.patch(
    `${API}/categories/:id`,
    route(async ({ request, params }) => {
      requireAdmin(request)
      const category = db.categories.find((c) => c.id === idParam(params)) ?? fail(404, 'CATEGORY_NOT_FOUND', 'Category not found.')
      const input = await readBody<CategoryInput>(request)
      const { name, parentId } = validate(
        { name: input.name ?? category.name, parent_id: input.parent_id === undefined ? category.parent_id : input.parent_id },
        category.id,
      )
      category.name = name
      category.parent_id = parentId
      return categoryView(category)
    }),
  ),

  http.delete(
    `${API}/categories/:id`,
    route(({ request, params }) => {
      requireAdmin(request)
      const category = db.categories.find((c) => c.id === idParam(params)) ?? fail(404, 'CATEGORY_NOT_FOUND', 'Category not found.')
      const children = db.categories.filter((c) => c.parent_id === category.id)
      const direct = db.products.filter((p) => p.category_id === category.id).length
      const nested = db.products.filter((p) => children.some((c) => c.id === p.category_id)).length
      // CAT-3: a category with products can't be deleted.
      if (direct > 0) {
        fail(
          409,
          'CATEGORY_NOT_EMPTY',
          `${direct} products are assigned to ${category.name}. Move them to another category or deactivate them, then try again.`,
        )
      }
      if (nested > 0) {
        fail(409, 'CATEGORY_NOT_EMPTY', `Its subcategories (${children.map((c) => c.name).join(', ')}) hold ${nested} products. Empty them first.`)
      }
      db.categories = db.categories.filter((c) => c.id !== category.id && c.parent_id !== category.id)
    }),
  ),
]
