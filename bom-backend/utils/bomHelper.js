// bom-backend/utils/bomHelper.js (最终修正版 - 支持相对层级和递归展开)

/**
 * 构建一个单层的BOM树 (这是一个内部辅助函数)
 * @param {Array} lines - 从数据库查询出的扁平BOM行数组。
 * @returns {Array} - 一个包含根节点的、具有层级结构的数组。
 */
const buildSingleLevelBomTree = (lines) => {
    const tree = [];
    const map = new Map();

    for (const line of lines) {
        map.set(line.id, { ...line, children: [] });
    }

    for (const line of lines) {
        const node = map.get(line.id);
        if (line.parent_line_id && map.has(line.parent_line_id)) {
            // This condition is for multi-level BOMs within a single versionId
            // Which is not how we store modular BOMs, but good to have for flexibility
            map.get(line.parent_line_id).children.push(node);
        } else {
            // Only root-level items (relative to this version) get pushed to the tree
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
    // 1. 获取当前版本的所有直接子行
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

    // In our new modular design, all lines for a given version are at the same relative level.
    // The buildSingleLevelBomTree is now less critical but still useful.
    const tree = buildSingleLevelBomTree(lines);

    // 3. 遍历树，修正层级，并递归处理子节点
    for (const node of tree) {
        // VVVV --- 核心修正：覆盖数据库中的level，使用相对level --- VVVV
        node.level = currentLevel;
        node.display_position_code = prefix ? `${prefix}.${node.position_code}` : node.position_code;

        // 查找子件的激活BOM版本
        const [[activeSubVersion]] = await db.query(
            'SELECT id FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1',
            [node.component_id]
        );

        if (activeSubVersion) {
            // 如果存在激活的子BOM，则递归获取它，并传入下一层级和新的位置前缀
            node.children = await getFullBomTree(
                activeSubVersion.id,
                db,
                node.display_position_code,
                currentLevel + 1 // 传递下一层的相对level
            );
        }
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


// 最终需要暴露给 routes/lines.js 的函数
module.exports = { getFullBomTree, flattenTreeForExport };