// bom-backend/routes/lines.js (已修复)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { getFullBomTree, flattenTreeForExport } = require('../utils/bomHelper');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

//=================================================================
// Service Layer for BOM Lines
//=================================================================
const LineService = {
    // ... (getBomTree, createLine, updateLine, deleteLine, exportBom 函数保持不变) ...
    async getBomTree(versionId) {
        return await getFullBomTree(versionId, db);
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
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [[{ count }]] = await connection.query('SELECT COUNT(*) as count FROM bom_lines WHERE parent_line_id = ? AND deleted_at IS NULL', [id]);
            if (count > 0) {
                throw new Error('删除失败：请先删除此行下的所有子项。');
            }
            await connection.query('UPDATE bom_lines SET deleted_at = NOW() WHERE id = ?', [id]);
            await connection.commit();
            return { message: 'BOM行删除成功。' };
        } catch(error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
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
            { header: 'BOM版本', key: 'bom_version', width: 20 },
            { header: '位置编号', key: 'display_position_code', width: 15 },
            { header: '子件编码', key: 'component_code', width: 25 },
            { header: '子件名称', key: 'component_name', width: 30 },
            { header: '规格', key: 'component_spec', width: 30 },
            { header: '用量', key: 'quantity', width: 15 },
            { header: '单位', key: 'component_unit', width: 15 },
            { header: '工艺说明', key: 'process_info', width: 30 },
            { header: '备注', key: 'remark', width: 40 },
        ];
        worksheet.getRow(1).font = { bold: true };
        flatData.forEach(item => {
            const row = worksheet.addRow(item);
            if (item.level > 1) {
                row.outlineLevel = item.level - 1;
            }
        });
        return { workbook, fileName: `BOM_${versionInfo[0].version_code}_${Date.now()}.xlsx` };
    },

    async importBom(initialVersionId, fileBuffer, importMode = 'overwrite') {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            if (importMode === 'overwrite') {
                await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [initialVersionId]);
            }

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(fileBuffer);
            const worksheet = workbook.getWorksheet(1);
            if (!worksheet) {
                throw new Error('在Excel文件中找不到工作表。');
            }

            const errors = [];
            let newCount = 0;
            let updatedCount = 0;

            const headerMapping = {
                '层级': 'level', 'BOM版本': 'bom_version_suffix', '位置编号': 'display_position_code',
                '子件编码': 'component_code', '用量': 'quantity', '工艺说明': 'process_info', '备注': 'remark'
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
            const materialMap = new Map(allMaterials.map(m => [String(m.material_code).trim(), { id: m.id, code: m.material_code }]));

            // 用于检查文件内 "位置号+物料号" 是否重复
            const positionsProcessedInFile = new Set();
            // 用于管理层级上下文
            const contextStack = [{ versionId: initialVersionId, parentLineId: null, level: 0 }];

            for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
                const rowValues = worksheet.getRow(rowNumber).values;

                const level = parseInt(rowValues[columnIndexMap.level], 10);
                const display_position_code = (rowValues[columnIndexMap.display_position_code] || '').toString();
                const position_code = display_position_code.split('.').pop();
                const component_code = rowValues[columnIndexMap.component_code] ? String(rowValues[columnIndexMap.component_code]).trim() : null;
                const quantity = parseFloat(rowValues[columnIndexMap.quantity]);

                if (!level || !position_code || !component_code || isNaN(quantity)) {
                    errors.push({ row: rowNumber, message: '行数据不完整或格式错误 (层级, 位置编号, 子件编码, 用量)。' });
                    continue;
                }

                // 确保上下文堆栈正确
                while (contextStack.length -1 > level - 1) {
                    contextStack.pop();
                }
                const parentContext = contextStack[contextStack.length - 1];

                if (!materialMap.has(component_code)) {
                    errors.push({ row: rowNumber, message: `子件编码 "${component_code}" 在物料库中不存在。` });
                    continue;
                }
                const component = materialMap.get(component_code);

                // --- 关键逻辑：使用 “父项-位置-子件” 联合作为唯一键 ---
                const uniqueKeyInFile = `${parentContext.parentLineId || 'root'}-${position_code}-${component.id}`;
                if (positionsProcessedInFile.has(uniqueKeyInFile)) {
                    errors.push({ row: rowNumber, message: `文件内存在重复记录 (位置编号: "${position_code}", 子件: "${component_code}")` });
                    continue;
                }
                positionsProcessedInFile.add(uniqueKeyInFile);

                const lineData = {
                    component_id: component.id,
                    quantity: quantity,
                    process_info: rowValues[columnIndexMap.process_info] || null,
                    remark: rowValues[columnIndexMap.remark] || null,
                };

                // --- 关键逻辑：查询数据库时，使用位置号和物料号共同判断 ---
                const [existingLines] = await connection.query(
                    'SELECT id FROM bom_lines WHERE version_id = ? AND parent_line_id <=> ? AND position_code = ? AND component_id = ?',
                    [parentContext.versionId, parentContext.parentLineId, position_code, component.id]
                );

                let currentLineId;
                if (existingLines.length > 0 && importMode === 'incremental') { // 更新
                    currentLineId = existingLines[0].id;
                    const updateQuery = `UPDATE bom_lines SET quantity = ?, process_info = ?, remark = ? WHERE id = ?`;
                    await connection.query(updateQuery, [lineData.quantity, lineData.process_info, lineData.remark, currentLineId]);
                    updatedCount++;
                } else { // 新增 (覆盖模式下总是新增)
                    const insertQuery = `INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                    const [result] = await connection.query(insertQuery, [parentContext.versionId, parentContext.parentLineId, level, position_code, lineData.component_id, lineData.quantity, lineData.process_info, lineData.remark]);
                    currentLineId = result.insertId;
                    newCount++;
                }

                // ... (后续的上下文管理逻辑保持不变) ...
                if (contextStack.length - 1 < level) {
                    const raw_bom_version_suffix = rowValues[columnIndexMap.bom_version_suffix];
                    const bom_version_suffix = raw_bom_version_suffix != null ? raw_bom_version_suffix : null;
                    let nextVersionId = parentContext.versionId;

                    if (bom_version_suffix != null) {
                        const newVersionCode = `${component.code}_V${bom_version_suffix}`;
                        let [[version]] = await connection.query('SELECT id FROM bom_versions WHERE material_id = ? AND version_code = ?', [component.id, newVersionCode]);

                        if (version) {
                            nextVersionId = version.id;
                        } else {
                            await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ?', [component.id]);
                            const [res] = await connection.query('INSERT INTO bom_versions (material_id, version_code, is_active, remark) VALUES (?, ?, true, ?)', [component.id, newVersionCode, '由BOM导入自动创建']);
                            nextVersionId = res.insertId;
                        }
                    }
                    contextStack.push({ versionId: nextVersionId, parentLineId: currentLineId, level: level });
                } else {
                    contextStack[level].parentLineId = currentLineId;
                }
            }

            if (errors.length > 0) {
                const err = new Error('导入文件中存在错误。');
                err.statusCode = 400;
                err.errors = errors;
                throw err;
            }

            await connection.commit();
            return { message: `导入成功: 新增 ${newCount} 行, 更新 ${updatedCount} 行。` };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            if (connection) connection.release();
        }
    }
};

// ... (文件底部的 Controller Layer (Routes) 保持不变) ...
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
            { header: 'BOM版本', key: 'bom_version', width: 20 },
            { header: '位置编号', key: 'display_position_code', width: 15 },
            { header: '子件编码', key: 'component_code', width: 20 },
            { header: '子件名称', key: 'component_name', width: 30 },
            { header: '规格描述', key: 'component_spec', width: 40 },
            { header: '单位', key: 'component_unit', width: 15 },
            { header: '用量', key: 'quantity', width: 10 },
            { header: '工艺说明', key: 'process_info', width: 30 },
            { header: '备注', key: 'remark', width: 40 },
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
        const importMode = req.query.mode || 'overwrite';
        res.status(201).json(await LineService.importBom(req.params.versionId, req.file.buffer, importMode));
    } catch (err) {
        console.error('BOM导入失败:', err);
        if (err.code === 'ER_WARN_DATA_OUT_OF_RANGE') {
            const customError = new Error(`导入失败：Excel文件中的“用量”值超出了数据库允许的范围。请检查文件中的数值是否过大或不符合列定义。`);
            customError.statusCode = 400;
            return next(customError);
        }
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            const customError = new Error(`导入失败：文件中存在物料库中没有的子件编码。`);
            customError.statusCode = 400;
            return next(customError);
        }
        next(err);
    }
});


module.exports = router;