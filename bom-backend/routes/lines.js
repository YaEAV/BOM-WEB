const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const getBomTreeNodes = async (parentMaterialId, specificVersionId, currentLevel, pathPrefix, allActiveVersions) => {
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
        // 2. 只有在有子项时才添加 children 属性
        const children = await getBomTreeNodes(line.component_id, null, currentLevel + 1, line.display_position_code, allActiveVersions);
        if (children && children.length > 0) {
            line.children = children;
        }
    }
    return lines;
};


// --- Helper function to flatten the BOM tree for Excel export ---
const flattenTreeForExport = (nodes) => {
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


router.get('/version/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;

        // 预加载所有物料的激活版本
        const [allVersions] = await db.query('SELECT id, material_id FROM bom_versions WHERE is_active = true');
        const allActiveVersions = new Map(allVersions.map(v => [v.material_id, v.id]));

        const bomTree = await getBomTreeNodes(null, versionId, 1, "", allActiveVersions);
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

// --- MODIFICATION: Updated Excel Export Route ---
// MODIFICATION: Updated Excel Export Route with Grouping
router.get('/export/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;
        const [versionInfo] = await db.query('SELECT version_code FROM bom_versions WHERE id = ?', [versionId]);
        if (versionInfo.length === 0) {
            return res.status(404).json({ message: 'BOM version not found.' });
        }
        const versionCode = versionInfo[0].version_code;

        // 1. 获取树形结构的BOM数据
        const [allVersions] = await db.query('SELECT id, material_id FROM bom_versions WHERE is_active = true');
        const allActiveVersions = new Map(allVersions.map(v => [v.material_id, v.id]));
        const treeData = await getBomTreeNodes(null, versionId, 1, "", allActiveVersions);

        if (treeData.length === 0) {
            return res.status(404).json({ message: '此版本下没有BOM数据可供导出。' });
        }

        // 2. 将树形数据扁平化，以便逐行写入
        const flatData = flattenTreeForExport(treeData);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`BOM - ${versionCode}`);

        // 3. 设置工作表的视图属性，以默认显示大纲（分组）按钮
        worksheet.views = [
            {
                showOutlineSymbols: true, // 确保显示 +/- 按钮
                outlineState: 'visible'
            }
        ];

        // 4. 定义列头
        worksheet.columns = [
            { header: '层级', key: 'level', width: 10 },
            { header: '位置编号', key: 'display_position_code', width: 20 },
            { header: '子件编码', key: 'component_code', width: 25 },
            { header: '子件名称', key: 'component_name', width: 30 },
            { header: '规格', key: 'component_spec', width: 30 },
            { header: '用量', key: 'quantity', width: 15 },
            { header: '单位', key: 'component_unit', width: 15 },
            { header: '工艺说明', key: 'process_info', width: 30 },
        ];
        worksheet.getRow(1).font = { bold: true };

        // 5. 逐行添加数据，并设置每行的大纲级别
        flatData.forEach(item => {
            const row = worksheet.addRow(item);
            // Excel的大纲级别从0开始，而我们的BOM层级从1开始
            // 所以将BOM层级减1作为大纲级别
            if (item.level > 1) {
                row.outlineLevel = item.level - 1;
            }
        });

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

router.get('/template', (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOM导入模板');
    const headers = [
        { header: '层级', key: 'level', width: 10 },
        { header: '位置编号', key: 'display_position_code', width: 15 },
        { header: '子件编码', key: 'component_code', width: 20 },
        { header: '子件名称（仅供参考）', key: 'component_name', width: 30 },
        { header: '规格描述（仅供参考）', key: 'component_spec', width: 40 },
        { header: '单位（仅供参考）', key: 'component_unit', width: 15 },
        { header: '用量', key: 'quantity', width: 10 },
        { header: '工艺说明', key: 'process_info', width: 30 }
    ];
    worksheet.columns = headers;
    worksheet.getRow(1).font = { bold: true };
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
        'Content-Disposition',
        'attachment; filename=bom_import_template_with_unit.xlsx'
    );
    workbook.xlsx.write(res).then(() => {
        res.end();
    });
});

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
        const materialCache = new Map();
        const versionCache = new Map();
        const allComponentCodes = [...new Set(rows.map(r => r.component_code))];
        if (allComponentCodes.length > 0) {
            const [materialRows] = await connection.query('SELECT id, material_code, name FROM materials WHERE material_code IN (?)', [allComponentCodes]);
            for (const mat of materialRows) {
                materialCache.set(mat.material_code, { id: mat.id, name: mat.name });
            }
        }
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
            let current_version_id = versionId;
            if (pathParts.length > 1) {
                const parent_path = pathParts.slice(0, -1).join('.');
                const parentInfo = positionToIdMap.get(parent_path);
                if (parentInfo) {
                    let parentVersionId = versionCache.get(parentInfo.material_id);
                    if (!parentVersionId) {
                        const [versions] = await connection.query('SELECT id FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1', [parentInfo.material_id]);
                        if (versions.length > 0) {
                            parentVersionId = versions[0].id;
                        } else {
                            const new_version_code = `${parentInfo.material_code}_V1.0`;
                            const [newVersionResult] = await connection.query('INSERT INTO bom_versions (material_id, version_code, remark, is_active) VALUES (?, ?, ?, true)', [parentInfo.material_id, new_version_code, 'BOM导入时自动创建']);
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