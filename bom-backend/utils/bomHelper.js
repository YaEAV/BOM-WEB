// bom-backend/utils/bomHelper.js (新增文件)

async function getBomTreeNodes(db, parentMaterialId, specificVersionId, currentLevel, pathPrefix, allActiveVersions) {
    let versionToFetch = specificVersionId;
    if (parentMaterialId && !specificVersionId) {
        versionToFetch = allActiveVersions.get(parentMaterialId);
    }

    if (!versionToFetch) return [];

    const query = `
        SELECT bl.*, m.material_code as component_code, m.name as component_name, m.spec as component_spec, m.unit as component_unit
        FROM bom_lines bl JOIN materials m ON bl.component_id = m.id
        WHERE bl.version_id = ?
        ORDER BY LENGTH(bl.position_code), bl.position_code ASC`;

    const [lines] = await db.query(query, [versionToFetch]);

    for (const line of lines) {
        line.display_position_code = pathPrefix ? `${pathPrefix}.${line.position_code}` : `${line.position_code}`;
        line.level = currentLevel;
        line.component_active_version_id = allActiveVersions.get(line.component_id) || null;
        const children = await getBomTreeNodes(db, line.component_id, null, currentLevel + 1, line.display_position_code, allActiveVersions);
        if (children && children.length > 0) {
            line.children = children;
        }
    }
    return lines;
};

function flattenTreeForExport(nodes) {
    const result = [];
    const traverse = (items) => {
        if (!items) return;
        for (const item of items) {
            result.push(item);
            if (item.children && item.children.length > 0) {
                traverse(item.children);
            }
        }
    };
    traverse(nodes);
    return result;
};

module.exports = { getBomTreeNodes, flattenTreeForExport };