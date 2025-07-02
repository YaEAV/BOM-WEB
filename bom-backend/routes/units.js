// routes/units.js (已重构并添加搜索功能)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Service Layer
const UnitService = {
    async findUnits({ page = 1, limit = 50, search = '' }) {
        const offset = (page - 1) * limit;
        const searchTerm = `%${search}%`;
        const whereClause = search ? 'WHERE name LIKE ?' : '';
        const params = search ? [searchTerm] : [];

        const dataQuery = `SELECT * FROM units ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`;
        const countQuery = `SELECT COUNT(*) as total FROM units ${whereClause}`;

        const [units] = await db.query(dataQuery, [...params, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, params);

        return { data: units, hasMore: (offset + units.length) < total };
    },
    async createUnit(data) {
        const { name } = data;
        if (!name) throw new Error('单位名称不能为空。');
        const [result] = await db.query('INSERT INTO units (name) VALUES (?)', [name]);
        return { id: result.insertId, ...data };
    },
    async updateUnit(id, data) {
        const { name } = data;
        if (!name) throw new Error('单位名称不能为空。');
        await db.query('UPDATE units SET name = ? WHERE id = ?', [name, id]);
        return { message: '单位更新成功' };
    },
    async deleteUnits(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('需要提供ID数组。');
        }
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            const [result] = await connection.query('DELETE FROM units WHERE id IN (?)', [ids]);
            await connection.commit();
            return { message: `成功删除 ${result.affectedRows} 个单位。` };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }
};

// Controller Layer
router.get('/', async (req, res, next) => {
    try {
        res.json(await UnitService.findUnits(req.query));
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        res.status(201).json(await UnitService.createUnit(req.body));
    } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
    try {
        res.json(await UnitService.updateUnit(req.params.id, req.body));
    } catch (err) { next(err); }
});

router.post('/delete', async (req, res, next) => {
    try {
        res.json(await UnitService.deleteUnits(req.body.ids));
    } catch (err) { next(err); }
});


module.exports = router;