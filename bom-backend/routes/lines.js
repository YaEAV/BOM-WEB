const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');

// Helper function to build a tree from a flat list
const buildTree = (lines) => {
    const map = {};
    const roots = [];

    // First pass: create a map of all nodes by their ID
    lines.forEach(line => {
        map[line.id] = { ...line, children: [] };
    });

    // Second pass: build the tree structure
    lines.forEach(line => {
        const node = map[line.id];
        if (line.parent_line_id && map[line.parent_line_id]) {
            // It's a child node
            map[line.parent_line_id].children.push(node);
        } else {
            // It's a root node
            roots.push(node);
        }
    });
    return roots;
};

// GET: 获取指定BOM版本的层级结构的行项目 (这是需要替换的部分)
router.get('/version/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;

        const getBomTreeNodes = async (parentMaterialId, specificVersionId, currentLevel) => {
            let versionToFetch = specificVersionId;

            if (parentMaterialId && !specificVersionId) {
                const [activeVersions] = await db.query(
                    'SELECT id FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1',
                    [parentMaterialId]
                );
                if (activeVersions.length === 0) return [];
                versionToFetch = activeVersions[0].id;
            }

            if (!versionToFetch) return [];

            const query = `
                SELECT
                    bl.*,
                    m.material_code as component_code,
                    m.name as component_name,
                    m.spec as component_spec
                FROM bom_lines bl
                         JOIN materials m ON bl.component_id = m.id
                WHERE bl.version_id = ?
                ORDER BY bl.position_code`;
            const [lines] = await db.query(query, [versionToFetch]);

            for (const line of lines) {
                line.level = currentLevel;

                // --- 新增逻辑 ---
                // 检查当前子件是否有激活的BOM版本，并将ID附加到行数据上
                const [componentActiveVersions] = await db.query(
                    'SELECT id FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1',
                    [line.component_id]
                );
                if (componentActiveVersions.length > 0) {
                    line.component_active_version_id = componentActiveVersions[0].id;
                } else {
                    line.component_active_version_id = null;
                }
                // --- 新增逻辑结束 ---

                const children = await getBomTreeNodes(line.component_id, null, currentLevel + 1);
                if (children && children.length > 0) {
                    line.children = children;
                }
            }
            return lines;
        };

        const bomTree = await getBomTreeNodes(null, versionId, 1);
        res.json(bomTree);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// POST: 向指定BOM版本添加新的行项目 (这是需要修改的部分)
router.post('/', async (req, res) => {
    try {
        // 1. 从请求体中获取数据，不再接收 'level'
        const { version_id, parent_line_id, position_code, component_id, quantity, process_info, remark } = req.body;

        let level = 1; // 2. 默认层级为 1

        // 3. 如果存在父节点 (parent_line_id)，则查询父节点的层级并加 1
        if (parent_line_id) {
            const [parentLine] = await db.query('SELECT level FROM bom_lines WHERE id = ?', [parent_line_id]);
            if (parentLine.length > 0) {
                level = parentLine[0].level + 1;
            } else {
                // 如果找不到父节点，返回错误，避免脏数据
                return res.status(404).json({ error: '指定的父BOM行不存在。' });
            }
        }

        // 4. 将计算好的 'level' 连同其他数据一起插入数据库
        const query = `
            INSERT INTO bom_lines 
            (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const [result] = await db.query(query, [version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark]);

        // 5. 返回成功响应，并带上新创建的记录ID和计算出的层级
        res.status(201).json({ id: result.insertId, ...req.body, level });

    } catch (err) {
        // 在服务器端打印详细错误，便于调试
        console.error('Failed to add BOM line:', err);
        res.status(500).json({ error: `操作失败: ${err.message}` });
    }
});

// PUT: 更新一个行项目
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { position_code, component_id, quantity, process_info, remark } = req.body;
        const query = `
            UPDATE bom_lines 
            SET position_code = ?, component_id = ?, quantity = ?, process_info = ?, remark = ? 
            WHERE id = ?`;
        await db.query(query, [position_code, component_id, quantity, process_info, remark, id]);
        res.json({ message: 'BOM line updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// DELETE: 删除一个行项目
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM bom_lines WHERE id = ?', [id]);
        res.json({ message: 'BOM line deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper function to flatten the tree for Excel export
const flattenTreeForExport = (nodes, flatList = [], level = 1) => {
    for (const node of nodes) {
        flatList.push({
            level: level,
            position_code: node.position_code,
            component_code: node.component_code,
            component_name: node.component_name,
            component_spec: node.component_spec,
            quantity: node.quantity,
            process_info: node.process_info,
        });
        if (node.children && node.children.length > 0) {
            flattenTreeForExport(node.children, flatList, level + 1);
        }
    }
    return flatList;
};

// GET: 导出指定BOM版本的结构为Excel文件
router.get('/export/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;

        // 1. 获取BOM行数据并构建树
        const query = `
            SELECT 
                bl.*, 
                m.material_code as component_code, 
                m.name as component_name,
                m.spec as component_spec,
                p.version_code
            FROM bom_lines bl
            JOIN materials m ON bl.component_id = m.id
            JOIN bom_versions p ON bl.version_id = p.id
            WHERE bl.version_id = ?
            ORDER BY bl.level, bl.position_code
        `;
        const [lines] = await db.query(query, [versionId]);
        if (lines.length === 0) {
            return res.status(404).json({ message: 'No BOM data found for this version.' });
        }
        const treeData = buildTree(lines); // 使用之前已有的buildTree函数
        const flatData = flattenTreeForExport(treeData);

        const versionCode = lines[0].version_code;

        // 2. 使用 exceljs 创建Excel文件
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`BOM - ${versionCode}`);

        // 设置列头
        worksheet.columns = [
            { header: '层级', key: 'level', width: 10 },
            { header: '位置编号', key: 'position_code', width: 20 },
            { header: '子件编码', key: 'component_code', width: 25 },
            { header: '子件名称', key: 'component_name', width: 30 },
            { header: '规格', key: 'component_spec', width: 30 },
            { header: '用量', key: 'quantity', width: 15 },
            { header: '工艺说明', key: 'process_info', width: 30 },
        ];

        // 添加数据行
        flatData.forEach(item => {
            const row = worksheet.addRow(item);
            // 根据层级缩进
            if (item.level > 1) {
                row.getCell('component_code').value = ' '.repeat((item.level - 1) * 4) + item.component_code;
            }
        });

        // 3. 设置响应头并发送文件
        const fileName = `BOM_${versionCode}_${Date.now()}.xlsx`;
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${fileName}`
        );

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to export Excel file.' });
    }
});

module.exports = router;