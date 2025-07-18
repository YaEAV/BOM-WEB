// bom-backend/routes/materials.js (已增加空文件夹清理)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { findAndCount } = require('../utils/queryHelper');
const { validateMaterial } = require('../middleware/validators'); // 引入验证器

// --- 核心新增：清理空文件夹的辅助函数 ---
const cleanupEmptyFolders = async (directoryPath) => {
    const stopPath = path.resolve(__dirname, '..', 'uploads', 'drawings');
    let currentPath = path.resolve(directoryPath);
    if (!currentPath.startsWith(stopPath)) return;
    try {
        while (currentPath !== stopPath) {
            const files = await fs.promises.readdir(currentPath);
            if (files.length === 0) {
                await fs.promises.rmdir(currentPath);
                currentPath = path.dirname(currentPath);
            } else {
                break;
            }
        }
    } catch (error) {
        console.error(`Error cleaning up folder ${currentPath}:`, error);
    }
};

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const MaterialService = {
    getSearchWhereClause(search, includeDeleted = false) {
        let whereClause = includeDeleted
            ? ' WHERE m.deleted_at IS NOT NULL'
            : ' WHERE m.deleted_at IS NULL';
        let params = [];
        if (search) {
            const searchTerm = `%${search}%`;
            whereClause += ' AND (m.material_code LIKE ? OR m.name LIKE ? OR m.alias LIKE ?)';
            params.push(searchTerm, searchTerm, searchTerm);
        }
        return { whereClause, params };
    },

    async getMaterials(options) {
        const baseQuery = 'SELECT m.* FROM materials m';
        const countQuery = 'SELECT COUNT(*) as total FROM materials m';
        const queryOptions = {
            ...options,
            searchFields: ['m.material_code', 'm.name', 'm.spec', 'm.supplier'],
            allowedSortBy: ['material_code', 'name', 'category', 'supplier', 'deleted_at'],
            deletedAtField: 'm.deleted_at'
        };
        return findAndCount(db, baseQuery, countQuery, queryOptions);
    },

    async getAllMaterialIds(search, includeDeleted = false) {
        const { whereClause, params } = this.getSearchWhereClause(search, includeDeleted);
        const idQuery = `SELECT id FROM materials m ${whereClause}`;
        const [rows] = await db.query(idQuery, params);
        return rows.map(row => row.id);
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

    // --- 核心修改：增加删除BOM版本的逻辑 ---
    async deletePermanent(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('必须提供一个ID数组。');
            err.statusCode = 400;
            throw err;
        }

        const connection = await db.getConnection();
        const uniqueFolders = new Set();
        await connection.beginTransaction();

        try {
            // 1. 查找并删除与物料关联的图纸文件
            const [drawings] = await connection.query('SELECT file_path FROM material_drawings WHERE material_id IN (?)', [ids]);
            for (const drawing of drawings) {
                if (drawing.file_path) {
                    const filePath = path.resolve(__dirname, '..', drawing.file_path);
                    uniqueFolders.add(path.dirname(filePath));
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
            }
            if (drawings.length > 0) {
                await connection.query('DELETE FROM material_drawings WHERE material_id IN (?)', [ids]);
            }

            // 2.【新增】查找与物料关联的所有BOM版本
            const [versions] = await connection.query('SELECT id FROM bom_versions WHERE material_id IN (?)', [ids]);
            if (versions.length > 0) {
                const versionIds = versions.map(v => v.id);
                // 3.【新增】删除这些BOM版本下的所有BOM行
                await connection.query('DELETE FROM bom_lines WHERE version_id IN (?)', [versionIds]);
                // 4.【新增】删除这些BOM版本本身
                await connection.query('DELETE FROM bom_versions WHERE id IN (?)', [versionIds]);
            }

            // 5. 删除物料本身
            const [result] = await connection.query('DELETE FROM materials WHERE id IN (?)', [ids]);
            await connection.commit();

            // 6. 清理空的图纸文件夹
            for (const folder of uniqueFolders) {
                await cleanupEmptyFolders(folder);
            }

            return { message: `成功彻底删除 ${result.affectedRows} 个物料及其所有关联的BOM和图纸。` };
        } catch (error) {
            await connection.rollback();
            // 捕获外键约束错误
            if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                const customError = new Error('删除失败：一个或多个物料可能仍被其他BOM作为子件引用。请先处理这些BOM。');
                customError.statusCode = 409;
                throw customError;
            }
            throw error;
        } finally {
            if (connection) connection.release();
        }
    },

    // ... (其余代码保持不变) ...
    async deleteMaterials(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('必须提供一个ID数组。');
            err.statusCode = 400;
            throw err;
        }
        const query = 'UPDATE materials SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
        const [result] = await db.query(query, [ids]);
        return { message: `成功删除 ${result.affectedRows} 个物料。` };
    },

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

            let newCount = 0;
            let updatedCount = 0;

            for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
                const row = worksheet.getRow(rowNumber);
                const getCellValue = (colName) => {
                    const cell = row.getCell(columnIndexMap[colName]);
                    // 只有当单元格确实有值时才返回值，否则返回undefined
                    if (cell && cell.value !== null && cell.value !== undefined) {
                        const value = cell.value.result || cell.value;
                        return String(value).trim();
                    }
                    return undefined;
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

                if (!materialData.material_code) continue;

                // 基础验证
                if (!materialData.name) errors.push({ row: rowNumber, message: '产品名称不能为空。' });
                if (!materialData.unit) errors.push({ row: rowNumber, message: '单位不能为空。' });
                if (materialData.unit && !unitSet.has(materialData.unit)) errors.push({ row: rowNumber, message: `单位 "${materialData.unit}" 不存在。` });
                if (materialData.supplier && !supplierSet.has(materialData.supplier)) errors.push({ row: rowNumber, message: `供应商 "${materialData.supplier}" 不存在。` });

                if (errors.length > 0) continue; // 如果当前行有错，跳过后续数据库操作

                const [existing] = await connection.query('SELECT * FROM materials WHERE material_code = ?', [materialData.material_code]);

                if (existing.length > 0) { // 物料已存在，执行更新
                    if(importMode === 'incremental') continue; // 增量模式下跳过已存在的

                    const existingMaterial = existing[0];
                    const updates = {};
                    // 遍历从Excel读取的数据，只有当值不为undefined时，才加入更新对象
                    for (const key in materialData) {
                        if (materialData[key] !== undefined && materialData[key] !== existingMaterial[key]) {
                            updates[key] = materialData[key];
                        }
                    }

                    if (Object.keys(updates).length > 0) {
                        const updateQuery = 'UPDATE materials SET ? WHERE material_code = ?';
                        await connection.query(updateQuery, [updates, materialData.material_code]);
                        updatedCount++;
                    }
                } else { // 物料不存在，执行新增
                    const insertData = {};
                    for(const key in materialData) {
                        if (materialData[key] !== undefined) {
                            insertData[key] = materialData[key];
                        }
                    }
                    const query = 'INSERT INTO materials SET ?';
                    await connection.query(query, insertData);
                    newCount++;
                }
            }

            if (errors.length > 0) {
                throw { statusCode: 400, message: '导入文件中存在错误。', errors };
            }

            await connection.commit();
            let message = `导入完成：新增 ${newCount} 条，更新 ${updatedCount} 条。`;
            if (importMode === 'incremental') {
                message = `增量导入完成：成功新增 ${newCount} 条物料。`;
            }
            return { message };

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            if (connection) connection.release();
        }
    },

    async getWhereUsed(id) {
        const query = `
            SELECT DISTINCT p.id AS parent_material_id, p.material_code AS parent_material_code, p.name AS parent_name,
                            v.id AS version_id, v.version_code, v.is_active
            FROM bom_lines bl JOIN bom_versions v ON bl.version_id = v.id JOIN materials p ON v.material_id = p.id
            WHERE bl.component_id = ? AND v.deleted_at IS NULL AND bl.deleted_at IS NULL
            ORDER BY p.material_code, v.version_code;
        `;
        const [results] = await db.query(query, [id]);
        return results;
    },

    async searchMaterials(term) {
        const query = `
            SELECT id, material_code, name, spec, unit
            FROM materials
            WHERE (material_code LIKE ? OR name LIKE ?) AND deleted_at IS NULL
                LIMIT 15
        `;
        const params = [`%${term}%`, `%${term}%`];
        const [results] = await db.query(query, params);
        return results;
    },

    async exportMaterials(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('必须提供一个ID数组来进行导出。');
        }
        const query = 'SELECT * FROM materials WHERE id IN (?)';
        const [materials] = await db.query(query, [ids]);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Materials');
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
        worksheet.addRows(materials);
        return workbook;
    }
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
        const includeDeleted = req.query.includeDeleted === 'true';
        res.json(await MaterialService.getMaterials({ ...req.query, includeDeleted }));
    } catch (err) { next(err); }
});

