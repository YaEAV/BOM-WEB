// bom-backend/routes/suppliers.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { findAndCount } = require('../utils/queryHelper');
const { validateSupplier } = require('../middleware/validators');

const SupplierService = {
    async findSuppliers(options) {
        const baseQuery = 'SELECT * FROM suppliers';
        const countQuery = 'SELECT COUNT(*) as total FROM suppliers';
        return findAndCount(db, baseQuery, countQuery, {
            ...options,
            searchFields: ['name', 'contact'],
            allowedSortBy: ['name', 'contact', 'phone', 'deleted_at'],
        });
    },
    async createSupplier(data) {
        const { name, contact, phone, address, remark } = data;
        const query = 'INSERT INTO suppliers (name, contact, phone, address, remark) VALUES (?, ?, ?, ?, ?)';
        const [result] = await db.query(query, [name, contact, phone, address, remark]);
        return { id: result.insertId, ...data };
    },
    async updateSupplier(id, data) {
        const { name, contact, phone, address, remark } = data;
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            const [[oldSupplier]] = await connection.query('SELECT name FROM suppliers WHERE id = ?', [id]);
            const oldName = oldSupplier ? oldSupplier.name : null;
            const updateSupplierQuery = 'UPDATE suppliers SET name = ?, contact = ?, phone = ?, address = ?, remark = ? WHERE id = ?';
            await connection.query(updateSupplierQuery, [name, contact, phone, address, remark, id]);
            if (oldName && oldName !== name) {
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
        if (!ids || !Array.isArray(ids) || ids.length === 0) throw new Error('需要提供ID数组。');
        const query = 'UPDATE suppliers SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
        const [result] = await db.query(query, [ids]);
        return { message: `成功删除了 ${result.affectedRows} 个供应商。` };
    },
    async deletePermanent(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) throw new Error('需要提供ID数组。');
        const oldSupplierNamesQuery = 'SELECT name FROM suppliers WHERE id IN (?)';
        const [suppliers] = await db.query(oldSupplierNamesQuery, [ids]);
        const supplierNames = suppliers.map(s => s.name);
        if (supplierNames.length > 0) {
            const checkUsageQuery = 'SELECT COUNT(*) as count FROM materials WHERE supplier IN (?) COLLATE utf8mb4_unicode_ci';
            const [[{ count }]] = await db.query(checkUsageQuery, [supplierNames]);
            if (count > 0) {
                const err = new Error('彻底删除失败：一个或多个供应商仍被物料使用。');
                err.statusCode = 409; throw err;
            }
        }
        const query = 'DELETE FROM suppliers WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功彻底删除 ${result.affectedRows} 个供应商。` };
    },
    async restoreSuppliers(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) throw new Error('需要提供ID数组。');
        const query = 'UPDATE suppliers SET deleted_at = NULL WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功恢复了 ${result.affectedRows} 个供应商。`};
    }
};

router.get('/', async (req, res, next) => {
    try {
        res.json(await SupplierService.findSuppliers({ ...req.query, includeDeleted: req.query.includeDeleted === 'true' }));
    } catch (err) { next(err); }
});

router.post('/', validateSupplier, async (req, res, next) => {
    try {
        res.status(201).json(await SupplierService.createSupplier(req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') next(new Error(`供应商名称 "${req.body.name}" 已存在。`));
        else next(err);
    }
});

router.put('/:id', validateSupplier, async (req, res, next) => {
    try {
        res.json(await SupplierService.updateSupplier(req.params.id, req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') next(new Error(`供应商名称 "${req.body.name}" 已存在。`));
        else next(err);
    }
});

router.post('/delete', async (req, res, next) => {
    try { res.json(await SupplierService.deleteSuppliers(req.body.ids)); } catch (err) { next(err); }
});
router.post('/delete-permanent', async (req, res, next) => {
    try { res.json(await SupplierService.deletePermanent(req.body.ids)); } catch (err) { next(err); }
});
router.post('/restore', async (req, res, next) => {
    try { res.json(await SupplierService.restoreSuppliers(req.body.ids)); } catch (err) { next(err); }
});

module.exports = router;