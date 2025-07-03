// bom-backend/routes/units.js (已修正)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

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
        if (!name) {
            const err = new Error('单位名称不能为空。');
            err.statusCode = 400;
            throw err;
        }
        const [result] = await db.query('INSERT INTO units (name) VALUES (?)', [name]);
        return { id: result.insertId, ...data };
    },

    // --- 关键修改：增加了事务处理来同步更新物料 ---
    async updateUnit(id, data) {
        const { name } = data;
        if (!name) {
            const err = new Error('单位名称不能为空。');
            err.statusCode = 400;
            throw err;
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            // 1. 获取更新前的单位名称
            const [[oldUnit]] = await connection.query('SELECT name FROM units WHERE id = ?', [id]);
            const oldName = oldUnit ? oldUnit.name : null;

            // 2. 更新单位表
            await connection.query('UPDATE units SET name = ? WHERE id = ?', [name, id]);

            // 3. 如果名称有变动，则同步更新物料表
            if (oldName && oldName !== name) {
                const updateMaterialsQuery = 'UPDATE materials SET unit = ? WHERE unit = ?';
                await connection.query(updateMaterialsQuery, [name, oldName]);
            }

            await connection.commit();
            return { message: '单位更新成功' };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    },

    async deleteUnits(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const err = new Error('需要提供ID数组。');
            err.statusCode = 400;
            throw err;
        }
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            const [result] = await connection.query('DELETE FROM units WHERE id IN (?)', [ids]);
            await connection.commit();
            return { message: `成功删除 ${result.affectedRows} 个单位。` };
        } catch (error) {
            await connection.rollback();
            if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                const customError = new Error('删除失败：所选单位正在被一个或多个物料使用。');
                customError.statusCode = 409;
                throw customError;
            }
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }
};

// ... Controller/路由部分保持不变 ...
router.get('/', async (req, res, next) => {
    try {
        res.json(await UnitService.findUnits(req.query));
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        res.status(201).json(await UnitService.createUnit(req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const customError = new Error(`单位名称 "${req.body.name}" 已存在。`);
            customError.statusCode = 409;
            next(customError);
        } else {
            next(err);
        }
    }
});

router.put('/:id', async (req, res, next) => {
    try {
        res.json(await UnitService.updateUnit(req.params.id, req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const customError = new Error(`单位名称 "${req.body.name}" 已存在。`);
            customError.statusCode = 409;
            next(customError);
        } else {
            next(err);
        }
    }
});

router.post('/delete', async (req, res, next) => {
    try {
        res.json(await UnitService.deleteUnits(req.body.ids));
    } catch (err) {
        next(err);
    }
});

module.exports = router;