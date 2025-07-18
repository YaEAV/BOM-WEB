// bom-backend/routes/lines.js (已全面修复)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');
const multer = require('multer');
const crypto = require('crypto'); // <--- 修复1: 导入 crypto 模块
const { getFullBomTree, flattenTreeForExport } = require('../utils/bomHelper');
const { validateBomLine } = require('../middleware/validators');
const { findAndCount } = require('../utils/queryHelper');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

//=================================================================
// Service Layer for BOM Lines
//=================================================================
const LineService = {

    async findLines(options) {
        const baseQuery = `
            SELECT
                bl.id,
                bl.position_code,
                bl.quantity,
                bl.deleted_at,
                m.material_code as component_code,
                m.name as component_name,
                v.version_code
            FROM bom_lines bl
            JOIN materials m ON bl.component_id = m.id
            JOIN bom_versions v ON bl.version_id = v.id
        `;
        const countQuery = `
            SELECT COUNT(*) as total
            FROM bom_lines bl
            JOIN materials m ON bl.component_id = m.id
            JOIN bom_versions v ON bl.version_id = v.id
        `;
        const queryOptions = {
            ...options,
            searchFields: ['v.version_code', 'bl.position_code', 'm.material_code', 'm.name'],
            allowedSortBy: ['version_code', 'position_code', 'component_code', 'component_name', 'quantity', 'deleted_at'],
            deletedAtField: 'bl.deleted_at'
        };

        return findAndCount(db, baseQuery, countQuery, queryOptions);
    },

    async getBomTree(versionId) {
        return await getFullBomTree(versionId, db);
    },

    async createLine(data) {
        const { version_id, parent_line_id, component_id, quantity, process_info, remark, position_code } = data;
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

    async deleteLine(ids) { // 修改为支持批量软删除
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('必须提供一个ID数组。');
            err.statusCode = 400;
            throw err;
        }

        for (const id of ids) {
            const [[{ count }]] = await db.query('SELECT COUNT(*) as count FROM bom_lines WHERE parent_line_id = ? AND deleted_at IS NULL', [id]);
            if (count > 0) {
                const err = new Error(`删除失败：ID为 ${id} 的BOM行下存在子项，请先删除子项。`);
                err.statusCode = 400;
                throw err;
            }
        }

        const query = 'UPDATE bom_lines SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
        const [result] = await db.query(query, [ids]);
        return { message: `成功将 ${result.affectedRows} 个BOM行移至回收站。` };
    },

    async restoreLines(ids) { // 新增恢复功能
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('必须提供一个ID数组。');
            err.statusCode = 400;
            throw err;
        }
        const query = 'UPDATE bom_lines SET deleted_at = NULL WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功恢复 ${result.affectedRows} 个BOM行。` };
    },

    async deletePermanent(ids) { // 新增永久删除功能
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('必须提供一个ID数组。');
            err.statusCode = 400;
            throw err;
        }
        const query = 'DELETE FROM bom_lines WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功彻底删除 ${result.affectedRows} 个BOM行。` };
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
            if (!worksheet) throw new Error('在Excel文件中找不到工作表。');

            const errors = [];
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

            const rowHashMap = new Map();
            for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
                const row = worksheet.getRow(rowNumber);
                const rowData = [];
                row.eachCell({ includeEmpty: true }, cell => {
                    rowData.push(cell.value);
                });
                const rowString = rowData.join('|');
                if (!rowString.replace(/\|/g, '')) continue;

                const rowHash = crypto.createHash('md5').update(rowString).digest('hex');
                if (rowHashMap.has(rowHash)) {
                    const firstAppearance = rowHashMap.get(rowHash);
                    errors.push({ row: rowNumber, message: `此行内容与第 ${firstAppearance} 行完全重复。` });
                } else {
                    rowHashMap.set(rowHash, rowNumber);
                }
            }
            if (errors.length > 0) {
                throw { statusCode: 400, message: '导入失败：Excel文件内部存在内容完全重复的行。', errors };
            }

            const [allMaterials] = await connection.query('SELECT id, material_code FROM materials');
            const materialMap = new Map(allMaterials.map(m => [String(m.material_code).trim(), { id: m.id, code: m.material_code }]));

            const contextStack = [{ versionId: initialVersionId, parentLineId: null, level: 0 }];
            const positionsProcessedInFile = new Set(); // <--- 修复2: 声明变量
            let newCount = 0;
            let updatedCount = 0;

            for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
                const rowValues = worksheet.getRow(rowNumber).values;

                const level = parseInt(rowValues[columnIndexMap.level], 10);
                const display_position_code = (rowValues[columnIndexMap.display_position_code] || '').toString();
                const position_code = display_position_code.split('.').pop();
                const component_code = rowValues[columnIndexMap.component_code] ? String(rowValues[columnIndexMap.component_code]).trim() : null;
                const quantity = parseFloat(rowValues[columnIndexMap.quantity]);

                if (isNaN(level) || !position_code || !component_code || isNaN(quantity)) {
                    errors.push({ row: rowNumber, message: '行数据不完整或格式错误 (层级, 位置编号, 子件编码, 用量)。' });
                    continue;
                }

                while (contextStack.length - 1 >= level) {
                    contextStack.pop();
                }
                const parentContext = contextStack[contextStack.length - 1];

                if (!parentContext || !parentContext.versionId) {
                    errors.push({ row: rowNumber, message: `无法添加此行，因为它的上级物料没有指定有效的BOM版本。` });
                    contextStack.push({ versionId: null, parentLineId: null, level: level });
                    continue;
                }

                if (!materialMap.has(component_code)) {
                    errors.push({ row: rowNumber, message: `子件编码 "${component_code}" 在物料库中不存在。` });
                    contextStack.push({ versionId: null, parentLineId: null, level: level });
                    continue;
                }
                const component = materialMap.get(component_code);

                const uniqueKeyInFile = `${parentContext.parentLineId || 'root'}-${position_code}-${component.id}`;
                if (positionsProcessedInFile.has(uniqueKeyInFile)) {
                    errors.push({ row: rowNumber, message: `文件内存在重复记录 (位置编号: "${position_code}", 子件: "${component_code}")` });
                    contextStack.push({ versionId: null, parentLineId: null, level: level });
                    continue;
                }
                positionsProcessedInFile.add(uniqueKeyInFile);

                const lineData = {
                    component_id: component.id,
                    quantity: quantity,
                    process_info: rowValues[columnIndexMap.process_info] || null,
                    remark: rowValues[columnIndexMap.remark] || null,
                };

                const [existingLines] = await connection.query(
                    'SELECT id FROM bom_lines WHERE version_id = ? AND parent_line_id <=> ? AND position_code = ? AND component_id = ?',
                    [parentContext.versionId, parentContext.parentLineId, position_code, component.id] // <--- 修复3: 修正了查询参数
                );

                let currentLineId;
                if (existingLines.length > 0 && importMode === 'incremental') {
                    currentLineId = existingLines[0].id;
                    const updateQuery = `UPDATE bom_lines SET quantity = ?, process_info = ?, remark = ? WHERE id = ?`;
                    await connection.query(updateQuery, [lineData.quantity, lineData.process_info, lineData.remark, currentLineId]);
                    updatedCount++;
                } else {
                    const insertQuery = `INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                    const [result] = await connection.query(insertQuery, [parentContext.versionId, parentContext.parentLineId, level, position_code, lineData.component_id, lineData.quantity, lineData.process_info, lineData.remark]);
                    currentLineId = result.insertId;
                    newCount++;
                }

                const raw_bom_version_suffix = rowValues[columnIndexMap.bom_version_suffix];
                const bom_version_suffix = raw_bom_version_suffix != null ? String(raw_bom_version_suffix).trim() : null;
                let nextVersionIdForChildren = null;

                if (bom_version_suffix) {
                    const newVersionCode = `${component.code}_V${bom_version_suffix}`;
                    let [[version]] = await connection.query('SELECT id FROM bom_versions WHERE material_id = ? AND version_code = ?', [component.id, newVersionCode]);

                    if (version) {
                        nextVersionIdForChildren = version.id;
                    } else {
                        await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ?', [component.id]);
                        const [res] = await connection.query('INSERT INTO bom_versions (material_id, version_code, is_active, remark) VALUES (?, ?, true, ?)', [component.id, newVersionCode, '由BOM导入自动创建']);
                        nextVersionIdForChildren = res.insertId;
                    }
                }
                contextStack.push({ versionId: nextVersionIdForChildren, parentLineId: currentLineId, level: level });
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

//=================================================================
// Controller Layer (Routes)
//=================================================================

router.get('/', async (req, res, next) => {
    try {
        const includeDeleted = req.query.includeDeleted === 'true';
        res.json(await LineService.findLines({ ...req.query, includeDeleted }));
    } catch (err) {
        next(err);
    }
});

router.get('/version/:versionId', async (req, res, next) => {
    try {
        res.json(await LineService.getBomTree(req.params.versionId));
    } catch (err) { next(err); }
});

router.post('/', validateBomLine, async (req, res, next) => {
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

router.post('/delete', async (req, res, next) => {
    try {
        res.json(await LineService.deleteLine(req.body.ids));
    } catch (err) {
        next(err);
    }
});

// 5. 新增恢复和永久删除的路由
router.post('/restore', async (req, res, next) => {
    try {
        res.json(await LineService.restoreLines(req.body.ids));
    } catch (err) {
        next(err);
    }
});

router.post('/delete-permanent', async (req, res, next) => {
    try {
        res.json(await LineService.deletePermanent(req.body.ids));
    } catch (err) {
        next(err);
    }
});

// router.delete('/:id', async (req, res, next) => {
//     try {
//         res.json(await LineService.deleteLine(req.params.id));
//     } catch (err) {
//         err.statusCode = 400;
//         next(err);
//     }
// });

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