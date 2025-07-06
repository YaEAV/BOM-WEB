// bom-backend/routes/versions.js (已汉化错误提示)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

//=================================================================
// Service Layer for Versions
//=================================================================
const VersionService = {
    async getVersions({ page = 1, limit = 20, search = '', sortBy = 'created_at', sortOrder = 'desc' }) {
        const offset = (page - 1) * limit;
        const searchTerm = `%${search}%`;

        const whereClause = ' WHERE v.deleted_at IS NULL AND (v.version_code LIKE ? OR m.material_code LIKE ?)';
        const params = [searchTerm, searchTerm];

        const allowedSortBy = ['version_code', 'material_code', 'created_at'];
        const safeSortBy = allowedSortBy.includes(sortBy) ? `v.${sortBy}` : 'v.created_at';
        const safeSortOrder = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

        const dataQuery = `
            SELECT v.id, v.version_code, v.remark, v.is_active, v.created_at, v.material_id, m.material_code, m.name as material_name
            FROM bom_versions v JOIN materials m ON v.material_id = m.id
                ${whereClause}
            ORDER BY ${safeSortBy} ${safeSortOrder}
                LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) as total FROM bom_versions v JOIN materials m ON v.material_id = m.id
            ${whereClause}
        `;

        const [versions] = await db.query(dataQuery, [...params, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, params);
        return { data: versions, total, hasMore: (offset + versions.length) < total };
    },

    async getVersionsByMaterial(materialId) {
        const query = 'SELECT * FROM bom_versions WHERE material_id = ? AND deleted_at IS NULL ORDER BY version_code DESC';
        const [versions] = await db.query(query, [materialId]);
        return versions;
    },

    async createVersion(data) {
        const { material_id, version_code, remark, is_active = true } = data;
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            if (is_active) {
                await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ?', [material_id]);
            }
            const query = 'INSERT INTO bom_versions (material_id, version_code, remark, is_active) VALUES (?, ?, ?, ?)';
            const [result] = await connection.query(query, [material_id, version_code, remark, is_active]);
            await connection.commit();
            return { id: result.insertId, ...data, is_active: true };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            if (connection) connection.release();
        }
    },

    async updateVersion(id, data) {
        const { remark, is_active, material_id } = data;
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            if (is_active) {
                await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ? AND id != ?', [material_id, id]);
            }
            const query = 'UPDATE bom_versions SET remark = ?, is_active = ? WHERE id = ?';
            await connection.query(query, [remark, is_active, id]);
            await connection.commit();
            return { message: 'BOM 版本更新成功' };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            if (connection) connection.release();
        }
    },

    async deleteVersion(id) {
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            await connection.query('DELETE FROM bom_versions WHERE id = ?', [id]);
            await connection.commit();
            return { message: 'BOM version deleted successfully.' };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            if (connection) connection.release();
        }
    },

    async deleteVersions(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('需要提供一个包含ID的非空数组。');
        }
        const query = 'UPDATE bom_versions SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
        const [result] = await db.query(query, [ids]);
        return { message: `成功删除了 ${result.affectedRows} 个BOM版本。` };
    },

    // --- 新增恢复功能 ---
    async restoreVersions(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('需要提供一个包含ID的非空数组。');
        }
        const query = 'UPDATE bom_versions SET deleted_at = NULL WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功恢复了 ${result.affectedRows} 个BOM版本。`};
    },

    async getAllVersionIds(search) {
        const searchTerm = `%${search}%`;
        const params = [searchTerm, searchTerm];
        const idQuery = `
            SELECT v.id FROM bom_versions v
                                 JOIN materials m ON v.material_id = m.id
            WHERE v.version_code LIKE ? OR m.material_code LIKE ?
        `;
        const [rows] = await db.query(idQuery, params);
        return rows.map(row => row.id);
    },

    async getActiveVersionForMaterial(materialId) {
        const query = 'SELECT * FROM bom_versions WHERE material_id = ? AND is_active = true AND deleted_at IS NULL LIMIT 1';
        const [versions] = await db.query(query, [materialId]);
        return versions.length > 0 ? versions[0] : null;
    }

};

//=================================================================
// Controller Layer (Routes)
//=================================================================
router.get('/', async (req, res, next) => {
    try {
        res.json(await VersionService.getVersions(req.query));
    } catch (err) { next(err); }
});

// 新增的路由，用于检查物料是否存在激活的BOM版本
router.get('/material/:materialId/active', async (req, res, next) => {
    try {
        const activeVersion = await VersionService.getActiveVersionForMaterial(req.params.materialId);
        if (activeVersion) {
            res.json(activeVersion);
        } else {
            res.status(404).json({ error: '该物料没有找到已激活的BOM版本。' });
        }
    } catch (err) {
        next(err);
    }
});

router.get('/material/:materialId', async (req, res, next) => {
    try {
        res.json(await VersionService.getVersionsByMaterial(req.params.materialId));
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        res.status(201).json(await VersionService.createVersion(req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const customError = new Error(`版本号 "${req.body.version_code}" 已存在，请使用不同的版本号后缀。`);
            customError.statusCode = 409;
            customError.code = 'DUPLICATE_VERSION_CODE';
            next(customError);
        } else {
            next(err);
        }
    }
});

router.put('/:id', async (req, res, next) => {
    try {
        res.json(await VersionService.updateVersion(req.params.id, req.body));
    } catch (err) {
        next(err);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        res.json(await VersionService.deleteVersion(req.params.id));
    } catch (err) { next(err); }
});

router.post('/delete', async (req, res, next) => {
    try {
        res.json(await VersionService.deleteVersions(req.body.ids));
    } catch (err) { next(err); }
});

// --- 新增恢复路由 ---
router.post('/restore', async (req, res, next) => {
    try {
        res.json(await VersionService.restoreVersions(req.body.ids));
    } catch (err) { next(err); }
});

router.get('/all-ids', async (req, res, next) => {
    try {
        res.json(await VersionService.getAllVersionIds(req.query.search || ''));
    } catch (err) { next(err); }
});



module.exports = router;