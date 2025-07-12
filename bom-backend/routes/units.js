// bom-backend/routes/units.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { findAndCount } = require('../utils/queryHelper');
const { validateUnit } = require('../middleware/validators');

const UnitService = {
    async findUnits(options) {
        const baseQuery = 'SELECT * FROM units';
        const countQuery = 'SELECT COUNT(*) as total FROM units';
        return findAndCount(db, baseQuery, countQuery, {
            ...options,
            searchFields: ['name'],
            allowedSortBy: ['name', 'deleted_at'],
        });
    },
    async getAllUnitIds(search, includeDeleted = false) {
        const { whereClause, params } = this.getSearchWhereClause(search, includeDeleted);
        const idQuery = `SELECT id FROM units ${whereClause}`;
        const [rows] = await db.query(idQuery, params);
        return rows.map(row => row.id);
    },
    async createUnit(data) {
        const { name } = data;
        const [result] = await db.query('INSERT INTO units (name) VALUES (?)', [name]);
        return { id: result.insertId, ...data };
    },
    async updateUnit(id, data) {
        const { name } = data;
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            const [[oldUnit]] = await connection.query('SELECT name FROM units WHERE id = ?', [id]);
            const oldName = oldUnit ? oldUnit.name : null;
            await connection.query('UPDATE units SET name = ? WHERE id = ?', [name, id]);
            if (oldName && oldName !== name) {
                const updateMaterialsQuery = 'UPDATE materials SET unit = ? WHERE unit = ? COLLATE utf8mb4_unicode_ci';
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
        if (!ids || !Array.isArray(ids) || ids.length === 0) throw new Error('需要提供ID数组。');
        const checkUsageQuery = 'SELECT COUNT(*) as count FROM materials WHERE unit IN (SELECT name COLLATE utf8mb4_unicode_ci FROM units WHERE id IN (?)) AND deleted_at IS NULL';
        const [[{ count }]] = await db.query(checkUsageQuery, [ids]);
        if (count > 0) {
            const err = new Error('删除失败：所选单位正在被一个或多个物料使用。');
            err.statusCode = 409; throw err;
        }
        const query = 'UPDATE units SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
        const [result] = await db.query(query, [ids]);
        return { message: `成功删除 ${result.affectedRows} 个单位。` };
    },
    async deletePermanent(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) throw new Error('需要提供ID数组。');
        const checkUsageQuery = 'SELECT COUNT(*) as count FROM materials WHERE unit IN (SELECT name COLLATE utf8mb4_unicode_ci FROM units WHERE id IN (?))';
        const [[{ count }]] = await db.query(checkUsageQuery, [ids]);
        if (count > 0) {
            const err = new Error('删除失败：一个或多个单位仍被物料使用，即使是回收站中的物料。');
            err.statusCode = 409; throw err;
        }
        const query = 'DELETE FROM units WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功彻底删除 ${result.affectedRows} 个单位。` };
    },
    async restoreUnits(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) throw new Error('需要提供一个包含ID的非空数组。');
        const query = 'UPDATE units SET deleted_at = NULL WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功恢复了 ${result.affectedRows} 个单位。`};
    }
};

router.get('/', async (req, res, next) => {
    try {
        res.json(await UnitService.findUnits({ ...req.query, includeDeleted: req.query.includeDeleted === 'true' }));
    } catch (err) { next(err); }
});

router.post('/', validateUnit, async (req, res, next) => {
    try {
        res.status(201).json(await UnitService.createUnit(req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') next(new Error(`单位名称 "${req.body.name}" 已存在。`));
        else next(err);
    }
});

router.put('/:id', validateUnit, async (req, res, next) => {
    try {
        res.json(await UnitService.updateUnit(req.params.id, req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') next(new Error(`单位名称 "${req.body.name}" 已存在。`));
        else next(err);
    }
});

router.post('/delete', async (req, res, next) => {
    try { res.json(await UnitService.deleteUnits(req.body.ids)); } catch (err) { next(err); }
});
router.post('/delete-permanent', async (req, res, next) => {
    try { res.json(await UnitService.deletePermanent(req.body.ids)); } catch (err) { next(err); }
});
router.post('/restore', async (req, res, next) => {
    try { res.json(await UnitService.restoreUnits(req.body.ids)); } catch (err) { next(err); }
});

module.exports = router;