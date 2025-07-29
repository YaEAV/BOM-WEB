// bom-backend/routes/lines.js (已全面修复)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');
const multer = require('multer');
const crypto = require('crypto'); // <--- 修复1: 导入 crypto 模块
const _ = require('lodash');
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

        const errors = []; // 用于收集所有错误

        const buildTreeFromRows = (rows) => {
            const tree = [];
            const levelMap = {};
            // 保持原样...
            for (const node of rows) {
                if (node.level === 1) {
                    tree.push(node);
                } else {
                    // 找到上一级的父节点
                    const parent = levelMap[node.level - 1];
                    if (parent) {
                        if (!parent.children) parent.children = [];
                        parent.children.push(node);
                    } else {
                        // 如果找不到父节点，这可能是一个数据结构问题，但我们先在行处理中捕获
                    }
                }
                levelMap[node.level] = node;
            }
            return tree;
        };

        // 递归函数 - 仅用于插入数据
        const insertNodesRecursive = async (nodesToProcess, parentLineId, targetVersionId, processedVersions, materialCache) => {
            if (!nodesToProcess || nodesToProcess.length === 0) return;

            for (const node of nodesToProcess) {
                const component = materialCache[node.component_code];
                let subBomVersionId = null;
                const hasChildrenInExcel = node.children && node.children.length > 0;

                if (hasChildrenInExcel) {
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

                const [result] = await connection.query(
                    `INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [targetVersionId, parentLineId, node.level, node.position_code, component.id, node.quantity, node.process_info, node.remark]
                );

                if (hasChildrenInExcel && subBomVersionId && !processedVersions.has(subBomVersionId)) {
                    processedVersions.add(subBomVersionId);
                    if (importMode === 'overwrite') {
                        await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [subBomVersionId]);
                    }
                    await insertNodesRecursive(node.children, result.insertId, subBomVersionId, processedVersions, materialCache);
                }
            }
        };


        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(fileBuffer);
            const worksheet = workbook.worksheets[0];
            const rows = [];

            const headerRow = worksheet.getRow(1);
            const columnMap = {};
            headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const headerText = cell.value.toString().trim().replace(/（/g, '(').replace(/）/g, ')');
                columnMap[headerText] = colNumber;
            });

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
                if (headerName === 'BOM版本' && cell.formula) {
                    errors.push({ row: row.number, message: `BOM版本单元格 '${cell.address}' 不能使用公式。` });
                    return null;
                }
                if (cell.value.richText && Array.isArray(cell.value.richText)) return cell.value.richText.map(rt => rt.text).join('').trim();
                if (typeof cell.value === 'object' && cell.value.result) return cell.value.result.toString().trim();
                return cell.value.toString().trim();
            };

            // 1. 第一次遍历：基础验证和数据收集
            for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
                const row = worksheet.getRow(rowNumber);
                const levelStr = getCellValue(row, '层级');
                const componentCode = getCellValue(row, '子件编码');
                const quantityStr = getCellValue(row, '用量');
                let hasError = false;

                if (!componentCode && !levelStr) continue; // 跳过空行

                if (!levelStr || isNaN(parseInt(levelStr, 10))) {
                    errors.push({ row: rowNumber, message: '“层级”不能为空且必须是数字。' });
                    hasError = true;
                }
                if (!componentCode) {
                    errors.push({ row: rowNumber, message: '“子件编码”不能为空。' });
                    hasError = true;
                }
                if (quantityStr === null || quantityStr === '') {
                    errors.push({ row: rowNumber, message: '“用量”不能为空。' });
                    hasError = true;
                } else if (isNaN(parseFloat(quantityStr))) {
                    errors.push({ row: rowNumber, message: '“用量”必须是数字。' });
                    hasError = true;
                }

                if (!hasError) {
                    rows.push({
                        rowNumber,
                        level: parseInt(levelStr, 10),
                        sub_bom_version_code: getCellValue(row, 'BOM版本'),
                        position_code: getCellValue(row, '位置编号'),
                        component_code: componentCode,
                        quantity: parseFloat(quantityStr),
                        process_info: getCellValue(row, '工艺说明'),
                        remark: getCellValue(row, '备注'),
                    });
                }
            }

            if (rows.length === 0 && errors.length === 0) {
                await connection.commit();
                return { message: 'Excel文件为空或格式不正确。' };
            }

            // 2. 第二次遍历：数据库相关验证
            const materialCache = {};
            const validateDbRecursive = async (nodes, ancestry) => {
                if (!nodes) return;
                for (const node of nodes) {
                    // 检查物料是否存在
                    if (!materialCache[node.component_code]) {
                        const [[component]] = await connection.query('SELECT id FROM materials WHERE material_code = ?', [node.component_code]);
                        if (!component) {
                            errors.push({ row: node.rowNumber, message: `物料编码 "${node.component_code}" 在物料库中不存在。` });
                            continue;
                        }
                        materialCache[node.component_code] = component;
                    }

                    const componentId = materialCache[node.component_code].id;

                    // 检查循环引用
                    if (ancestry.includes(componentId)) {
                        errors.push({ row: node.rowNumber, message: `检测到循环引用: "${node.component_code}"。` });
                        continue;
                    }

                    // 检查子BOM版本号
                    if (node.children && node.children.length > 0 && !node.sub_bom_version_code) {
                        errors.push({ row: node.rowNumber, message: `物料 "${node.component_code}" 有子项，但未指定“BOM版本”后缀。` });
                    }

                    if(node.children) {
                        await validateDbRecursive(node.children, [...ancestry, componentId]);
                    }
                }
            };

            const bomTree = buildTreeFromRows(rows);
            const [[{id: materialId}]] = await connection.query('SELECT material_id FROM bom_versions WHERE id = ?', [initialVersionId]);
            await validateDbRecursive(bomTree, [materialId]);

            // 3. 如果有任何错误，则抛出
            if (errors.length > 0) {
                const err = new Error('BOM导入失败，文件中存在多处错误。');
                err.statusCode = 400;
                err.errors = _.uniqBy(errors, e => `row-${e.row}-msg-${e.message}`); // 去重
                throw err;
            }

            // 4. 如果没有错误，执行插入
            if (importMode === 'overwrite') {
                await connection.query('DELETE FROM bom_lines WHERE version_id = ?', [initialVersionId]);
            }
            const processedVersions = new Set([parseInt(initialVersionId, 10)]);
            await insertNodesRecursive(bomTree, null, parseInt(initialVersionId, 10), processedVersions, materialCache);

            await connection.commit();
            return { message: `BOM导入成功，模式: ${importMode}。` };

        } catch (error) {
            await connection.rollback();
            throw error; // 重新抛出，由全局错误处理器捕获
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