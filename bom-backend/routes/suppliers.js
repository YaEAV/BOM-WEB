// bom-backend/routes/suppliers.js (已修正)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

const SupplierService = {
    async findSuppliers({ page = 1, limit = 50, search = '' }) {
        const offset = (page - 1) * limit;
        const searchTerm = `%${search}%`;
        const whereClause = search ? 'WHERE name LIKE ? OR contact LIKE ?' : '';
        const params = search ? [searchTerm, searchTerm] : [];

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
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        const query = 'INSERT INTO suppliers (name, contact, phone, address, remark) VALUES (?, ?, ?, ?, ?)';
        const [result] = await db.query(query, [name, contact, phone, address, remark]);
        return { id: result.insertId, ...data };
    },

    // --- 关键修改：增加了事务处理来同步更新物料 ---
    async updateSupplier(id, data) {
        const { name, contact, phone, address, remark } = data;
        if (!name) {
            const err = new Error('供应商名称不能为空。');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            // 1. 获取更新前的供应商名称
            const [[oldSupplier]] = await connection.query('SELECT name FROM suppliers WHERE id = ?', [id]);
            const oldName = oldSupplier ? oldSupplier.name : null;

            // 2. 更新供应商表
            const updateSupplierQuery = 'UPDATE suppliers SET name = ?, contact = ?, phone = ?, address = ?, remark = ? WHERE id = ?';
            await connection.query(updateSupplierQuery, [name, contact, phone, address, remark, id]);

            // 3. 如果名称有变动，则同步更新物料表
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

    async deleteSuppliers(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('需要提供一个包含ID的非空数组。');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            const [result] = await connection.query('DELETE FROM suppliers WHERE id IN (?)', [ids]);
            await connection.commit();
            return { message: `成功删除了 ${result.affectedRows} 个供应商。` };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }
};

// ... Controller/路由部分保持不变 ...
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
            customError.code = 'DUPLICATE_SUPPLIER_NAME';
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
            customError.code = 'DUPLICATE_SUPPLIER_NAME';
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

module.exports = router;