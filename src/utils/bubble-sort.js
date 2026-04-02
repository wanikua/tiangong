/**
 * 🏮 天工开物 · 冒泡排序
 *
 * 冒泡排序（Bubble Sort）
 * ─────────────────────────────────────────────
 * 原理：反复比较相邻元素，若顺序错误则交换，
 *       每轮将最大（或最小）值"冒泡"至末端。
 *
 * 复杂度：
 *   - 最佳：O(n)   — 已排序，早退优化生效
 *   - 平均：O(n²)
 *   - 最差：O(n²)
 * 空间：O(1)  原地排序
 * 稳定：✅ 稳定排序（相等元素不交换）
 */

/**
 * 冒泡排序
 *
 * @param {Array} arr           - 待排序数组（函数会返回新数组，不修改原数组）
 * @param {Object} [options={}] - 配置项
 * @param {'asc'|'desc'} [options.order='asc']       - 排序方向：升序 'asc' / 降序 'desc'
 * @param {Function} [options.comparator]             - 自定义比较器 (a, b) => number
 *                                                      返回值 < 0：a 排在 b 前
 *                                                      返回值 > 0：b 排在 a 前
 *                                                      返回值 = 0：顺序不变
 * @returns {Array} 排序后的新数组
 *
 * @throws {TypeError} 若 arr 不是数组
 * @throws {TypeError} 若 comparator 不是函数（当提供时）
 *
 * @example
 * // 基础升序
 * bubbleSort([3, 1, 4, 1, 5, 9]);
 * // => [1, 1, 3, 4, 5, 9]
 *
 * @example
 * // 降序
 * bubbleSort([3, 1, 4], { order: 'desc' });
 * // => [4, 3, 1]
 *
 * @example
 * // 自定义比较器：按字符串长度升序
 * bubbleSort(['banana', 'fig', 'apple'], {
 *   comparator: (a, b) => a.length - b.length
 * });
 * // => ['fig', 'apple', 'banana']
 */
function bubbleSort(arr, options = {}) {
  // ── 防御性校验 ──────────────────────────────
  if (!Array.isArray(arr)) {
    throw new TypeError(`[bubbleSort] 期望传入数组，实际收到: ${typeof arr}`);
  }

  const { order = 'asc', comparator } = options;

  if (comparator !== undefined && typeof comparator !== 'function') {
    throw new TypeError(`[bubbleSort] comparator 必须是函数，实际收到: ${typeof comparator}`);
  }

  // ── 边界：空数组或单元素，直接返回 ──────────
  if (arr.length <= 1) {
    return [...arr];
  }

  // ── 构建最终比较函数 ─────────────────────────
  // 优先使用自定义比较器；否则用默认比较逻辑
  const compare = comparator
    ? comparator
    : (a, b) => {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
      };

  // 升序：compare(a, b) > 0 时交换（a 比 b 大，需把 b 往前挪）
  // 降序：compare(a, b) < 0 时交换（a 比 b 小，需把 b 往前挪）
  const shouldSwap = (a, b) =>
    order === 'desc' ? compare(a, b) < 0 : compare(a, b) > 0;

  // ── 拷贝原数组，不污染入参 ──────────────────
  const result = [...arr];
  const n = result.length;

  // ── 核心排序逻辑（含早退优化）───────────────
  for (let i = 0; i < n - 1; i++) {
    let swapped = false; // 早退标志：本轮若无交换，说明已排好

    // 每轮结束后，末尾 i 个元素已就位，无需再比
    for (let j = 0; j < n - 1 - i; j++) {
      if (shouldSwap(result[j], result[j + 1])) {
        // ES6 解构交换，优雅且无需临时变量
        [result[j], result[j + 1]] = [result[j + 1], result[j]];
        swapped = true;
      }
    }

    // 🚀 早退优化：本轮没有任何交换 → 已完全有序
    if (!swapped) break;
  }

  return result;
}

module.exports = { bubbleSort };
