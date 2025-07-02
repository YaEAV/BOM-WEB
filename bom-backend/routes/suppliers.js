// routes/suppliers.js (已重构)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// =================================================================
// Service Layer (在实际项目中, 这部分会拆分到 'services/supplierService.js')
// =================================================================
const SupplierService = {
    // 增加分页和搜索功能
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

    async updateSupplier(id, data) {
        const { name, contact, phone, address, remark } = data;
        if (!name) {
            const err = new Error('供应商名称不能为空。');
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
        }
        const query = 'UPDATE suppliers SET name = ?, contact = ?, phone = ?, address = ?, remark = ? WHERE id = ?';
        await db.query(query, [name, contact, phone, address, remark, id]);
        return { message: '供应商更新成功' };
    },

    // 使用事务进行批量删除
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
            // 检查供应商是否被物料引用 (可选，但推荐)
            // const [usage] = await connection.query('SELECT 1 FROM materials WHERE supplier IN (SELECT name FROM suppliers WHERE id IN (?)) LIMIT 1', [ids]);
            // if (usage.length > 0) {
            //     throw new Error('无法删除，因为至少有一个供应商正在被物料使用。');
            // }

            const [result] = await connection.query('DELETE FROM suppliers WHERE id IN (?)', [ids]);
            await connection.commit();
            return { message: `成功删除了 ${result.affectedRows} 个供应商。` };
        } catch (error) {
            await connection.rollback();
            throw error; // 抛出错误给全局错误处理器
        } finally {
            if (connection) connection.release();
        }
    }
};

// =================================================================
// Controller Layer (路由保持清晰)
// =================================================================
router.get('/', async (req, res, next) => {
    try {
        const result = await SupplierService.findSuppliers(req.query);
        res.json(result);
    } catch (err) {
        next(err); // 传递给错误处理中间件
    }
});

router.post('/', async (req, res, next) => {
    try {
        const newSupplier = await SupplierService.createSupplier(req.body);
        res.status(201).json(newSupplier);
    } catch (err) {
        next(err);
    }
});

router.put('/:id', async (req, res, next) => {
    try {
        const result = await SupplierService.updateSupplier(req.params.id, req.body);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// 新增的批量删除路由
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