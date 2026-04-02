/**
 * 🏮 天工开物 · 冒泡排序 · 单元测试
 */

const { bubbleSort } = require('./bubble-sort');

// ══════════════════════════════════════════════
// 分组一：基础功能
// ══════════════════════════════════════════════
describe('bubbleSort — 基础功能', () => {
  test('升序排列普通数字数组', () => {
    expect(bubbleSort([3, 1, 4, 1, 5, 9, 2, 6])).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
  });

  test('降序排列数字数组', () => {
    expect(bubbleSort([3, 1, 4, 1, 5], { order: 'desc' })).toEqual([5, 4, 3, 1, 1]);
  });

  test('已升序排列的数组保持不变', () => {
    expect(bubbleSort([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });

  test('已降序排列的数组，升序后正确', () => {
    expect(bubbleSort([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]);
  });

  test('包含负数的数组', () => {
    expect(bubbleSort([-3, 0, -1, 2, -5])).toEqual([-5, -3, -1, 0, 2]);
  });

  test('包含浮点数', () => {
    expect(bubbleSort([3.14, 1.41, 2.71])).toEqual([1.41, 2.71, 3.14]);
  });

  test('所有元素相同', () => {
    expect(bubbleSort([7, 7, 7, 7])).toEqual([7, 7, 7, 7]);
  });
});

// ══════════════════════════════════════════════
// 分组二：边界条件
// ══════════════════════════════════════════════
describe('bubbleSort — 边界条件', () => {
  test('空数组返回空数组', () => {
    expect(bubbleSort([])).toEqual([]);
  });

  test('单元素数组原样返回', () => {
    expect(bubbleSort([42])).toEqual([42]);
  });

  test('不修改原始数组（无副作用）', () => {
    const original = [3, 1, 2];
    const sorted = bubbleSort(original);
    expect(original).toEqual([3, 1, 2]); // 原数组未变
    expect(sorted).toEqual([1, 2, 3]);   // 返回新数组
  });
});

// ══════════════════════════════════════════════
// 分组三：自定义比较器
// ══════════════════════════════════════════════
describe('bubbleSort — 自定义 comparator', () => {
  test('按字符串长度升序', () => {
    const result = bubbleSort(['banana', 'fig', 'apple', 'kiwi'], {
      comparator: (a, b) => a.length - b.length,
    });
    expect(result).toEqual(['fig', 'kiwi', 'apple', 'banana']);
  });

  test('对象数组按 age 字段升序', () => {
    const people = [
      { name: '张三', age: 30 },
      { name: '李四', age: 25 },
      { name: '王五', age: 35 },
    ];
    const sorted = bubbleSort(people, {
      comparator: (a, b) => a.age - b.age,
    });
    expect(sorted.map((p) => p.name)).toEqual(['李四', '张三', '王五']);
  });

  test('comparator 配合 order: desc 一起使用（长度降序）', () => {
    // comparator 定义"长度"为比较维度，order:desc 控制方向
    // 结果：按字符串长度降序 banana(6) > apple(5) > fig(3)
    const result = bubbleSort(['fig', 'apple', 'banana'], {
      order: 'desc',
      comparator: (a, b) => a.length - b.length,
    });
    expect(result).toEqual(['banana', 'apple', 'fig']);
  });
});

// ══════════════════════════════════════════════
// 分组四：稳定性验证
// ══════════════════════════════════════════════
describe('bubbleSort — 稳定性', () => {
  test('相等元素保持原始相对顺序', () => {
    // 用对象区分相等值的身份
    const a = { val: 1, id: 'a' };
    const b = { val: 1, id: 'b' };
    const c = { val: 1, id: 'c' };
    const result = bubbleSort([c, a, b], {
      comparator: (x, y) => x.val - y.val,
    });
    expect(result.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

// ══════════════════════════════════════════════
// 分组五：异常处理
// ══════════════════════════════════════════════
describe('bubbleSort — 异常处理', () => {
  test('传入非数组时抛出 TypeError', () => {
    expect(() => bubbleSort('not an array')).toThrow(TypeError);
    expect(() => bubbleSort(123)).toThrow(TypeError);
    expect(() => bubbleSort(null)).toThrow(TypeError);
    expect(() => bubbleSort(undefined)).toThrow(TypeError);
  });

  test('传入非函数 comparator 时抛出 TypeError', () => {
    expect(() => bubbleSort([1, 2], { comparator: 'not a function' })).toThrow(TypeError);
  });

  test('错误信息包含有用提示', () => {
    expect(() => bubbleSort('oops')).toThrow('[bubbleSort] 期望传入数组');
  });
});

// ══════════════════════════════════════════════
// 分组六：性能 · 早退优化验证
// ══════════════════════════════════════════════
describe('bubbleSort — 早退优化', () => {
  test('已排序的大数组能在合理时间内完成（O(n) 早退）', () => {
    const size = 100_000;
    const sorted = Array.from({ length: size }, (_, i) => i);
    const start = Date.now();
    bubbleSort(sorted);
    const elapsed = Date.now() - start;
    // 已排序数组只需一轮扫描，100k 元素应 < 500ms
    expect(elapsed).toBeLessThan(500);
  });
});
