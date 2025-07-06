// bom-backend/routes/suppliers.js (已增加软删除和恢复功能)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

const SupplierService = {
    // 修正查询逻辑，增加软删除过滤
    async findSuppliers({ page = 1, limit = 50, search = '' }) {
        const offset = (page - 1) * limit;
        const searchTerm = `%${search}%`;

        let whereClause = 'WHERE deleted_at IS NULL';
        const params = [];
        if (search) {
            whereClause += ' AND (name LIKE ? OR contact LIKE ?)';
            params.push(searchTerm, searchTerm);
        }

        const dataQuery = `SELECT * FROM suppliers ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`;
        const countQuery = `SELECT COUNT(*) as total FROM suppliers ${whereClause}`;

        const [suppliers] = await db.query(dataQuery, [...params, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, params);

        return { data: suppliers, hasMore: (offset + suppliers.length) < total };
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
        const result = await SupplierService.findSuppliers(req.query);
        res.json(result);
    } catch (err) {
        next(err);
    }
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
        const { ids } = req.body;
        const result = await SupplierService.deleteSuppliers(ids);
        res.json(result);
    } catch (err) {
        next(err);
    }
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