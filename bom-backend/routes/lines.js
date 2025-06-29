const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 其他路由保持不变 ---
const getBomTreeNodes = async (parentMaterialId, specificVersionId, currentLevel, pathPrefix) => {
    let versionToFetch = specificVersionId;
    if (parentMaterialId && !specificVersionId) {
        const [activeVersions] = await db.query('SELECT id FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1', [parentMaterialId]);
        if (activeVersions.length === 0) return [];
        versionToFetch = activeVersions[0].id;
    }
    if (!versionToFetch) return [];
    const query = `
        SELECT bl.*, m.material_code as component_code, m.name as component_name, m.spec as component_spec
        FROM bom_lines bl JOIN materials m ON bl.component_id = m.id
        WHERE bl.version_id = ?
        ORDER BY LENGTH(bl.position_code), bl.position_code ASC`;
    const [lines] = await db.query(query, [versionToFetch]);
    for (const line of lines) {
        line.display_position_code = pathPrefix ? `${pathPrefix}.${line.position_code}` : `${line.position_code}`;
        line.level = currentLevel;
        const [componentActiveVersions] = await db.query('SELECT id FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1', [line.component_id]);
        line.component_active_version_id = componentActiveVersions.length > 0 ? componentActiveVersions[0].id : null;
        const children = await getBomTreeNodes(line.component_id, null, currentLevel + 1, line.display_position_code);
        if (children && children.length > 0) line.children = children;
    }
    return lines;
};
router.get('/version/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;
        const bomTree = await getBomTreeNodes(null, versionId, 1, "");
        res.json(bomTree);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/', async (req, res) => {
    try {
        const { version_id, parent_line_id, component_id, quantity, process_info, remark, position_code } = req.body;
        if (!position_code || position_code.trim() === '') {
            return res.status(400).json({ error: '必须提供位置编号。' });
        }
        let level = 1;
        if (parent_line_id) {
            const [parentLines] = await db.query('SELECT level FROM bom_lines WHERE id = ?', [parent_line_id]);
            if (parentLines.length === 0) throw new Error('父BOM行不存在。');
            level = parentLines[0].level + 1;
        }
        const query = `INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const [result] = await db.query(query, [version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark]);
        res.status(201).json({ id: result.insertId, ...req.body });
    } catch (err) {
        res.status(500).json({ error: `操作失败: ${err.message}` });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { component_id, quantity, process_info, remark, position_code } = req.body;
        if (!position_code || position_code.trim() === '') {
            return res.status(400).json({ error: '必须提供位置编号。' });
        }
        const query = `UPDATE bom_lines SET component_id = ?, quantity = ?, process_info = ?, remark = ?, position_code = ? WHERE id = ?`;
        await db.query(query, [component_id, quantity, process_info, remark, position_code, id]);
        res.json({ message: 'BOM行更新成功' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [[{ count }]] = await db.query('SELECT COUNT(*) as count FROM bom_lines WHERE parent_line_id = ?', [id]);
        if (count > 0) {
            return res.status(400).json({ error: '删除失败：请先删除此行下的所有子项。' });
        }
        await db.query('DELETE FROM bom_lines WHERE id = ?', [id]);
        res.json({ message: 'BOM行删除成功。' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
const flattenTreeForExport = (nodes) => { /* ... */ };
router.get('/export/:versionId', async (req, res) => { /* ... */ });
router.get('/template', (req, res) => { /* ... */ });


// --- 核心修复：BOM导入路由 (最终版：智能创建BOM版本并修复层级) ---
router.post('/import/:versionId', upload.single('file'), async (req, res) => {
    const { versionId } = req.params;
    if (!req.file) {
        return res.status(400).json({ message: '未上传文件。' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [versionId]);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) throw new Error('在Excel文件中找不到工作表。');

        const rows = [];
        const getCellValue = (cell) => (cell.value && typeof cell.value === 'object' && cell.value.result !== undefined) ? cell.value.result : cell.value;

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const rowData = {
                    level: getCellValue(row.getCell(1)),
                    display_position_code: getCellValue(row.getCell(2))?.toString()?.trim() || '',
                    component_code: getCellValue(row.getCell(3))?.toString()?.trim(),
                    quantity: getCellValue(row.getCell(7)),
                    process_info: getCellValue(row.getCell(8)),
                };
                if (rowData.display_position_code && rowData.component_code) {
                    rows.push(rowData);
                }
            }
        });

        // 建立一个物料编码到ID的缓存，以及一个BOM版本缓存
        const materialCache = new Map();
        const versionCache = new Map();

        // 预加载所有涉及的物料和版本信息
        const allComponentCodes = [...new Set(rows.map(r => r.component_code))];
        if (allComponentCodes.length > 0) {
            const [materialRows] = await connection.query('SELECT id, material_code, name FROM materials WHERE material_code IN (?)', [allComponentCodes]);
            for (const mat of materialRows) {
                materialCache.set(mat.material_code, { id: mat.id, name: mat.name });
            }
        }

        // 健壮的父子关系建立与插入
        const positionToIdMap = new Map();
        let importedCount = 0;

        for (const row of rows) {
            const material = materialCache.get(row.component_code);
            if (!material) {
                throw new Error(`物料编码 "${row.component_code}" 在数据库中不存在，请先创建。`);
            }

            const pathParts = row.display_position_code.split('.');
            const position_code = pathParts[pathParts.length - 1];
            let parent_line_id = null;
            let current_version_id = versionId; // 默认是主BOM的版本

            // 如果不是顶级物料，则需要查找其父项
            if (pathParts.length > 1) {
                const parent_path = pathParts.slice(0, -1).join('.');
                const parentInfo = positionToIdMap.get(parent_path);

                if (parentInfo) {
                    // 检查父物料是否已有BOM版本
                    let parentVersionId = versionCache.get(parentInfo.material_id);
                    if (!parentVersionId) {
                        const [versions] = await connection.query('SELECT id FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1', [parentInfo.material_id]);
                        if (versions.length > 0) {
                            parentVersionId = versions[0].id;
                        } else {
                            // 如果没有，自动创建一个
                            const new_version_code = `${parentInfo.material_code}_V1.0_Auto`;
                            const [newVersionResult] = await connection.query('INSERT INTO bom_versions (material_id, version_code, remark, is_active) VALUES (?, ?, ?, true)', [parentInfo.material_id, new_version_code, '自动创建于BOM导入']);
                            parentVersionId = newVersionResult.insertId;
                        }
                        versionCache.set(parentInfo.material_id, parentVersionId);
                    }
                    current_version_id = parentVersionId;
                    parent_line_id = parentInfo.line_id;
                }
            }

            const query = `INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await connection.query(query, [current_version_id, parent_line_id, row.level, position_code, material.id, row.quantity, row.process_info, '']);

            // 缓存当前行的信息，以便其子项可以找到它
            positionToIdMap.set(row.display_position_code, { line_id: result.insertId, material_id: material.id, material_code: row.component_code });
            importedCount++;
        }

        await connection.commit();
        res.status(201).json({ message: `成功导入 ${importedCount} 条BOM行。` });

    } catch (err) {
        await connection.rollback();
        console.error('BOM导入失败:', err);
        res.status(500).json({ error: `导入失败: ${err.message}` });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;