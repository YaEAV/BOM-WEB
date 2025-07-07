const express = require('express');
const router = express.Router();
const db = require('../config/db');

const SupplierService = {
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
    async findSuppliers({ page = 1, limit = 50, search = '', includeDeleted = false }) {
        const offset = (page - 1) * limit;
        const { whereClause, params } = this.getSearchWhereClause(search, includeDeleted);
        const dataQuery = `SELECT * FROM suppliers ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`;
        const countQuery = `SELECT COUNT(*) as total FROM suppliers ${whereClause}`;
        const [suppliers] = await db.query(dataQuery, [...params, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, params);
        return { data: suppliers, hasMore: (offset + suppliers.length) < total };
    },
    async getAllSupplierIds(search, includeDeleted = false) {
        const { whereClause, params } = this.getSearchWhereClause(search, includeDeleted);
        // --- 核心修复：这里不需要别名，所以直接使用列名 ---
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
                const updateMaterialsQuery = 'UPDATE materials SET supplier = ? WHERE supplier = ?';
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

    // --- 将物理删除改为软删除 ---
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

    // --- 新增：物理删除功能 ---
    async deletePermanent(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('需要提供一个包含ID的非空数组。');
            err.statusCode = 400;
            throw err;
        }
        // 在删除前，将引用这些供应商的物料字段设为 NULL
        const oldSupplierNamesQuery = 'SELECT name FROM suppliers WHERE id IN (?)';
        const [suppliers] = await db.query(oldSupplierNamesQuery, [ids]);
        const supplierNames = suppliers.map(s => s.name);

        if (supplierNames.length > 0) {
            await db.query('UPDATE materials SET supplier = NULL WHERE supplier IN (?)', [supplierNames]);
        }

        const query = 'DELETE FROM suppliers WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功彻底删除 ${result.affectedRows} 个供应商。` };
    },

    // --- 新增恢复功能 ---
    async restoreSuppliers(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('需要提供一个包含ID的非空数组。');
        }
        const query = 'UPDATE suppliers SET deleted_at = NULL WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功恢复了 ${result.affectedRows} 个供应商。`};
    }
};

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

// --- 新增：物理删除路由 ---
router.post('/delete-permanent', async (req, res, next) => {
    try {
        res.json(await SupplierService.deletePermanent(req.body.ids));
    } catch (err) { next(err); }
});

// --- 新增恢复路由 ---
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