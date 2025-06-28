const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ... (除了导入BOM的路由，其他所有路由 GET, POST, PUT, DELETE, export 等都保持不变) ...
// ... (此处为简洁省略，请保留您文件中其他路由的现有代码) ...
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
const flattenTreeForExport = (nodes) => {
    const flatList = [];
    function recurse(nodes, level) {
        for (const node of nodes) {
            flatList.push({
                level: level, display_position_code: node.display_position_code,
                component_code: node.component_code, component_name: node.component_name,
                component_spec: node.component_spec, quantity: node.quantity,
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
router.get('/export/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;
        const [versionInfo] = await db.query('SELECT version_code FROM bom_versions WHERE id = ?', [versionId]);
        if (versionInfo.length === 0) {
            return res.status(404).json({ message: 'BOM version not found.' });
        }
        const versionCode = versionInfo[0].version_code;
        const treeData = await getBomTreeNodes(null, versionId, 1, "");
        if (treeData.length === 0) {
            return res.status(404).json({ message: '此版本下没有BOM数据可供导出。' });
        }
        const flatData = flattenTreeForExport(treeData);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`BOM - ${versionCode}`);
        worksheet.columns = [
            { header: '层级', key: 'level', width: 10 },
            { header: '位置编号', key: 'display_position_code', width: 20 },
            { header: '子件编码', key: 'component_code', width: 25 },
            { header: '子件名称', key: 'component_name', width: 30 },
            { header: '规格', key: 'component_spec', width: 30 },
            { header: '用量', key: 'quantity', width: 15 },
            { header: '工艺说明', key: 'process_info', width: 30 },
        ];
        worksheet.addRows(flatData);
        const fileName = `BOM_${versionCode}_${Date.now()}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("Export failed:", err);
        res.status(500).json({ error: '导出Excel文件失败。' });
    }
});


// --- 核心修复：BOM导入路由 (采用最终的“两步导入法”) ---
router.post('/import/:versionId', upload.single('file'), async (req, res) => {
    const { versionId } = req.params;
    if (!req.file) {
        return res.status(400).json({ message: '未上传文件。' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // 步骤一：清空当前版本的旧BOM数据
        await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [versionId]);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) throw new Error('在Excel文件中找不到工作表。');

        const rows = [];
        const tempLines = [];
        let importedCount = 0;

        // 步骤二：读取所有行，并准备第一次插入
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const rowData = {
                    level: row.getCell(1).value,
                    display_position_code: row.getCell(2).value?.toString()?.trim() || '',
                    component_code: row.getCell(3).value?.toString()?.trim(),
                    quantity: row.getCell(6).value,
                    process_info: row.getCell(7).value
                };
                if (rowData.display_position_code && rowData.component_code) {
                    rows.push(rowData);
                }
            }
        });

        // 步骤三：第一次循环 - 无差别插入，只建立基础信息
        for (const row of rows) {
            const [[material]] = await connection.query('SELECT id FROM materials WHERE material_code = ?', [row.component_code]);
            if (!material) throw new Error(`物料编码 "${row.component_code}" 不存在，请先创建。`);

            const pathParts = row.display_position_code.split('.');
            const position_code = pathParts[pathParts.length - 1];

            // 暂时将 parent_line_id 设为 null
            const query = `INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await connection.query(query, [versionId, null, row.level, position_code, material.id, row.quantity, row.process_info, '']);

            // 记录新行的数据库ID和它的完整路径
            tempLines.push({ id: result.insertId, display_position_code: row.display_position_code });
            importedCount++;
        }

        // 步骤四：第二次循环 - 建立父子关系
        const positionMap = new Map();
        tempLines.forEach(line => positionMap.set(line.display_position_code, line.id));

        for (const line of tempLines) {
            if (line.display_position_code.includes('.')) {
                const pathParts = line.display_position_code.split('.');
                pathParts.pop();
                const parent_path = pathParts.join('.');
                const parent_line_id = positionMap.get(parent_path);

                if (parent_line_id) {
                    await connection.query('UPDATE bom_lines SET parent_line_id = ? WHERE id = ?', [parent_line_id, line.id]);
                } else {
                    // 如果找不到父项，说明Excel数据本身有问题
                    console.warn(`警告：找不到路径为 "${line.display_position_code}" 的父项 "${parent_path}"。该行将被作为顶层处理。`);
                }
            }
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