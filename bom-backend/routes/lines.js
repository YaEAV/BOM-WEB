// bom-backend/routes/lines.js (已修改)
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
        if (versionInfo.length === 0) throw new Error('BOM版本未找到。');

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

    // --- 关键修改：重构 importBom 函数以收集所有错误 ---
    async importBom(versionId, fileBuffer) {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(fileBuffer);
            const worksheet = workbook.getWorksheet(1);
            if (!worksheet) throw new Error('在Excel文件中找不到工作表。');

            const errors = [];
            let importedCount = 0;

            const headerMapping = {
                '层级': 'level', '位置编号': 'display_position_code', '子件编码': 'component_code',
                '子件名称': 'component_name', '用量': 'quantity', '工艺说明': 'process_info', '备注': 'remark'
            };
            const headerRow = worksheet.getRow(1).values;
            const columnIndexMap = {};
            headerRow.forEach((header, index) => {
                if (headerMapping[header]) columnIndexMap[headerMapping[header]] = index;
            });

            if (!columnIndexMap.level || !columnIndexMap.display_position_code || !columnIndexMap.component_code || !columnIndexMap.quantity) {
                throw new Error('Excel表头必须包含 "层级", "位置编号", "子件编码", 和 "用量"。');
            }

            const [allMaterials] = await connection.query('SELECT id, material_code FROM materials');
            const materialMap = new Map(allMaterials.map(m => [m.material_code, m.id]));

            const rowsToProcess = [];
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) rowsToProcess.push({ data: row.values, number: rowNumber });
            });

            const parentStack = [];
            for (const rowInfo of rowsToProcess) {
                const { data: rowValues, number: rowNumber } = rowInfo;

                const level = parseInt(rowValues[columnIndexMap.level], 10);
                const position_code = (rowValues[columnIndexMap.display_position_code] || '').toString().split('.').pop();
                const component_code = rowValues[columnIndexMap.component_code];
                const quantity = parseFloat(rowValues[columnIndexMap.quantity]);

                if (!level || !position_code || !component_code || isNaN(quantity)) {
                    errors.push({ row: rowNumber, message: '行数据不完整或格式错误 (层级, 位置编号, 子件编码, 用量)。' });
                    continue;
                }

                if (!materialMap.has(component_code)) {
                    errors.push({ row: rowNumber, message: `子件编码 "${component_code}" 在物料库中不存在。` });
                    continue;
                }

                const component_id = materialMap.get(component_code);

                while (parentStack.length >= level) {
                    parentStack.pop();
                }
                const parent_line_id = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;

                const bomLineData = {
                    version_id: versionId,
                    parent_line_id,
                    level,
                    position_code,
                    component_id,
                    quantity,
                    process_info: rowValues[columnIndexMap.process_info] || null,
                    remark: rowValues[columnIndexMap.remark] || null,
                };
                rowsToProcess[rowsToProcess.indexOf(rowInfo)].bomData = bomLineData;
            }

            if (errors.length > 0) {
                throw { statusCode: 400, message: '导入文件中存在错误。', errors };
            }

            // 如果没有错误，则先清空旧数据，再插入新数据
            await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [versionId]);
            for (const rowInfo of rowsToProcess) {
                const query = `INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                const [result] = await connection.query(query, Object.values(rowInfo.bomData));
                // 更新父级堆栈
                while (parentStack.length >= rowInfo.bomData.level) {
                    parentStack.pop();
                }
                parentStack.push(result.insertId);
                importedCount++;
            }

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
    } catch (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            const customError = new Error(`添加失败：选择的子件不存在于物料库中。`);
            customError.statusCode = 400;
            next(customError);
        } else {
            next(err);
        }
    }
});

router.put('/:id', async (req, res, next) => {
    try {
        res.json(await LineService.updateLine(req.params.id, req.body));
    } catch (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            const customError = new Error(`更新失败：选择的子件不存在于物料库中。`);
            customError.statusCode = 400;
            next(customError);
        } else {
            next(err);
        }
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        res.json(await LineService.deleteLine(req.params.id));
    } catch (err) {
        err.statusCode = 400;
        next(err);
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
        err.statusCode = 404;
        next(err);
    }
});

router.get('/template', (req, res, next) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('BOM导入模板');
        worksheet.columns = [
            { header: '层级', key: 'level', width: 10 },
            { header: '位置编号', key: 'display_position_code', width: 15 },
            { header: '子件编码', key: 'component_code', width: 20 },
            { header: '子件名称', key: 'component_name', width: 30 },
            { header: '规格描述', key: 'component_spec', width: 40 },
            { header: '单位', key: 'component_unit', width: 15 },
            { header: '用量', key: 'quantity', width: 10 },
            { header: '工艺说明', key: 'process_info', width: 30 }
        ];
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
    } catch(err) {
        next(err);
    }
});

router.post('/import/:versionId', upload.single('file'), async (req, res, next) => {
    if (!req.file) {
        const err = new Error('未上传文件。');
        err.statusCode = 400;
        return next(err);
    }
    try {
        res.status(201).json(await LineService.importBom(req.params.versionId, req.file.buffer));
    } catch (err) {
        console.error('BOM导入失败:', err);
        next(err);
    }
});

module.exports = router;