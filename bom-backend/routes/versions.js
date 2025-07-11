// bom-backend/routes/versions.js (已修复复制和激活逻辑)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

const VersionService = {
    // ... (getVersions, getAllVersionIds, getVersionsByMaterial 等函数保持不变) ...
    async getVersions({ page = 1, limit = 20, search = '', sortBy = 'created_at', sortOrder = 'desc', includeDeleted = false }) {
        const offset = (page - 1) * limit;
        const searchTerm = `%${search}%`;
        let whereClause = includeDeleted
            ? ' WHERE v.deleted_at IS NOT NULL'
            : ' WHERE v.deleted_at IS NULL';
        if (search) {
            whereClause += ' AND (v.version_code LIKE ? OR m.material_code LIKE ?)';
        }
        const params = search ? [searchTerm, searchTerm] : [];
        const allowedSortBy = ['version_code', 'material_code', 'created_at', 'deleted_at'];
        const safeSortBy = allowedSortBy.includes(sortBy) ? `v.${sortBy}` : 'v.created_at';
        const safeSortOrder = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        const dataQuery = `
            SELECT v.id, v.version_code, v.remark, v.is_active, v.created_at, v.deleted_at, v.material_id, m.material_code, m.name as material_name
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

    async getAllVersionIds(search, includeDeleted = false) {
        let whereClause = includeDeleted
            ? 'WHERE v.deleted_at IS NOT NULL'
            : 'WHERE v.deleted_at IS NULL';
        const params = [];
        if (search) {
            const searchTerm = `%${search}%`;
            whereClause += ' AND (v.version_code LIKE ? OR m.material_code LIKE ?)';
            params.push(searchTerm, searchTerm);
        }
        const idQuery = `
            SELECT v.id FROM bom_versions v JOIN materials m ON v.material_id = m.id
                ${whereClause}
        `;
        const [rows] = await db.query(idQuery, params);
        return rows.map(row => row.id);
    },

    async getVersionsByMaterial(materialId) {
        const query = 'SELECT * FROM bom_versions WHERE material_id = ? AND deleted_at IS NULL ORDER BY version_code DESC';
        const [versions] = await db.query(query, [materialId]);
        return versions;
    },

    // --- 核心修复：复制BOM版本的服务逻辑 ---
    async copyVersion(originalVersionId, newData) {
        const { version_suffix, remark, is_active } = newData; // <-- 接收 is_active 参数
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const [[originalVersion]] = await connection.query('SELECT * FROM bom_versions WHERE id = ?', [originalVersionId]);
            if (!originalVersion) {
                throw new Error('原始BOM版本不存在。');
            }

            const [[material]] = await connection.query('SELECT material_code FROM materials WHERE id = ?', [originalVersion.material_id]);
            const newVersionCode = `${material.material_code}_V${version_suffix}`;

            // 如果新版本要被激活，则先将该物料的其他所有版本设为未激活
            if (is_active) {
                await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ?', [originalVersion.material_id]);
            }

            const [newVersionResult] = await connection.query(
                'INSERT INTO bom_versions (material_id, version_code, remark, is_active) VALUES (?, ?, ?, ?)',
                [originalVersion.material_id, newVersionCode, remark, is_active]
            );
            const newVersionId = newVersionResult.insertId;

            // --- 核心修复：查询条件从 level=1 改为 parent_line_id IS NULL，更准确 ---
            const [topLevelLines] = await connection.query(
                'SELECT * FROM bom_lines WHERE version_id = ? AND parent_line_id IS NULL AND deleted_at IS NULL',
                [originalVersionId]
            );

            if (topLevelLines.length > 0) {
                const lineInsertQuery = `
                    INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark)
                    VALUES ?
                `;
                const lineValues = topLevelLines.map(line => [
                    newVersionId,
                    null,
                    line.level,
                    line.position_code,
                    line.component_id,
                    line.quantity,
                    line.process_info,
                    line.remark
                ]);
                await connection.query(lineInsertQuery, [lineValues]);
            }

            await connection.commit();

            const [[newVersion]] = await connection.query('SELECT * FROM bom_versions WHERE id = ?', [newVersionId]);
            return newVersion;

        } catch (err) {
            await connection.rollback();
            if (err.code === 'ER_DUP_ENTRY') {
                const customError = new Error(`新的版本号后缀 "${version_suffix}" 已存在，请使用不同的后缀。`);
                customError.statusCode = 409;
                throw customError;
            }
            throw err;
        } finally {
            if (connection) connection.release();
        }
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

    async deletePermanent(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('需要提供一个包含ID的非空数组。');
        }
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            await connection.query('DELETE FROM bom_lines WHERE version_id IN (?)', [ids]);
            const [result] = await connection.query('DELETE FROM bom_versions WHERE id IN (?)', [ids]);
            await connection.commit();
            return { message: `成功彻底删除 ${result.affectedRows} 个BOM版本及其所有物料行。` };
        } catch(err) {
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

    async restoreVersions(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('需要提供一个包含ID的非空数组。');
        }
        const query = 'UPDATE bom_versions SET deleted_at = NULL WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功恢复了 ${result.affectedRows} 个BOM版本。`};
    },

    async getActiveVersionForMaterial(materialId) {
        const query = 'SELECT * FROM bom_versions WHERE material_id = ? AND is_active = true AND deleted_at IS NULL LIMIT 1';
        const [versions] = await db.query(query, [materialId]);
        return versions.length > 0 ? versions[0] : null;
    }
};

// ... (所有路由部分保持不变) ...
router.get('/', async (req, res, next) => {
    try {
        const includeDeleted = req.query.includeDeleted === 'true';
        res.json(await VersionService.getVersions({ ...req.query, includeDeleted }));
    } catch (err) { next(err); }
});

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

router.post('/:id/copy', async (req, res, next) => {
    try {
        const newVersion = await VersionService.copyVersion(req.params.id, req.body);
        res.status(201).json(newVersion);
    } catch(err) {
        next(err);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        res.json(await VersionService.deleteVersion(req.params.id));
    } catch (err) { next(err); }
});

router.get('/all-ids', async (req, res, next) => {
    try {
        const includeDeleted = req.query.includeDeleted === 'true';
        res.json(await VersionService.getAllVersionIds(req.query.search || '', includeDeleted));
    } catch (err) { next(err); }
});

router.post('/delete', async (req, res, next) => {
    try {
        res.json(await VersionService.deleteVersions(req.body.ids));
    } catch (err) { next(err); }
});

router.post('/delete-permanent', async (req, res, next) => {
    try {
        res.json(await VersionService.deletePermanent(req.body.ids));
    } catch (err) { next(err); }
});

router.post('/restore', async (req, res, next) => {
    try {
        res.json(await VersionService.restoreVersions(req.body.ids));
    } catch (err) { next(err); }
});

module.exports = router;