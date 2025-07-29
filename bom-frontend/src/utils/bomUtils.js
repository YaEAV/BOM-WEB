// src/utils/bomUtils.js (新增智能删除的辅助函数)

/**
 * 遍历BOM树，找到所有可展开的行的key
 * @param {Array} bomLines - BOM行数据
 * @returns {Array} - 所有有子节点的行的key
 */
export const getAllExpandableKeys = (bomLines) => {
    let keys = [];
    bomLines.forEach(line => {
        if (line.children && line.children.length > 0) {
            keys.push(line.key);
            keys = keys.concat(getAllExpandableKeys(line.children));
        }
    });
    return keys;
};

/**
 * 根据key在BOM树中查找对应的行数据
 * @param {Array} bomLines - BOM行数据
 * @param {String} key - 要查找的key
 * @returns {Object|null} - 找到的行数据或null
 */
export const findLineByKey = (bomLines, key) => {
    for (const line of bomLines) {
        if (line.key === key) {
            return line;
        }
        if (line.children) {
            const found = findLineByKey(line.children, key);
            if (found) {
                return found;
            }
        }
    }
    return null;
};

/**
 * 【新增函数】
 * 在BOM树中查找指定key的“前一个”兄弟节点或父节点的key。
 * 这是为了实现删除后能选中上一行的功能。
 * @param {Array} lines - 当前的BOM行数据树
 * @param {String} key - 被删除的行的key
 * @returns {String|null} - 应该被选中的新key，或null
 */
export const findPrecedingKey = (lines, key) => {
    let result = null;

    function search(items, parentKey = null) {
        for (let i = 0; i < items.length; i++) {
            const currentItem = items[i];

            if (currentItem.key === key) {
                // 找到了要删除的节点
                if (i > 0) {
                    // 如果不是第一个子节点，则选中它的前一个兄弟节点
                    result = items[i - 1].key;
                } else {
                    // 如果是第一个子节点，则选中它的父节点
                    result = parentKey;
                }
                return true; // 停止搜索
            }

            if (currentItem.children) {
                // 递归搜索子节点
                if (search(currentItem.children, currentItem.key)) {
                    return true; // 已找到，停止所有递归
                }
            }
        }
        return false; // 在当前层级未找到
    }

    search(lines);
    return result;
};