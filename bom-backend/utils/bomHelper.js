// bom-backend/utils/bomHelper.js (最终修正版 - 按需生成children)

/**
 * 构建一个单层的BOM树 (这是一个内部辅助函数)
 * @param {Array} lines - 从数据库查询出的扁平BOM行数组。
 * @returns {Array} - 一个包含根节点的、具有层级结构的数组。
 */
const buildSingleLevelBomTree = (lines) => {
    const tree = [];
    const map = new Map();

    // 关键修正：初始化节点时，不再无条件添加 children: []
    for (const line of lines) {
        map.set(line.id, { ...line });
    }

    for (const line of lines) {
        const node = map.get(line.id);
        if (line.parent_line_id && map.has(line.parent_line_id)) {
            const parentNode = map.get(line.parent_line_id);
            // 关键修正：只在需要时才创建 children 数组
            if (!parentNode.children) {
                parentNode.children = [];
            }
            parentNode.children.push(node);
        } else {
            tree.push(node);
        }
    }

    return tree;
};


/**
 * 递归地获取并构建完整的BOM树，能自动展开子组件的激活BOM，并计算相对层级。
 * @param {number} versionId - 要获取的顶层BOM版本ID。
 * @param {object} db - 数据库连接池。
 * @param {string} [prefix=''] - 用于生成显示位置编号的前缀。
 * @param {number} [currentLevel=1] - 当前的相对层级。
 * @returns {Promise<Array>} - 一个包含完整、嵌套层级结构的BOM树数组。
 */
async function getFullBomTree(versionId, db, prefix = '', currentLevel = 1) {
    const query = `
        SELECT
            bl.*,
            m.material_code as component_code,
            m.name as component_name,
            m.spec as component_spec,
            m.unit as component_unit
        FROM bom_lines bl
        JOIN materials m ON bl.component_id = m.id
        WHERE bl.version_id = ?
        ORDER BY bl.position_code ASC`;
    const [lines] = await db.query(query, [versionId]);

    if (lines.length === 0) {
        return [];
    }

    const tree = buildSingleLevelBomTree(lines);

    for (const node of tree) {
        node.level = currentLevel;
        node.display_position_code = prefix ? `${prefix}.${node.position_code}` : node.position_code;

        const [[activeSubVersion]] = await db.query(
            'SELECT id FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1',
            [node.component_id]
        );

        if (activeSubVersion) {
            // 递归获取子BOM，并将其赋值给 children 属性
            node.children = await getFullBomTree(
                activeSubVersion.id,
                db,
                node.display_position_code,
                currentLevel + 1
            );
        }
        // 如果 activeSubVersion 不存在，node.children 将保持为 undefined，
        // 前端就不会渲染展开图标。
    }

    return tree;
}


// 导出Excel用的扁平化函数保持不变
function flattenTreeForExport(nodes) {
    let result = [];
    for (const item of nodes) {
        const { children, ...rest } = item;
        result.push(rest);
        if (children && children.length > 0) {
            result = result.concat(flattenTreeForExport(children));
        }
    }
    return result;
};


module.exports = { getFullBomTree, flattenTreeForExport };