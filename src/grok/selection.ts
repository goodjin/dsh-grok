/**
 * 用户勾选了哪些 Grok 模型。
 *
 * 勾选结果落在 ${DSH_HOME}/grok/selection.json。
 * 内存里留一份快照：模型行发布清单是同步路径，设置里改完勾选要立刻生效。
 */

import { readSelection, writeSelection, clearSelection } from '../modelkit/selection.ts'

/** 勾选结果的作用域。 */
export const GROK_SELECTION_SCOPE = 'grok'

/** 当前生效的勾选。 */
let current: readonly string[] | undefined

/** 当前勾选（内存快照）。 */
export function currentSelection(): readonly string[] | undefined {
  return current
}

/** 设置当前勾选。 */
export function setCurrentSelection(ids: readonly string[] | undefined): void {
  current = ids === undefined ? undefined : [...ids]
}

/** 从磁盘加载勾选到内存快照。 */
export async function loadSelection(): Promise<readonly string[] | undefined> {
  const stored = await readSelection(GROK_SELECTION_SCOPE).catch(() => undefined)
  setCurrentSelection(stored)
  return stored
}

/** 保存勾选到磁盘。 */
export async function saveSelection(ids: readonly string[] | undefined): Promise<void> {
  setCurrentSelection(ids)
  await writeSelection(GROK_SELECTION_SCOPE, ids ?? []).catch(() => {})
}

/** 清除勾选。 */
export async function clearCurrentSelection(): Promise<void> {
  setCurrentSelection(undefined)
  await clearSelection(GROK_SELECTION_SCOPE).catch(() => {})
}

/**
 * 按勾选过滤模型清单。
 *
 * 用户没勾过（`undefined`）→ 原样返回（默认那一份全都在）；
 * 勾过 → 只留勾中的那几个。
 *
 * 勾了一个都不剩 → 当作没勾过，清单照旧。一条模型行挂零个模型是最坏的状态：
 * 当前型号从目录里消失，输入框里的强度轴跟着消失，宿主把那次选择退回去并报错。
 * 想停用这一行，把行从 profile 里摘掉，而不是把模型全勾没了。
 *
 * @param models - 整份模型清单。
 * @param selection - 勾选；`undefined` 表示没勾过。
 * @returns 过滤后的清单。
 */
export function applySelection<T extends { readonly id: string }>(
  models: readonly T[],
  selection: readonly string[] | undefined = current,
): readonly T[] {
  if (selection === undefined) return models
  if (selection.length === 0) return models
  const wanted = new Set(selection)
  return models.filter(model => wanted.has(model.id))
}
