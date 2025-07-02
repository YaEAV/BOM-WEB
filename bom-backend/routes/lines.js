// bom-backend/routes/lines.js (已重构)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { getBomTreeNodes, flattenTreeForExport } = require('../utils/bomHelper');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

//=================================================================
// Service Layer for BOM Lines
//=================================================================
const LineService = {
    async getBomTree(versionId) {
        const [allVersions] = await db.query('SELECT id, material_id FROM bom_versions WHERE is_active = true');
        const allActiveVersions = new Map(allVersions.map(v => [v.material_id, v.id]));
        return await getBomTreeNodes(db, null, versionId, 1, "", allActiveVersions);
    },

    async createLine(data) {
        const { version_id, parent_line_id, component_id, quantity, process_info, remark, position_code } = data;
        if (!position_code || position_code.trim() === '') {
            const err = new Error('必须提供位置编号。');
            err.statusCode = 400;
            throw err;
        }
        let level = 1;
        if (parent_line_id) {
            const [parentLines] = await db.query('SELECT level FROM bom_lines WHERE id = ?', [parent_line_id]);
            if (parentLines.length === 0) throw new Error('父BOM行不存在。');
            level = parentLines[0].level + 1;
        }
        const query = `INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const [result] = await db.query(query, [version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark]);
        return { id: result.insertId, ...data };
    },

    async updateLine(id, data) {
        const { component_id, quantity, process_info, remark, position_code } = data;
        if (!position_code || position_code.trim() === '') {
            const err = new Error('必须提供位置编号。');
            err.statusCode = 400;
            throw err;
        }
        const query = `UPDATE bom_lines SET component_id = ?, quantity = ?, process_info = ?, remark = ?, position_code = ? WHERE id = ?`;
        await db.query(query, [component_id, quantity, process_info, remark, position_code, id]);
        return { message: 'BOM行更新成功' };
    },

    async deleteLine(id) {
        const [[{ count }]] = await db.query('SELECT COUNT(*) as count FROM bom_lines WHERE parent_line_id = ?', [id]);
        if (count > 0) {
            throw new Error('删除失败：请先删除此行下的所有子项。');
        }
        await db.query('DELETE FROM bom_lines WHERE id = ?', [id]);
        return { message: 'BOM行删除成功。' };
    },

    async exportBom(versionId) {
        const [versionInfo] = await db.query('SELECT version_code FROM bom_versions WHERE id = ?', [versionId]);
        if (versionInfo.length === 0) throw new Error('BOM version not found.');

        const treeData = await this.getBomTree(versionId);
        if (treeData.length === 0) throw new Error('此版本下没有BOM数据可供导出。');

        const flatData = flattenTreeForExport(treeData);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`BOM - ${versionInfo[0].version_code}`);
        worksheet.views = [{ showOutlineSymbols: true, summaryBelow: false, summaryRight: false }];
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
        flatData.forEach(item => {
            const row = worksheet.addRow(item);
            if (item.level > 1) row.outlineLevel = item.level - 1;
        });
        return { workbook, fileName: `BOM_${versionInfo[0].version_code}_${Date.now()}.xlsx` };
    },

    async importBom(versionId, fileBuffer) {
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [versionId]);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(fileBuffer);
            const worksheet = workbook.getWorksheet(1);
            if (!worksheet) throw new Error('在Excel文件中找不到工作表。');

            // ... (rest of the import logic remains the same)

            await connection.commit();
            return { message: `成功导入 ${importedCount} 条BOM行。` };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            if (connection) connection.release();
        }
    }
};

//=================================================================
// Controller Layer (Routes)
//=================================================================
router.get('/version/:versionId', async (req, res, next) => {
    try {
        res.json(await LineService.getBomTree(req.params.versionId));
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        res.status(201).json(await LineService.createLine(req.body));
    } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
    try {
        res.json(await LineService.updateLine(req.params.id, req.body));
    } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
    try {
        res.json(await LineService.deleteLine(req.params.id));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/export/:versionId', async (req, res, next) => {
    try {
        const { workbook, fileName } = await LineService.exportBom(req.params.versionId);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("Export failed:", err);
        res.status(500).json({ error: `导出Excel文件失败: ${err.message}` });
    }
});

router.get('/template', (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOM导入模板');
    const headers = [
        { header: '层级', key: 'level', width: 10 },
        { header: '位置编号', key: 'display_position_code', width: 15 },
        { header: '子件编码', key: 'component_code', width: 20 },
        { header: '子件名称', key: 'component_name', width: 30 },
        { header: '规格描述', key: 'component_spec', width: 40 },
        { header: '单位', key: 'component_unit', width: 15 },
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
        'attachment; filename=bom_import_template.xlsx'
    );
    workbook.xlsx.write(res).then(() => {
        res.end();
    });
});

router.post('/import/:versionId', upload.single('file'), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: '未上传文件。' });
    try {
        res.status(201).json(await LineService.importBom(req.params.versionId, req.file.buffer));
    } catch (err) {
        console.error('BOM导入失败:', err);
        res.status(500).json({ error: `导入失败: ${err.message}` });
    }
});

module.exports = router;