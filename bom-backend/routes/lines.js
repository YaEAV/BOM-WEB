const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ... (GET, POST, PUT, DELETE 路由保持不变, 此处为简洁省略) ...
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
        console.error(err);
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
        console.error('新增BOM行失败:', err);
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
        console.error('更新BOM行失败:', err);
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


// --- 核心修复：统一所有Excel操作的列顺序 ---

// 统一定义列头
const excelColumns = [
    { header: '层级', key: 'level', width: 10 },
    { header: '位置编号', key: 'display_position_code', width: 20 },
    { header: '子件编码', key: 'component_code', width: 25 },
    { header: '子件名称', key: 'component_name', width: 30 },
    { header: '规格', key: 'component_spec', width: 30 },
    { header: 'BOM版本 (仅后缀)', key: 'bom_version_suffix', width: 20 },
    { header: '用量', key: 'quantity', width: 15 },
    { header: '工艺说明', key: 'process_info', width: 30 },
];

// 修复后的下载模板路由
router.get('/template', (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOM导入模板');
    worksheet.columns = excelColumns;
    worksheet.addRow([1, '1', 'SUB-ASSY-01', '某个子组件', '规格描述1', '1.0', 2, '']);
    worksheet.addRow([2, '1.1', 'PART-001', '零件1', '规格描述2', '', 5, '先安装']);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=bom_import_template.xlsx');
    workbook.xlsx.write(res).then(() => res.end());
});

// 修复后的Excel导出辅助函数
const flattenTreeForExport = (nodes) => {
    const flatList = [];
    function recurse(nodes, level) {
        for (const node of nodes) {
            flatList.push({
                level: level,
                display_position_code: node.display_position_code,
                component_code: node.component_code,
                component_name: node.component_name,
                component_spec: node.component_spec,
                bom_version_suffix: '', // 导出时此列可为空
                quantity: node.quantity,
                process_info: node.process_info,
            });
            if (node.children && node.children.length > 0) {
                recurse(node.children, level + 1);
            }
        }
    }
    recurse(nodes, 1);
    return flatList;
};

// 修复后的Excel导出路由
router.get('/export/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;
        const [versionInfo] = await db.query('SELECT version_code FROM bom_versions WHERE id = ?', [versionId]);
        if (versionInfo.length === 0) return res.status(404).json({ message: 'BOM version not found.' });

        const treeData = await getBomTreeNodes(null, versionId, 1, "");
        if (treeData.length === 0) return res.status(404).json({ message: '此版本下没有BOM数据可供导出。' });

        const flatData = flattenTreeForExport(treeData);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`BOM - ${versionInfo[0].version_code}`);
        worksheet.columns = excelColumns;
        worksheet.addRows(flatData);

        const fileName = `BOM_${versionInfo[0].version_code}_${Date.now()}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("Export failed:", err);
        res.status(500).json({ error: '导出Excel文件失败。' });
    }
});

// 修复后的BOM导入路由
router.post('/import/:versionId', upload.single('file'), async (req, res) => {
    const { versionId } = req.params;
    if (!req.file) return res.status(400).json({ message: '未上传文件。' });

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [versionId]);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) throw new Error('在Excel文件中找不到工作表。');

        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const rowData = {
                    level: row.getCell(1).value,
                    display_position_code: row.getCell(2).value?.toString()?.trim() || '',
                    component_code: row.getCell(3).value?.toString()?.trim(),
                    bom_version_suffix: row.getCell(6).value?.toString()?.trim(), // 修复：从第6列读取
                    quantity: row.getCell(7).value, // 修复：从第7列读取
                    process_info: row.getCell(8).value, // 修复：从第8列读取
                };
                if (rowData.display_position_code && rowData.component_code) {
                    rows.push(rowData);
                }
            }
        });

        const positionMap = new Map();
        for (const row of rows) {
            const [[material]] = await connection.query('SELECT id FROM materials WHERE material_code = ?', [row.component_code]);
            if (!material) throw new Error(`物料编码 "${row.component_code}" 不存在。`);

            const pathParts = row.display_position_code.split('.');
            const position_code = pathParts[pathParts.length - 1];
            let parent_line_id = null;
            let current_version_id = versionId;

            if (row.level > 1) {
                const parent_path = pathParts.slice(0, -1).join('.');
                const parentInfo = positionMap.get(parent_path);
                if (!parentInfo) throw new Error(`数据错误：找不到父项 "${parent_path}"。`);
                parent_line_id = parentInfo.line_id;
                current_version_id = parentInfo.version_id;
            }

            let next_version_id_for_children = current_version_id;
            if (row.bom_version_suffix) {
                const full_version_code = `${row.component_code}_V${row.bom_version_suffix}`;
                const [existingVersions] = await connection.query('SELECT id FROM bom_versions WHERE material_id = ? AND version_code = ?', [material.id, full_version_code]);
                if (existingVersions.length > 0) {
                    next_version_id_for_children = existingVersions[0].id;
                } else {
                    const [newVersionResult] = await connection.query('INSERT INTO bom_versions (material_id, version_code, is_active, remark) VALUES (?, ?, ?, ?)', [material.id, full_version_code, true, '由BOM导入自动创建']);
                    next_version_id_for_children = newVersionResult.insertId;
                    await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ? AND id != ?', [material.id, next_version_id_for_children]);
                }
            }

            const query = `INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await connection.query(query, [current_version_id, parent_line_id, row.level, position_code, material.id, row.quantity, row.process_info, '']);
            positionMap.set(row.display_position_code, { line_id: result.insertId, version_id: next_version_id_for_children });
        }

        await connection.commit();
        res.status(201).json({ message: `成功导入 ${rows.length} 条BOM行。` });
    } catch (err) {
        await connection.rollback();
        console.error('BOM导入失败:', err);
        res.status(500).json({ error: `导入失败: ${err.message}` });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;