router.get('/all-ids', async (req, res, next) => {
    try {
        const includeDeleted = req.query.includeDeleted === 'true';
        const ids = await MaterialService.getAllMaterialIds(req.query.search, includeDeleted);
        res.json(ids);
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
        next(err);
    }
});

router.post('/export', async (req, res, next) => {
    try {
        const { ids } = req.body;
        const workbook = await MaterialService.exportMaterials(ids);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Materials_Export_${Date.now()}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        next(err);
    }
});

router.post('/', validateMaterial, async (req, res, next) => {
    try {
        res.status(201).json(await MaterialService.createMaterial(req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const error = new Error('物料编码已存在。');
            error.statusCode = 409;
            next(error);
        } else {
            next(err);
        }
    }
});

router.put('/:id', validateMaterial, async (req, res, next) => {
    try {
        res.json(await MaterialService.updateMaterial(req.params.id, req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const error = new Error('物料编码已存在。');
            error.statusCode = 409;
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

router.post('/delete-permanent', async (req, res, next) => {
    try {
        res.json(await MaterialService.deletePermanent(req.body.ids));
    } catch (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            const customError = new Error('删除失败：所选物料可能仍被其他数据引用，请先处理关联数据。');
            customError.statusCode = 409;
            return next(customError);
        }
        next(err);
    }
});

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
        res.json(await MaterialService.searchMaterials(term));
    } catch (err) { next(err); }
});

router.get('/:id/where-used', async (req, res, next) => {
    try {
        res.json(await MaterialService.getWhereUsed(req.params.id));
    } catch (err) {
        console.error('物料反查失败:', err);
        next(err);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        res.json(await MaterialService.getMaterialById(req.params.id));
    } catch (err) { next(err); }
});

module.exports = router;