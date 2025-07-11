// bom-backend/routes/suppliers.js (已修正)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { findAndCount } = require('../utils/queryHelper');

const SupplierService = {
    // ... getSearchWhereClause, findSuppliers, getAllSupplierIds, createSupplier 函数保持不变 ...
    getSearchWhereClause(search, includeDeleted = false) {
        let whereClause = includeDeleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
        const params = [];
        if (search) {
            const searchTerm = `%${search}%`;
            whereClause += ' AND (name LIKE ? OR contact LIKE ?)';
            params.push(searchTerm, searchTerm);
        }
        return { whereClause, params };
    },
    async findSuppliers(options) {
        const baseQuery = 'SELECT * FROM suppliers';
        const countQuery = 'SELECT COUNT(*) as total FROM suppliers';
        const queryOptions = {
            ...options,
            searchFields: ['name', 'contact'],
            allowedSortBy: ['name', 'contact', 'phone', 'deleted_at'],
            defaultSortBy: 'name'
        };
        return findAndCount(db, baseQuery, countQuery, queryOptions);
    },
    async getAllSupplierIds(search, includeDeleted = false) {
        const { whereClause, params } = this.getSearchWhereClause(search, includeDeleted);
        const idQuery = `SELECT id FROM suppliers ${whereClause}`;
        const [rows] = await db.query(idQuery, params);
        return rows.map(row => row.id);
    },
    async createSupplier(data) {
        const { name, contact, phone, address, remark } = data;
        if (!name) {
            const err = new Error('供应商名称不能为空。');
            err.statusCode = 400;
            throw err;
        }
        const query = 'INSERT INTO suppliers (name, contact, phone, address, remark) VALUES (?, ?, ?, ?, ?)';
        const [result] = await db.query(query, [name, contact, phone, address, remark]);
        return { id: result.insertId, ...data };
    },
    async updateSupplier(id, data) {
        const { name, contact, phone, address, remark } = data;
        if (!name) {
            const err = new Error('供应商名称不能为空。');
            err.statusCode = 400;
            throw err;
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            const [[oldSupplier]] = await connection.query('SELECT name FROM suppliers WHERE id = ?', [id]);
            const oldName = oldSupplier ? oldSupplier.name : null;

            const updateSupplierQuery = 'UPDATE suppliers SET name = ?, contact = ?, phone = ?, address = ?, remark = ? WHERE id = ?';
            await connection.query(updateSupplierQuery, [name, contact, phone, address, remark, id]);

            if (oldName && oldName !== name) {
                // --- 核心修改：在比较时指定 collation ---
                const updateMaterialsQuery = 'UPDATE materials SET supplier = ? WHERE supplier = ? COLLATE utf8mb4_unicode_ci';
                await connection.query(updateMaterialsQuery, [name, oldName]);
            }

            await connection.commit();
            return { message: '供应商更新成功' };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    },

    async deleteSuppliers(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('需要提供一个包含ID的非空数组。');
            err.statusCode = 400;
            throw err;
        }
        const query = 'UPDATE suppliers SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
        const [result] = await db.query(query, [ids]);
        return { message: `成功删除了 ${result.affectedRows} 个供应商。` };
    },

    async deletePermanent(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('需要提供一个包含ID的非空数组。');
            err.statusCode = 400;
            throw err;
        }

        const oldSupplierNamesQuery = 'SELECT name FROM suppliers WHERE id IN (?)';
        const [suppliers] = await db.query(oldSupplierNamesQuery, [ids]);
        const supplierNames = suppliers.map(s => s.name);

        if (supplierNames.length > 0) {
            // --- 核心修改：在比较时指定 collation ---
            const checkUsageQuery = 'SELECT COUNT(*) as count FROM materials WHERE supplier IN (?) COLLATE utf8mb4_unicode_ci';
            const [[{ count }]] = await db.query(checkUsageQuery, [supplierNames]);
            if (count > 0) {
                const err = new Error('彻底删除失败：一个或多个供应商仍被物料使用，即使是回收站中的物料。');
                err.statusCode = 409;
                throw err;
            }
        }

        const query = 'DELETE FROM suppliers WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功彻底删除 ${result.affectedRows} 个供应商。` };
    },
};

// ... (路由部分保持不变) ...
router.get('/', async (req, res, next) => {
    try {
        const includeDeleted = req.query.includeDeleted === 'true';
        res.json(await SupplierService.findSuppliers({ ...req.query, includeDeleted }));
    } catch (err) { next(err); }
});
router.get('/all-ids', async (req, res, next) => {
    try {
        const includeDeleted = req.query.includeDeleted === 'true';
        const ids = await SupplierService.getAllSupplierIds(req.query.search, includeDeleted);
        res.json(ids);
    } catch (err) { next(err); }
});
router.post('/', async (req, res, next) => {
    try {
        const newSupplier = await SupplierService.createSupplier(req.body);
        res.status(201).json(newSupplier);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const customError = new Error(`供应商名称 "${req.body.name}" 已存在，请勿重复添加。`);
            customError.statusCode = 409;
            next(customError);
        } else {
            next(err);
        }
    }
});
router.put('/:id', async (req, res, next) => {
    try {
        const result = await SupplierService.updateSupplier(req.params.id, req.body);
        res.json(result);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const customError = new Error(`供应商名称 "${req.body.name}" 已存在，请检查其他供应商。`);
            customError.statusCode = 409;
            next(customError);
        } else {
            next(err);
        }
    }
});
router.post('/delete', async (req, res, next) => {
    try {
        res.json(await SupplierService.deleteSuppliers(req.body.ids));
    } catch (err) {
        next(err);
    }
});
router.post('/delete-permanent', async (req, res, next) => {
    try {
        res.json(await SupplierService.deletePermanent(req.body.ids));
    } catch (err) { next(err); }
});
router.post('/restore', async (req, res, next) => {
    try {
        const { ids } = req.body;
        const result = await SupplierService.restoreSuppliers(ids);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

module.exports = router;