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

/**
 * 递归查找给定BOM行ID的所有后代ID
 * @param {Array<number>} lineIds - 父级BOM行的ID数组
 * @param {object} connection - 数据库连接
 * @param {boolean} includeSoftDeleted - 是否也查找已在回收站中的后代
 * @returns {Promise<Array<number>>} - 所有后代BOM行的ID数组
 */
async function findAllDescendantIds(lineIds, connection, includeSoftDeleted = false) {
    if (!lineIds || lineIds.length === 0) {
        return [];
    }

    let allDescendantIds = [];
    let currentIds = [...lineIds];

    while (currentIds.length > 0) {
        const query = `SELECT id FROM bom_lines WHERE parent_line_id IN (?) ${includeSoftDeleted ? '' : 'AND deleted_at IS NULL'}`;
        const [children] = await connection.query(query, [currentIds]);
        const childIds = children.map(c => c.id);

        if (childIds.length === 0) {
            break;
        }

        allDescendantIds.push(...childIds);
        currentIds = childIds;
    }

    return allDescendantIds;
}

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
                v.version_code,
                parent_m.material_code as parent_component_code,
                parent_m.name as parent_component_name
            FROM bom_lines bl
                     JOIN materials m ON bl.component_id = m.id
                     JOIN bom_versions v ON bl.version_id = v.id
                     LEFT JOIN bom_lines parent_bl ON bl.parent_line_id = parent_bl.id
                     LEFT JOIN materials parent_m ON parent_bl.component_id = parent_m.id
        `;
        const countQuery = `
            SELECT COUNT(*) as total
            FROM bom_lines bl
                     JOIN materials m ON bl.component_id = m.id
                     JOIN bom_versions v ON bl.version_id = v.id
                     LEFT JOIN bom_lines parent_bl ON bl.parent_line_id = parent_bl.id
                     LEFT JOIN materials parent_m ON parent_bl.component_id = parent_m.id
        `;
        const queryOptions = {
            ...options,
            searchFields: ['v.version_code', 'bl.position_code', 'm.material_code', 'm.name', 'parent_m.material_code', 'parent_m.name'],
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

    async deleteLine(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('必须提供一个ID数组。');
            err.statusCode = 400;
            throw err;
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const descendantIds = await findAllDescendantIds(ids, connection);
            const allIdsToDelete = [...new Set([...ids, ...descendantIds])];

            if (allIdsToDelete.length > 0) {
                const query = 'UPDATE bom_lines SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
                const [result] = await connection.query(query, [allIdsToDelete]);
                await connection.commit();
                return { message: `成功将 ${result.affectedRows} 个BOM行及其子项移至回收站。` };
            }

            await connection.commit();
            return { message: '没有需要删除的BOM行。' };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    },

    // --- 新增：恢复BOM行的服务 ---
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

    // --- 新增：永久删除BOM行的服务 ---
    async deletePermanent(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('需要提供一个ID数组。');
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // 在回收站中也查找所有后代，因为它们可能已被软删除
            const descendantIds = await findAllDescendantIds(ids, connection, true);
            const allIdsToDelete = [...new Set([...ids, ...descendantIds])];

            if (allIdsToDelete.length > 0) {
                const query = 'DELETE FROM bom_lines WHERE id IN (?)';
                const [result] = await connection.query(query, [allIdsToDelete]);
                await connection.commit();
                return { message: `成功彻底删除 ${result.affectedRows} 个BOM行及其子项。` };
            }

            await connection.commit();
            return { message: '没有需要彻底删除的BOM行。' };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
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

        const buildTreeFromRows = (rows) => {
            const tree = [];
            const levelMap = {};
            for (const node of rows) {
                if (node.level === 1) {
                    tree.push(node);
                } else {
                    const parent = levelMap[node.level - 1];
                    if (parent) {
                        if (!parent.children) parent.children = [];
                        parent.children.push(node);
                    }
                }
                levelMap[node.level] = node;
            }
            return tree;
        };

        const processNodesRecursive = async (nodesToProcess, parentLineId, targetVersionId, processedVersions, ancestryPath) => {
            if (!nodesToProcess || nodesToProcess.length === 0) return;
            for (const node of nodesToProcess) {
                if (!node.component_code) continue;
                const [[component]] = await connection.query('SELECT id FROM materials WHERE material_code = ?', [node.component_code]);
                if (!component) throw new Error(`导入中断：物料编码 "${node.component_code}" 在物料库中不存在。`);
                if (ancestryPath.includes(component.id)) throw new Error(`导入失败：检测到循环引用。物料 "${node.component_code}" 不能作为自身的子项或孙子项。`);
                let subBomVersionId = null;
                const hasChildrenInExcel = node.children && node.children.length > 0;
                if (hasChildrenInExcel) {
                    if (!node.sub_bom_version_code) throw new Error(`导入中断：物料 "${node.component_code}" 在Excel中定义了子项，但未指定其“BOM版本”。`);
                    const fullVersionCode = `${node.component_code}_V${node.sub_bom_version_code}`;
                    const [[existingVersion]] = await connection.query('SELECT id FROM bom_versions WHERE version_code = ? AND material_id = ?', [fullVersionCode, component.id]);
                    if (existingVersion) {
                        subBomVersionId = existingVersion.id;
                    } else {
                        await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ?', [component.id]);
                        const [newVersionResult] = await connection.query('INSERT INTO bom_versions (material_id, version_code, is_active, remark) VALUES (?, ?, ?, ?)', [component.id, fullVersionCode, true, '由BOM导入自动创建']);
                        subBomVersionId = newVersionResult.insertId;
                    }
                }
                await connection.query(`INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [targetVersionId, parentLineId, node.level, node.position_code, component.id, node.quantity, node.process_info, node.remark]);
                if (hasChildrenInExcel && !processedVersions.has(subBomVersionId)) {
                    processedVersions.add(subBomVersionId);
                    if (importMode === 'overwrite') await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [subBomVersionId]);
                    const newAncestryPath = [...ancestryPath, component.id];
                    await processNodesRecursive(node.children, null, subBomVersionId, processedVersions, newAncestryPath);
                }
            }
        };

        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(fileBuffer);
            const worksheet = workbook.worksheets[0];
            const rows = [];

            // --- 核心修改：读取标题行并创建列映射 ---
            const headerRow = worksheet.getRow(1);
            const columnMap = {};
            headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                // 将标题文本中的常见变体（如全角括号）统一处理
                const headerText = cell.value.toString().trim().replace(/（/g, '(').replace(/）/g, ')');
                columnMap[headerText] = colNumber;
            });

            // 验证必需的列是否存在
            const requiredHeaders = ['层级', '子件编码', '用量'];
            for (const header of requiredHeaders) {
                if (!columnMap[header]) {
                    throw new Error(`导入失败：Excel文件中缺少必需的列标题 "${header}"。`);
                }
            }

            const getCellValue = (row, headerName) => {
                const colNumber = columnMap[headerName];
                if (!colNumber) return null;
                const cell = row.getCell(colNumber);
                if (!cell || cell.value === null || cell.value === undefined) return null;
                if (headerName === 'BOM版本' && cell.formula) throw new Error(`导入失败：BOM版本单元格 '${cell.address}' 不能使用公式。`);
                if (cell.value.richText && Array.isArray(cell.value.richText)) return cell.value.richText.map(rt => rt.text).join('').trim();
                if (typeof cell.value === 'object' && cell.value.result) return cell.value.result.toString().trim();
                return cell.value.toString().trim();
            };

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    const level = getCellValue(row, '层级');
                    const componentCode = getCellValue(row, '子件编码');
                    if (level && !isNaN(parseInt(level, 10)) && componentCode) {
                        const quantity = getCellValue(row, '用量');
                        if (quantity === null || quantity === '') throw new Error(`导入失败：第 ${rowNumber} 行的“用量”单元格不能为空。`);
                        rows.push({
                            level: parseInt(level, 10),
                            sub_bom_version_code: getCellValue(row, 'BOM版本'),
                            position_code: getCellValue(row, '位置编号'),
                            component_code: componentCode,
                            quantity: quantity,
                            process_info: getCellValue(row, '工艺说明'),
                            remark: getCellValue(row, '备注'),
                        });
                    }
                }
            });

            if (rows.length === 0) {
                await connection.commit();
                return { message: 'Excel文件为空或格式不正确。' };
            }
            const bomTree = buildTreeFromRows(rows);
            const processedVersions = new Set();
            if (importMode === 'overwrite') {
                await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [initialVersionId]);
                processedVersions.add(parseInt(initialVersionId, 10));
            }
            await processNodesRecursive(bomTree, null, parseInt(initialVersionId, 10), processedVersions, []);
            await connection.commit();
            return { message: `BOM导入成功，模式: ${importMode}。` };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    },
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