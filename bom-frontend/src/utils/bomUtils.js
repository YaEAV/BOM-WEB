/**
 * 递归地获取一个BOM树中所有包含子节点的、可展开节点的唯一键(key)。
 * @param {Array} nodes - BOM树的节点数组。
 * @returns {Array<string>} - 包含所有可展开节点key的字符串数组。
 */
export const getAllExpandableKeys = (nodes) => {
    let keys = [];
    if (!Array.isArray(nodes)) {
        return keys;
    }

    for (const node of nodes) {
        if (node && node.children && node.children.length > 0) {
            keys.push(node.key);
            // 递归地将子树中可展开的key也合并进来
            const childKeys = getAllExpandableKeys(node.children);
            keys = keys.concat(childKeys);
        }
    }
    return keys;
};

/**
 * 在BOM树中根据其唯一键(key)递归地查找并返回对应的节点对象。
 * @param {Array} lines - BOM树的节点数组。
 * @param {string} key - 要查找的节点的唯一键。
 * @returns {object|null} - 如果找到，则返回节点对象；否则返回null。
 */
export const findLineByKey = (lines, key) => {
    if (!Array.isArray(lines) || !key) {
        return null;
    }

    for (const line of lines) {
        if (line && line.key === key) {
            return line;
        }
        if (line && line.children) {
            const found = findLineByKey(line.children, key);
            if (found) {
                return found;
            }
        }
    }
    return null;
};