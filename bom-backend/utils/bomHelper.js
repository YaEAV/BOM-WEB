// bom-backend/utils/bomHelper.js (已修复)
const db = require('../config/db');

/**
 * 构建一个单层的BOM树 (这是一个内部辅助函数)
 * @param {Array} lines - 从数据库查询出的扁平BOM行数组。
 * @returns {Array} - 一个包含根节点的、具有层级结构的数组。
 */
const buildSingleLevelBomTree = (lines) => {
    const tree = [];
    const map = new Map();

    for (const line of lines) {
        map.set(line.id, { ...line });
    }

    for (const line of lines) {
        const node = map.get(line.id);
        if (line.parent_line_id && map.has(line.parent_line_id)) {
            const parentNode = map.get(line.parent_line_id);
            if (parentNode) {
                if (!parentNode.children) {
                    parentNode.children = [];
                }
                parentNode.children.push(node);
            }
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
 * @param {string} [parentKey='root'] - (新增) 父节点的唯一键，用于生成当前节点的唯一键。
 * @returns {Promise<Array>} - 一个包含完整、嵌套层级结构的BOM树数组。
 */
async function getFullBomTree(versionId, db, prefix = '', currentLevel = 1, parentKey = 'root') {
    const query = `
        SELECT
            bl.*,
            m.material_code as component_code,
            m.name as component_name,
            m.spec as component_spec,
            m.unit as component_unit
        FROM bom_lines bl
                 JOIN materials m ON bl.component_id = m.id
        WHERE bl.version_id = ? AND bl.deleted_at IS NULL
        ORDER BY LENGTH(bl.position_code), bl.position_code ASC`;
    const [lines] = await db.query(query, [versionId]);

    if (lines.length === 0) {
        return [];
    }

    const tree = buildSingleLevelBomTree(lines);

    for (const node of tree) {
        // --- 核心修改：为每个节点生成一个在整个树中唯一的 key ---
        node.key = `${parentKey}-${node.id}`;

        node.level = currentLevel;
        node.display_position_code = prefix ? `${prefix}.${node.position_code}` : node.position_code;

        const [[activeSubVersion]] = await db.query(
            'SELECT id, version_code FROM bom_versions WHERE material_id = ? AND is_active = true AND deleted_at IS NULL LIMIT 1',
            [node.component_id]
        );

        if (activeSubVersion) {
            node.bom_version = activeSubVersion.version_code.split('_V').pop() || '';
            const subTree = await getFullBomTree(
                activeSubVersion.id,
                db,
                node.display_position_code,
                currentLevel + 1,
                node.key // <-- 将当前节点的key作为父key传入递归
            );
            if (subTree.length > 0) {
                if (!node.children) {
                    node.children = [];
                }
                node.children.push(...subTree);
            }
        }
    }

    return tree;
}


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