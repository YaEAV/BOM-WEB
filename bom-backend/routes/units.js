// bom-backend/routes/units.js (已增加软删除和恢复功能)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

const UnitService = {
    // 修正查询逻辑
    async findUnits({ page = 1, limit = 50, search = '' }) {
        const offset = (page - 1) * limit;
        const searchTerm = `%${search}%`;

        let whereClause = 'WHERE deleted_at IS NULL';
        const params = [];
        if (search) {
            whereClause += ' AND name LIKE ?';
            params.push(searchTerm);
        }

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
            const [[oldUnit]] = await connection.query('SELECT name FROM units WHERE id = ?', [id]);
            const oldName = oldUnit ? oldUnit.name : null;

            await connection.query('UPDATE units SET name = ? WHERE id = ?', [name, id]);

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

    // --- 将物理删除改为软删除 ---
    async deleteUnits(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('需要提供ID数组。');
        }

        const checkUsageQuery = 'SELECT COUNT(*) as count FROM materials WHERE unit IN (SELECT name FROM units WHERE id IN (?)) AND deleted_at IS NULL';
        const [[{ count }]] = await db.query(checkUsageQuery, [ids]);
        if (count > 0) {
            const err = new Error('删除失败：所选单位正在被一个或多个物料使用。');
            err.statusCode = 409;
            throw err;
        }

        const query = 'UPDATE units SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
        const [result] = await db.query(query, [ids]);
        return { message: `成功删除 ${result.affectedRows} 个单位。` };
    },

    // --- 新增恢复功能 ---
    async restoreUnits(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('需要提供一个包含ID的非空数组。');
        }
        const query = 'UPDATE units SET deleted_at = NULL WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功恢复了 ${result.affectedRows} 个单位。`};
    }
};

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
            next(new Error(`单位名称 "${req.body.name}" 已存在。`));
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
            next(new Error(`单位名称 "${req.body.name}" 已存在。`));
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

// --- 新增恢复路由 ---
router.post('/restore', async (req, res, next) => {
    try {
        res.json(await UnitService.restoreUnits(req.body.ids));
    } catch (err) {
        next(err);
    }
});

module.exports = router;