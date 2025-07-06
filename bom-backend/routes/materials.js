// bom-backend/routes/materials.js (最终修正版 - 修复导入重复键问题)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

//=================================================================
// Service Layer for Materials
//=================================================================
const MaterialService = {
    getSearchWhereClause(search, includeDeleted = false) {
        let whereClause = includeDeleted ? ' WHERE 1=1' : ' WHERE deleted_at IS NULL';
        let params = [];
        if (search) {
            const searchTerm = `%${search}%`;
            whereClause += ' AND (material_code LIKE ? OR name LIKE ? OR alias LIKE ?)';
            params.push(searchTerm, searchTerm, searchTerm);
        }
        return { whereClause, params };
    },

    async getMaterials({ search, page = 1, limit = 20, sortBy = 'material_code', sortOrder = 'asc', includeDeleted = false }) {
        const offset = (page - 1) * limit;
        const { whereClause, params } = this.getSearchWhereClause(search, includeDeleted);

        const countQuery = `SELECT COUNT(*) as total FROM materials${whereClause}`;
        let dataQuery = `SELECT * FROM materials${whereClause}`;

        const allowedSortBy = ['material_code', 'name', 'category', 'supplier', 'deleted_at'];
        const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : 'material_code';
        const safeSortOrder = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        dataQuery += ` ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT ? OFFSET ?`;
        const dataParams = [...params, parseInt(limit), parseInt(offset)];

        const [[{ total }]] = await db.query(countQuery, params);
        const [materials] = await db.query(dataQuery, dataParams);

        return { data: materials, total, hasMore: (offset + materials.length) < total };
    },

    async getMaterialById(id) {
        const [[material]] = await db.query('SELECT * FROM materials WHERE id = ?', [id]);
        if (!material) {
            const err = new Error('Material not found.');
            err.statusCode = 404;
            throw err;
        }
        return material;
    },

    async createMaterial(data) {
        const { material_code, name, alias, spec, category, unit, supplier, remark } = data;
        const query = 'INSERT INTO materials (material_code, name, alias, spec, category, unit, supplier, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await db.query(query, [material_code, name, alias, spec, category, unit, supplier, remark]);
        return { id: result.insertId, ...data };
    },

    async updateMaterial(id, data) {
        const { material_code, name, alias, spec, category, unit, supplier, remark } = data;
        const query = 'UPDATE materials SET material_code = ?, name = ?, alias = ?, spec = ?, category = ?, unit = ?, supplier = ?, remark = ? WHERE id = ?';
        await db.query(query, [material_code, name, alias, spec, category, unit, supplier, remark, id]);
        return { message: 'Material updated successfully' };
    },

    async deleteMaterials(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('必须提供一个ID数组。');
            err.statusCode = 400;
            throw err;
        }
        // 我们只标记物料本身。其关联的BOM和图纸将因为无法被查询到而“隐藏”。
        const query = 'UPDATE materials SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
        const [result] = await db.query(query, [ids]);
        return { message: `成功删除 ${result.affectedRows} 个物料。` };
    },

    // --- 新增功能：恢复物料 ---
    async restoreMaterials(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('必须提供一个ID数组。');
            err.statusCode = 400;
            throw err;
        }
        const query = 'UPDATE materials SET deleted_at = NULL WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功恢复 ${result.affectedRows} 个物料。` };
    },

    async importMaterials(file, importMode = 'overwrite') {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(file.buffer);
            const worksheet = workbook.getWorksheet(1);
            if (!worksheet) {
                throw new Error('在Excel文件中找不到工作表。');
            }

            const errors = [];
            const headerMapping = {
                '物料编码': 'material_code', '产品名称': 'name', '别名': 'alias',
                '规格描述': 'spec', '物料属性': 'category', '单位': 'unit',
                '供应商': 'supplier', '备注': 'remark'
            };
            const headerRow = worksheet.getRow(1);
            const columnIndexMap = {};
            headerRow.eachCell((cell, colNumber) => {
                const headerText = cell.value;
                if (headerMapping[headerText]) {
                    columnIndexMap[headerMapping[headerText]] = colNumber;
                }
            });

            if (!columnIndexMap.material_code || !columnIndexMap.name || !columnIndexMap.unit) {
                throw new Error('Excel表头必须包含 "物料编码"、"产品名称" 和 "单位"。');
            }

            const [allUnits] = await connection.query('SELECT name FROM units');
            const unitSet = new Set(allUnits.map(u => u.name));
            const [allSuppliers] = await connection.query('SELECT name FROM suppliers');
            const supplierSet = new Set(allSuppliers.map(s => s.name));

            // VVVV --- 核心修正：先在内存中处理所有行，去重 --- VVVV
            const materialsToProcess = new Map();
            for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
                const row = worksheet.getRow(rowNumber);
                const getCellValue = (colName) => {
                    const cell = row.getCell(columnIndexMap[colName]);
                    const value = cell.value ? (cell.value.result || cell.value) : null;
                    return value !== null ? String(value).trim() : null;
                };

                const materialData = {
                    material_code: getCellValue('material_code'),
                    name: getCellValue('name'),
                    alias: getCellValue('alias'),
                    spec: getCellValue('spec'),
                    category: getCellValue('category'),
                    unit: getCellValue('unit'),
                    supplier: getCellValue('supplier'),
                    remark: getCellValue('remark'),
                };

                if (!materialData.material_code) continue; // Skip empty rows

                if (!materialData.name) {
                    errors.push({ row: rowNumber, message: '物料编码和产品名称不能为空。' });
                    continue;
                }
                if (materialData.unit && !unitSet.has(materialData.unit)) {
                    errors.push({ row: rowNumber, message: `单位 "${materialData.unit}" 不存在。请先在单位管理中添加。` });
                }
                if (materialData.supplier && !supplierSet.has(materialData.supplier)) {
                    errors.push({ row: rowNumber, message: `供应商 "${materialData.supplier}" 不存在。请先在供应商管理中添加。` });
                }

                materialsToProcess.set(materialData.material_code, materialData);
            }

            if (errors.length > 0) {
                throw { statusCode: 400, message: '导入文件中存在错误。', errors };
            }
            // ^^^^ --- 内存处理结束 --- ^^^^

            let newCount = 0;
            let updatedCount = 0;

            if (importMode === 'incremental') {
                const [existingRows] = await connection.query('SELECT material_code FROM materials WHERE material_code IN (?)', [[...materialsToProcess.keys()]]);
                const existingCodes = new Set(existingRows.map(r => r.material_code));

                for (const [code, data] of materialsToProcess.entries()) {
                    if (!existingCodes.has(code)) {
                        const query = `INSERT INTO materials (material_code, name, alias, spec, category, unit, supplier, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                        await connection.query(query, Object.values(data));
                        newCount++;
                    }
                }
            } else { // Overwrite mode
                for (const [code, data] of materialsToProcess.entries()) {
                    const query = `
                        INSERT INTO materials (material_code, name, alias, spec, category, unit, supplier, remark)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE
                                                 name = VALUES(name), alias = VALUES(alias), spec = VALUES(spec),
                                                 category = VALUES(category), unit = VALUES(unit),
                                                 supplier = VALUES(supplier), remark = VALUES(remark)
                    `;
                    const [result] = await connection.query(query, Object.values(data));
                    if (result.affectedRows === 1) newCount++;
                    else if (result.affectedRows === 2) updatedCount++;
                }
            }

            await connection.commit();
            let message = '';
            if (importMode === 'incremental') {
                message = `导入完成：成功新增 ${newCount} 条物料。`;
            } else {
                message = `导入完成：新增 ${newCount} 条，更新 ${updatedCount} 条。`;
            }
            return { message };

        } catch (err) {
            await connection.rollback();
            throw err; // Re-throw the error to be handled by the controller
        } finally {
            if (connection) connection.release();
        }
    },

    async getAllMaterialIds(search) {
        const { whereClause, params } = this.getSearchWhereClause(search);
        const idQuery = `SELECT id FROM materials${whereClause}`;
        const [rows] = await db.query(idQuery, params);
        return rows.map(row => row.id);
    },

    async getWhereUsed(id) {
        const query = `
            SELECT
                p.id AS parent_material_id,
                p.material_code AS parent_material_code,
                p.name AS parent_name,
                v.id AS version_id,
                v.version_code,
                v.is_active
            FROM
                bom_lines bl
                    JOIN
                bom_versions v ON bl.version_id = v.id
                    JOIN
                materials p ON v.material_id = p.id
            WHERE
                bl.component_id = ?
            ORDER BY p.material_code, v.version_code;
        `;
        const [results] = await db.query(query, [id]);
        return results;
    },

    async searchMaterials(term) {
        const query = `
            SELECT id, material_code, name, spec, unit
            FROM materials
            WHERE material_code LIKE ? OR name LIKE ?
                LIMIT 15
        `;
        const params = [`%${term}%`, `%${term}%`];
        const [results] = await db.query(query, params);
        return results;
    },
};

//=================================================================
// Controller Layer (Routes)
//=================================================================
router.get('/template', (req, res, next) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('物料导入模板');
        worksheet.columns = [
            { header: '物料编码', key: 'material_code', width: 20 },
            { header: '产品名称', key: 'name', width: 30 },
            { header: '别名', key: 'alias', width: 20 },
            { header: '规格描述', key: 'spec', width: 40 },
            { header: '物料属性', key: 'category', width: 15 },
            { header: '单位', key: 'unit', width: 10 },
            { header: '供应商', key: 'supplier', width: 25 },
            { header: '备注', key: 'remark', width: 40 }
        ];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=material_import_template.xlsx');
        workbook.xlsx.write(res).then(() => res.end());
    } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
    try {
        // 增加一个查询参数来决定是否包含已删除的，用于回收站
        const includeDeleted = req.query.includeDeleted === 'true';
        res.json(await MaterialService.getMaterials({ ...req.query, includeDeleted }));
    } catch (err) { next(err); }
});

router.post('/import', upload.single('file'), async (req, res, next) => {
    if (!req.file) {
        const err = new Error('未上传文件。');
        err.statusCode = 400;
        return next(err);
    }
    try {
        const importMode = req.query.mode || 'overwrite';
        res.status(200).json(await MaterialService.importMaterials(req.file, importMode));
    } catch (err) {
        console.error('物料导入失败:', err);
        // Let the global error handler manage the response
        next(err);
    }
});

router.post('/', async (req, res, next) => {
    try {
        res.status(201).json(await MaterialService.createMaterial(req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const error = new Error('物料编码已存在。');
            error.statusCode = 409;
            error.code = 'DUPLICATE_MATERIAL_CODE';
            next(error);
        } else {
            next(err);
        }
    }
});

router.put('/:id', async (req, res, next) => {
    try {
        res.json(await MaterialService.updateMaterial(req.params.id, req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const error = new Error('物料编码已存在。');
            error.statusCode = 409;
            error.code = 'DUPLICATE_MATERIAL_CODE';
            next(error);
        } else {
            next(err);
        }
    }
});

router.post('/delete', async (req, res, next) => {
    try {
        res.json(await MaterialService.deleteMaterials(req.body.ids));
    } catch (err) {
        console.error('软删除物料时发生错误:', err);
        next(err);
    }
});

// --- 新增恢复路由 ---
router.post('/restore', async (req, res, next) => {
    try {
        res.json(await MaterialService.restoreMaterials(req.body.ids));
    } catch (err) {
        console.error('恢复物料时发生错误:', err);
        next(err);
    }
});

router.get('/search', async (req, res, next) => {
    try {
        const { term } = req.query;
        if (!term) return res.json([]);
        // 在searchMaterials内部需要添加 where deleted_at IS NULL
        res.json(await MaterialService.searchMaterials(term));
    } catch (err) { next(err); }
});

router.post('/export', async (req, res, next) => {
    try {
        const workbook = await MaterialService.exportMaterials(req.body.ids);
        const fileName = `Materials_Export_${Date.now()}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("物料导出失败:", err);
        res.status(500).json({ error: '导出Excel文件失败。' });
    }
});

router.get('/all-ids', async (req, res, next) => {
    try {
        // 在getAllMaterialIds内部需要添加 where deleted_at IS NULL
        res.json(await MaterialService.getAllMaterialIds(req.query.search));
    } catch (err) { next(err); }
});

router.get('/:id/where-used', async (req, res, next) => {
    try {
        // where-used 应该能看到所有引用，无论父级是否被删除
        res.json(await MaterialService.getWhereUsed(req.params.id));
    } catch (err) {
        console.error('物料反查失败:', err);
        next(err);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        // 获取单个物料时，即使被删除也应该能获取到
        res.json(await MaterialService.getMaterialById(req.params.id));
    } catch (err) { next(err); }
});

module.exports = router;